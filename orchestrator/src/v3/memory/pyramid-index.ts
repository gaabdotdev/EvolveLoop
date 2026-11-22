/**
 * V3-MEM-02 — Hierarchical Pyramid Index (RAPTOR-style).
 *
 * Levels:
 *   N0 Bruto → N1 Episódico → N2 Módulo/Marco → N3 Projeto
 *
 * Retrieval is coarse-to-fine: score N3/N2 first, then refine into children
 * down to N0. Summaries are extractive/heuristic (no LLM) so the index stays
 * deterministic and offline-testable.
 */

import { createHash } from "node:crypto";

/** Schema version for optional future persistence of pyramid nodes. */
export const PYRAMID_SCHEMA_VERSION = "1";

/**
 * Disk persistence status for the pyramid index (AUD-STUB-02).
 * Canonical runtime is `InMemoryPyramidIndex` (Map); SQLite sketch below is NOT wired.
 * Do not treat this module as durable storage.
 */
export const PYRAMID_DISK_PERSISTENCE = "NÃO_HABILITADO" as const;

export const PYRAMID_LEVELS = [0, 1, 2, 3] as const;
export type PyramidLevel = (typeof PYRAMID_LEVELS)[number];

export const PYRAMID_LEVEL_LABELS: Readonly<Record<PyramidLevel, string>> = {
  0: "bruto",
  1: "episodico",
  2: "modulo_marco",
  3: "projeto",
} as const;

/**
 * Minimal SQL sketch for a *future* durable pyramid — NOT executed at runtime.
 * Canonical store today is in-memory (`InMemoryPyramidIndex`); see PYRAMID_DISK_PERSISTENCE.
 */
export const PYRAMID_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS pyramid_nodes (
  node_id TEXT PRIMARY KEY NOT NULL,
  level INTEGER NOT NULL CHECK (level BETWEEN 0 AND 3),
  summary TEXT NOT NULL,
  parent_id TEXT,
  project_id TEXT NOT NULL,
  module_id TEXT,
  event_ids_json TEXT NOT NULL DEFAULT '[]',
  child_ids_json TEXT NOT NULL DEFAULT '[]',
  token_bag TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pyramid_level ON pyramid_nodes (level);
CREATE INDEX IF NOT EXISTS idx_pyramid_parent ON pyramid_nodes (parent_id);
`;

export class PyramidIndexError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PyramidIndexError";
  }
}

/** Leaf input event (N0 raw). */
export interface PyramidEvent {
  event_id: string;
  text: string;
  /** ISO-8601; used for episodic bucketing when present. */
  timestamp?: string;
  /** Module / milestone key for N2 grouping. */
  module?: string;
  project_id?: string;
  tags?: string[];
  payload?: Record<string, unknown>;
}

export interface PyramidNode {
  node_id: string;
  level: PyramidLevel;
  summary: string;
  parent_id: string | null;
  child_ids: string[];
  /** Event ids covered by this subtree (N0: single event). */
  event_ids: string[];
  project_id: string;
  module_id: string | null;
  /** Lowercased unique tokens for lexical scoring. */
  tokens: string[];
  created_at: string;
}

export interface BuildPyramidOptions {
  /** Max N0 events per N1 episodic node. Default 8. */
  episodeSize?: number;
  /** Prefer calendar-day buckets when timestamps exist. Default true. */
  bucketByDay?: boolean;
  /** Default project when events omit project_id. */
  defaultProjectId?: string;
}

export interface PyramidBuildStats {
  events: number;
  nodes_total: number;
  by_level: Record<PyramidLevel, number>;
}

export interface PyramidIndexSnapshot {
  nodes: PyramidNode[];
  stats: PyramidBuildStats;
  schema_version: string;
}

export interface CoarseToFineOptions {
  /** Candidates retained at each descent step. Default 4. */
  beamWidth?: number;
  /** Max N0 (or deepest) hits returned. Default 10. */
  topK?: number;
  /** Stop refinement at this level (default 0). */
  floorLevel?: PyramidLevel;
}

export interface CoarseToFinePathStep {
  level: PyramidLevel;
  label: string;
  selected: Array<{ node_id: string; score: number; summary: string }>;
}

export interface CoarseToFineHit {
  node_id: string;
  level: PyramidLevel;
  score: number;
  summary: string;
  event_ids: string[];
  parent_id: string | null;
}

export interface CoarseToFineResult {
  query: string;
  hits: CoarseToFineHit[];
  path: CoarseToFinePathStep[];
  /** Wall-clock ms for this search (real measurement). */
  latency_ms: number;
  nodes_scored: number;
}

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "is",
  "are",
  "was",
  "were",
  "be",
  "as",
  "at",
  "by",
  "with",
  "from",
  "this",
  "that",
  "it",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "um",
  "uma",
  "o",
  "os",
  "as",
  "e",
  "em",
  "no",
  "na",
  "para",
  "por",
]);

export function tokenizePyramidText(text: string): string[] {
  const raw = text
    .toLowerCase()
    .split(/[^a-z0-9_\u00c0-\u024f]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function stableId(prefix: string, parts: string[]): string {
  const h = createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 16);
  return `${prefix}_${h}`;
}

function dayKey(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return null;
  return new Date(d).toISOString().slice(0, 10);
}

function mergeTokens(children: PyramidNode[], maxTokens = 64): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of children) {
    for (const t of c.tokens) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      if (out.length >= maxTokens) return out;
    }
  }
  return out;
}

function summarizeChildren(label: string, children: PyramidNode[], maxChars = 280): string {
  const keywords = mergeTokens(children, 24).join(" ");
  const cover = children.reduce((n, c) => n + c.event_ids.length, 0);
  const base = `${label} (${children.length} children, ${cover} events): ${keywords}`;
  return base.length > maxChars ? `${base.slice(0, maxChars - 3)}...` : base;
}

function scoreTokens(queryTokens: string[], nodeTokens: ReadonlySet<string>): number {
  if (queryTokens.length === 0) return 0;
  let hit = 0;
  for (const t of queryTokens) {
    if (nodeTokens.has(t)) hit += 1;
  }
  // Prefer denser matches lightly by unique coverage.
  return hit / queryTokens.length + hit * 0.01;
}

export interface PyramidIndex {
  readonly schema_version: string;
  buildPyramid(events: PyramidEvent[], options?: BuildPyramidOptions): PyramidBuildStats;
  searchCoarseToFine(query: string, options?: CoarseToFineOptions): CoarseToFineResult;
  getNode(node_id: string): PyramidNode | undefined;
  listByLevel(level: PyramidLevel): PyramidNode[];
  snapshot(): PyramidIndexSnapshot;
  clear(): void;
  /** Total nodes currently indexed. */
  size(): number;
}

/**
 * In-memory RAPTOR-style pyramid with inverted token index per level.
 */
export class InMemoryPyramidIndex implements PyramidIndex {
  readonly schema_version = PYRAMID_SCHEMA_VERSION;

  private nodes = new Map<string, PyramidNode>();
  private byLevel: Record<PyramidLevel, string[]> = { 0: [], 1: [], 2: [], 3: [] };
  /** level → token → node_ids */
  private inverted: Record<PyramidLevel, Map<string, Set<string>>> = {
    0: new Map(),
    1: new Map(),
    2: new Map(),
    3: new Map(),
  };

  clear(): void {
    this.nodes.clear();
    this.byLevel = { 0: [], 1: [], 2: [], 3: [] };
    this.inverted = { 0: new Map(), 1: new Map(), 2: new Map(), 3: new Map() };
  }

  size(): number {
    return this.nodes.size;
  }

  getNode(node_id: string): PyramidNode | undefined {
    return this.nodes.get(node_id);
  }

  listByLevel(level: PyramidLevel): PyramidNode[] {
    return this.byLevel[level].map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  snapshot(): PyramidIndexSnapshot {
    const by_level = {
      0: this.byLevel[0].length,
      1: this.byLevel[1].length,
      2: this.byLevel[2].length,
      3: this.byLevel[3].length,
    } as Record<PyramidLevel, number>;
    return {
      nodes: [...this.nodes.values()].sort((a, b) =>
        a.level !== b.level ? a.level - b.level : a.node_id.localeCompare(b.node_id),
      ),
      stats: {
        events: by_level[0],
        nodes_total: this.nodes.size,
        by_level,
      },
      schema_version: this.schema_version,
    };
  }

  private register(node: PyramidNode): void {
    if (this.nodes.has(node.node_id)) {
      throw new PyramidIndexError("DUPLICATE_NODE", `node already exists: ${node.node_id}`);
    }
    this.nodes.set(node.node_id, node);
    this.byLevel[node.level].push(node.node_id);
    const inv = this.inverted[node.level];
    for (const t of node.tokens) {
      let set = inv.get(t);
      if (!set) {
        set = new Set();
        inv.set(t, set);
      }
      set.add(node.node_id);
    }
  }

  private linkParent(parent: PyramidNode, child: PyramidNode): void {
    parent.child_ids.push(child.node_id);
    child.parent_id = parent.node_id;
  }

  buildPyramid(events: PyramidEvent[], options: BuildPyramidOptions = {}): PyramidBuildStats {
    this.clear();
    const episodeSize = Math.max(1, options.episodeSize ?? 8);
    const bucketByDay = options.bucketByDay !== false;
    const defaultProjectId = options.defaultProjectId ?? "default";

    if (!Array.isArray(events) || events.length === 0) {
      return { events: 0, nodes_total: 0, by_level: { 0: 0, 1: 0, 2: 0, 3: 0 } };
    }

    const sorted = [...events].sort((a, b) => {
      const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
      const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
      if (ta !== tb) return ta - tb;
      return a.event_id.localeCompare(b.event_id);
    });

    const seenIds = new Set<string>();
    const n0: PyramidNode[] = [];

    for (const ev of sorted) {
      if (!ev.event_id || !ev.text?.trim()) {
        throw new PyramidIndexError("INVALID_EVENT", "event_id and non-empty text are required");
      }
      if (seenIds.has(ev.event_id)) {
        throw new PyramidIndexError("DUPLICATE_EVENT", `duplicate event_id: ${ev.event_id}`);
      }
      seenIds.add(ev.event_id);

      const project_id = ev.project_id?.trim() || defaultProjectId;
      const module_id = (ev.module?.trim() || "default").toLowerCase();
      const created_at = ev.timestamp ?? new Date(0).toISOString();
      const tagText = (ev.tags ?? []).join(" ");
      const summary = ev.text.trim();
      const tokens = tokenizePyramidText(`${summary} ${tagText} ${module_id}`);

      const node: PyramidNode = {
        node_id: stableId("n0", [project_id, ev.event_id]),
        level: 0,
        summary,
        parent_id: null,
        child_ids: [],
        event_ids: [ev.event_id],
        project_id,
        module_id,
        tokens,
        created_at,
      };
      this.register(node);
      n0.push(node);
    }

    // N1 episodic: day buckets when possible, else fixed-size chunks per (project, module).
    const n1: PyramidNode[] = [];
    const byProjMod = new Map<string, PyramidNode[]>();
    for (const leaf of n0) {
      const key = `${leaf.project_id}::${leaf.module_id ?? "default"}`;
      let arr = byProjMod.get(key);
      if (!arr) {
        arr = [];
        byProjMod.set(key, arr);
      }
      arr.push(leaf);
    }

    for (const [key, leaves] of [...byProjMod.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const [project_id, module_id] = key.split("::") as [string, string];
      const groups: PyramidNode[][] = [];

      if (bucketByDay && leaves.some((l) => dayKey(l.created_at))) {
        const days = new Map<string, PyramidNode[]>();
        for (const leaf of leaves) {
          const dk = dayKey(leaf.created_at) ?? "undated";
          let g = days.get(dk);
          if (!g) {
            g = [];
            days.set(dk, g);
          }
          g.push(leaf);
        }
        for (const [, g] of [...days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
          for (let i = 0; i < g.length; i += episodeSize) {
            groups.push(g.slice(i, i + episodeSize));
          }
        }
      } else {
        for (let i = 0; i < leaves.length; i += episodeSize) {
          groups.push(leaves.slice(i, i + episodeSize));
        }
      }

      let epiIdx = 0;
      for (const group of groups) {
        const tokens = mergeTokens(group);
        const summary = summarizeChildren(
          `Episode ${module_id}#${epiIdx}`,
          group,
        );
        const node: PyramidNode = {
          node_id: stableId("n1", [project_id, module_id, String(epiIdx), group[0]!.event_ids[0]!]),
          level: 1,
          summary,
          parent_id: null,
          child_ids: [],
          event_ids: group.flatMap((c) => c.event_ids),
          project_id,
          module_id,
          tokens,
          created_at: group[0]!.created_at,
        };
        this.register(node);
        for (const child of group) this.linkParent(node, child);
        n1.push(node);
        epiIdx += 1;
      }
    }

    // N2 module/marco: one node per (project, module) aggregating N1.
    const n2: PyramidNode[] = [];
    const n1ByMod = new Map<string, PyramidNode[]>();
    for (const epi of n1) {
      const key = `${epi.project_id}::${epi.module_id ?? "default"}`;
      let arr = n1ByMod.get(key);
      if (!arr) {
        arr = [];
        n1ByMod.set(key, arr);
      }
      arr.push(epi);
    }

    for (const [key, epis] of [...n1ByMod.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const [project_id, module_id] = key.split("::") as [string, string];
      const tokens = mergeTokens(epis);
      const summary = summarizeChildren(`Module/Marco ${module_id}`, epis);
      const node: PyramidNode = {
        node_id: stableId("n2", [project_id, module_id]),
        level: 2,
        summary,
        parent_id: null,
        child_ids: [],
        event_ids: epis.flatMap((c) => c.event_ids),
        project_id,
        module_id,
        tokens,
        created_at: epis[0]!.created_at,
      };
      this.register(node);
      for (const child of epis) this.linkParent(node, child);
      n2.push(node);
    }

    // N3 project: one root per project_id.
    const n2ByProj = new Map<string, PyramidNode[]>();
    for (const mod of n2) {
      let arr = n2ByProj.get(mod.project_id);
      if (!arr) {
        arr = [];
        n2ByProj.set(mod.project_id, arr);
      }
      arr.push(mod);
    }

    for (const [project_id, mods] of [...n2ByProj.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const tokens = mergeTokens(mods, 96);
      const summary = summarizeChildren(`Project ${project_id}`, mods, 360);
      const node: PyramidNode = {
        node_id: stableId("n3", [project_id]),
        level: 3,
        summary,
        parent_id: null,
        child_ids: [],
        event_ids: mods.flatMap((c) => c.event_ids),
        project_id,
        module_id: null,
        tokens,
        created_at: mods[0]!.created_at,
      };
      this.register(node);
      for (const child of mods) this.linkParent(node, child);
    }

    return this.snapshot().stats;
  }

  /**
   * Candidate set for a level: union of inverted lists for query tokens,
   * falling back to full level scan when the query has no tokens.
   */
  private candidates(level: PyramidLevel, queryTokens: string[], restrictTo?: Set<string>): string[] {
    const inv = this.inverted[level];
    let ids: Set<string>;
    if (queryTokens.length === 0) {
      ids = new Set(this.byLevel[level]);
    } else {
      ids = new Set<string>();
      for (const t of queryTokens) {
        const bucket = inv.get(t);
        if (!bucket) continue;
        for (const id of bucket) ids.add(id);
      }
      // If no inverted hit, fall back to full level (still refine via restrictTo).
      if (ids.size === 0) ids = new Set(this.byLevel[level]);
    }
    if (restrictTo) {
      const filtered: string[] = [];
      for (const id of ids) {
        if (restrictTo.has(id)) filtered.push(id);
      }
      return filtered;
    }
    return [...ids];
  }

  private rankLevel(
    level: PyramidLevel,
    queryTokens: string[],
    restrictTo: Set<string> | undefined,
    beamWidth: number,
  ): { ranked: Array<{ node: PyramidNode; score: number }>; scored: number } {
    const cand = this.candidates(level, queryTokens, restrictTo);
    const scored: Array<{ node: PyramidNode; score: number }> = [];
    for (const id of cand) {
      const node = this.nodes.get(id);
      if (!node) continue;
      const score = scoreTokens(queryTokens, new Set(node.tokens));
      if (score <= 0 && queryTokens.length > 0) continue;
      scored.push({ node, score });
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.node.node_id.localeCompare(b.node.node_id);
    });
    return { ranked: scored.slice(0, beamWidth), scored: cand.length };
  }

  searchCoarseToFine(query: string, options: CoarseToFineOptions = {}): CoarseToFineResult {
    const started = performance.now();
    const q = (query ?? "").trim();
    if (!q) {
      throw new PyramidIndexError("EMPTY_QUERY", "query must be non-empty");
    }
    if (this.nodes.size === 0) {
      return {
        query: q,
        hits: [],
        path: [],
        latency_ms: performance.now() - started,
        nodes_scored: 0,
      };
    }

    const beamWidth = Math.max(1, options.beamWidth ?? 4);
    const topK = Math.max(1, options.topK ?? 10);
    const floorLevel = options.floorLevel ?? 0;
    if (floorLevel < 0 || floorLevel > 3) {
      throw new PyramidIndexError("INVALID_FLOOR", `floorLevel must be 0..3; got ${floorLevel}`);
    }

    const queryTokens = tokenizePyramidText(q);
    const path: CoarseToFinePathStep[] = [];
    let nodes_scored = 0;

    // Start coarse at N3; if empty, fall through to N2.
    let frontierIds: Set<string> | undefined;
    let startLevel: PyramidLevel = 3;
    if (this.byLevel[3].length === 0) startLevel = 2;
    if (this.byLevel[startLevel].length === 0 && this.byLevel[1].length > 0) startLevel = 1;
    if (this.byLevel[startLevel].length === 0) startLevel = 0;

    for (let level = startLevel; level >= floorLevel; level -= 1) {
      const lvl = level as PyramidLevel;
      const { ranked, scored } = this.rankLevel(lvl, queryTokens, frontierIds, beamWidth);
      nodes_scored += scored;
      path.push({
        level: lvl,
        label: PYRAMID_LEVEL_LABELS[lvl],
        selected: ranked.map((r) => ({
          node_id: r.node.node_id,
          score: r.score,
          summary: r.node.summary.slice(0, 120),
        })),
      });

      if (lvl === floorLevel) {
        const hits: CoarseToFineHit[] = ranked.slice(0, topK).map((r) => ({
          node_id: r.node.node_id,
          level: r.node.level,
          score: r.score,
          summary: r.node.summary,
          event_ids: [...r.node.event_ids],
          parent_id: r.node.parent_id,
        }));
        return {
          query: q,
          hits,
          path,
          latency_ms: performance.now() - started,
          nodes_scored,
        };
      }

      // Next frontier = children of selected beam.
      const next = new Set<string>();
      for (const r of ranked) {
        for (const cid of r.node.child_ids) next.add(cid);
      }
      // If beam had no children (orphans), stop early with current hits.
      if (next.size === 0) {
        const hits: CoarseToFineHit[] = ranked.slice(0, topK).map((r) => ({
          node_id: r.node.node_id,
          level: r.node.level,
          score: r.score,
          summary: r.node.summary,
          event_ids: [...r.node.event_ids],
          parent_id: r.node.parent_id,
        }));
        return {
          query: q,
          hits,
          path,
          latency_ms: performance.now() - started,
          nodes_scored,
        };
      }
      frontierIds = next;
    }

    return {
      query: q,
      hits: [],
      path,
      latency_ms: performance.now() - started,
      nodes_scored,
    };
  }
}

/** Convenience: build + return index. */
export function buildPyramid(
  events: PyramidEvent[],
  options?: BuildPyramidOptions,
): { index: InMemoryPyramidIndex; stats: PyramidBuildStats } {
  const index = new InMemoryPyramidIndex();
  const stats = index.buildPyramid(events, options);
  return { index, stats };
}

export function searchCoarseToFine(
  index: PyramidIndex,
  query: string,
  options?: CoarseToFineOptions,
): CoarseToFineResult {
  return index.searchCoarseToFine(query, options);
}

/** Percentile helper for latency benches (nearest-rank). */
export function percentileNearest(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  const clamped = Math.min(100, Math.max(0, p));
  const rank = Math.ceil((clamped / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.max(0, Math.min(sortedAsc.length - 1, rank))]!;
}
