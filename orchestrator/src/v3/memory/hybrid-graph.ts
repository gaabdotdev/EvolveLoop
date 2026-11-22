/**
 * V2-MEM-02 — Hybrid Graph: code deps (static) + relational Decision/Test edges.
 *
 * Nodes: File | Decision | Test | Symbol
 * Edges: DEPENDS_ON | DECIDES | PROTECTS | REFERENCES
 *
 * expandTwoHops answers "which decisions and tests protect this file?" with a
 * deterministic bidirectional BFS capped at 2 hops, ordered stably.
 *
 * Persistence: better-sqlite3 (same stack as MemoryBroker; FTS not required here).
 */

import { mkdirSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import Database from "better-sqlite3";

export const HYBRID_GRAPH_SCHEMA_VERSION = "1";

export const HYBRID_GRAPH_NODE_KINDS = ["File", "Decision", "Test", "Symbol"] as const;
export type HybridGraphNodeKind = (typeof HYBRID_GRAPH_NODE_KINDS)[number];

export const HYBRID_GRAPH_EDGE_TYPES = [
  "DEPENDS_ON",
  "DECIDES",
  "PROTECTS",
  "REFERENCES",
] as const;
export type HybridGraphEdgeType = (typeof HYBRID_GRAPH_EDGE_TYPES)[number];

export const HYBRID_GRAPH_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hybrid_graph_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hybrid_graph_nodes (
  project_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_hybrid_nodes_project_kind
  ON hybrid_graph_nodes (project_id, kind);

CREATE TABLE IF NOT EXISTS hybrid_graph_edges (
  edge_id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  edge_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, from_id, to_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_hybrid_edges_from
  ON hybrid_graph_edges (project_id, from_id);

CREATE INDEX IF NOT EXISTS idx_hybrid_edges_to
  ON hybrid_graph_edges (project_id, to_id);

CREATE INDEX IF NOT EXISTS idx_hybrid_edges_type
  ON hybrid_graph_edges (project_id, edge_type);
`;

export class HybridGraphError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HybridGraphError";
  }
}

export interface HybridGraphNode {
  project_id: string;
  node_id: string;
  kind: HybridGraphNodeKind;
  label: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface HybridGraphEdge {
  edge_id: string;
  project_id: string;
  from_id: string;
  to_id: string;
  edge_type: HybridGraphEdgeType;
  created_at: string;
}

export interface TwoHopHit {
  node_id: string;
  kind: "Decision" | "Test";
  label: string;
  /** Minimum hops from start_file (1 or 2). */
  hops: number;
}

export interface TwoHopExpansion {
  start_file: string;
  start_node_id: string;
  decisions: TwoHopHit[];
  tests: TwoHopHit[];
  /** All Decision|Test hits, hops ASC then node_id ASC. */
  hits: TwoHopHit[];
}

export interface IngestCodeDepsResult {
  file_node_id: string;
  import_node_ids: string[];
  edges: HybridGraphEdge[];
}

export interface LinkDecisionResult {
  decision_node_id: string;
  file_node_ids: string[];
  test_node_ids: string[];
  edges: HybridGraphEdge[];
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Normalize repo-relative paths to POSIX forward slashes without leading ./ */
export function normalizeGraphPath(filePath: string): string {
  const trimmed = filePath.trim().replace(/\\/g, "/");
  if (!trimmed) {
    throw new HybridGraphError("PATH_REQUIRED", "path must be non-empty");
  }
  let p = posix.normalize(trimmed);
  if (p.startsWith("./")) p = p.slice(2);
  if (p === "." || p === "") {
    throw new HybridGraphError("PATH_INVALID", `invalid path: ${filePath}`);
  }
  return p;
}

export function fileNodeId(path: string): string {
  return `File:${normalizeGraphPath(path)}`;
}

export function testNodeId(path: string): string {
  return `Test:${normalizeGraphPath(path)}`;
}

export function decisionNodeId(decisionId: string): string {
  const id = decisionId.trim();
  if (!id) throw new HybridGraphError("DECISION_ID_REQUIRED", "decision_id required");
  return `Decision:${id}`;
}

export function symbolNodeId(symbolKey: string): string {
  const id = symbolKey.trim();
  if (!id) throw new HybridGraphError("SYMBOL_REQUIRED", "symbol key required");
  return `Symbol:${id}`;
}

/**
 * Extract module specifiers from TS/JS source (import/export/require).
 * Deterministic regex parser — no tree-sitter required for unit tests.
 * Relative and bare specifiers are both returned; callers decide filtering.
 */
export function extractImportsFromSource(source: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string | undefined): void => {
    if (!raw) return;
    const spec = raw.trim();
    if (!spec || seen.has(spec)) return;
    seen.add(spec);
    found.push(spec);
  };

  // import … from 'x' | import 'x' | export … from 'x'
  const fromRe =
    /(?:^|[^.\w$])(?:import|export)(?:\s+type)?(?:[\s\w*{}$,]*?\s+from\s*|\s+)['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(source)) !== null) {
    push(m[1]);
  }

  // require('x') / require("x")
  const reqRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = reqRe.exec(source)) !== null) {
    push(m[1]);
  }

  // import('x') dynamic
  const dynRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynRe.exec(source)) !== null) {
    push(m[1]);
  }

  return found;
}

/** Resolve a relative import against the importer path; bare packages → null. */
export function resolveRelativeImport(fromFile: string, specifier: string): string | null {
  const spec = specifier.trim();
  if (!spec.startsWith("./") && !spec.startsWith("../")) return null;
  const fromDir = posix.dirname(normalizeGraphPath(fromFile));
  let resolved = posix.normalize(posix.join(fromDir, spec));
  if (resolved.startsWith("./")) resolved = resolved.slice(2);
  // Drop trailing extension-less ambiguity: keep as written (caller may pass .ts).
  return resolved;
}

export function defaultHybridGraphDbPath(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), ".evolveloop", "hybrid-graph.db");
}

/**
 * Project-scoped hybrid code+decision graph.
 * Cross-project reads/writes throw; all rows are filtered by constructor project_id.
 */
export class HybridGraphStore {
  readonly path: string;
  readonly project_id: string;
  private readonly db: Database.Database;

  constructor(dbPath: string, project_id: string) {
    if (!project_id || !project_id.trim()) {
      throw new HybridGraphError("PROJECT_ID_REQUIRED", "HybridGraphStore requires project_id");
    }
    this.project_id = project_id.trim();
    if (dbPath === ":memory:") {
      this.path = ":memory:";
      this.db = new Database(":memory:");
    } else {
      this.path = resolve(dbPath);
      mkdirSync(dirname(this.path), { recursive: true });
      this.db = new Database(this.path);
    }
    this.db.exec(HYBRID_GRAPH_SCHEMA_SQL);
    this.db
      .prepare(
        `INSERT INTO hybrid_graph_meta(key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(HYBRID_GRAPH_SCHEMA_VERSION);
  }

  close(): void {
    this.db.close();
  }

  private assertProject(project_id: string): void {
    if (project_id !== this.project_id) {
      throw new HybridGraphError(
        "PROJECT_ISOLATION",
        `project_id mismatch: store=${this.project_id} requested=${project_id}`,
      );
    }
  }

  upsertNode(
    kind: HybridGraphNodeKind,
    nodeId: string,
    label: string,
    payload: Record<string, unknown> = {},
  ): HybridGraphNode {
    const created_at = nowIso();
    const payload_json = JSON.stringify(payload ?? {});
    this.db
      .prepare(
        `INSERT INTO hybrid_graph_nodes(project_id, node_id, kind, label, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id, node_id) DO UPDATE SET
           kind = excluded.kind,
           label = excluded.label,
           payload_json = excluded.payload_json`,
      )
      .run(this.project_id, nodeId, kind, label, payload_json, created_at);

    return this.getNode(nodeId)!;
  }

  getNode(nodeId: string): HybridGraphNode | null {
    const row = this.db
      .prepare(
        `SELECT * FROM hybrid_graph_nodes WHERE project_id = ? AND node_id = ?`,
      )
      .get(this.project_id, nodeId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      project_id: String(row.project_id),
      node_id: String(row.node_id),
      kind: row.kind as HybridGraphNodeKind,
      label: String(row.label),
      payload:
        typeof row.payload_json === "string"
          ? (JSON.parse(row.payload_json) as Record<string, unknown>)
          : {},
      created_at: String(row.created_at),
    };
  }

  listNodes(kind?: HybridGraphNodeKind): HybridGraphNode[] {
    const rows = (
      kind
        ? this.db
            .prepare(
              `SELECT * FROM hybrid_graph_nodes
               WHERE project_id = ? AND kind = ?
               ORDER BY node_id ASC`,
            )
            .all(this.project_id, kind)
        : this.db
            .prepare(
              `SELECT * FROM hybrid_graph_nodes
               WHERE project_id = ?
               ORDER BY kind ASC, node_id ASC`,
            )
            .all(this.project_id)
    ) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      project_id: String(row.project_id),
      node_id: String(row.node_id),
      kind: row.kind as HybridGraphNodeKind,
      label: String(row.label),
      payload:
        typeof row.payload_json === "string"
          ? (JSON.parse(row.payload_json) as Record<string, unknown>)
          : {},
      created_at: String(row.created_at),
    }));
  }

  upsertEdge(
    fromId: string,
    toId: string,
    edgeType: HybridGraphEdgeType,
  ): HybridGraphEdge {
    if (!HYBRID_GRAPH_EDGE_TYPES.includes(edgeType)) {
      throw new HybridGraphError("EDGE_TYPE_INVALID", `unknown edge_type: ${edgeType}`);
    }
    const existing = this.db
      .prepare(
        `SELECT * FROM hybrid_graph_edges
         WHERE project_id = ? AND from_id = ? AND to_id = ? AND edge_type = ?`,
      )
      .get(this.project_id, fromId, toId, edgeType) as Record<string, unknown> | undefined;

    if (existing) {
      return {
        edge_id: String(existing.edge_id),
        project_id: String(existing.project_id),
        from_id: String(existing.from_id),
        to_id: String(existing.to_id),
        edge_type: existing.edge_type as HybridGraphEdgeType,
        created_at: String(existing.created_at),
      };
    }

    const edge: HybridGraphEdge = {
      edge_id: `hedge-${randomUUID()}`,
      project_id: this.project_id,
      from_id: fromId,
      to_id: toId,
      edge_type: edgeType,
      created_at: nowIso(),
    };
    this.db
      .prepare(
        `INSERT INTO hybrid_graph_edges(edge_id, project_id, from_id, to_id, edge_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        edge.edge_id,
        edge.project_id,
        edge.from_id,
        edge.to_id,
        edge.edge_type,
        edge.created_at,
      );
    return edge;
  }

  listEdges(): HybridGraphEdge[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM hybrid_graph_edges
         WHERE project_id = ?
         ORDER BY edge_type ASC, from_id ASC, to_id ASC`,
      )
      .all(this.project_id) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      edge_id: String(r.edge_id),
      project_id: String(r.project_id),
      from_id: String(r.from_id),
      to_id: String(r.to_id),
      edge_type: r.edge_type as HybridGraphEdgeType,
      created_at: String(r.created_at),
    }));
  }

  /**
   * Ingest static deps: File(file) -DEPENDS_ON-> File(import) for each import path.
   * Prefer resolved relative paths; bare package names become File nodes as-is when passed.
   */
  ingestCodeDeps(filePath: string, imports: readonly string[]): IngestCodeDepsResult {
    const fileNorm = normalizeGraphPath(filePath);
    const fileId = fileNodeId(fileNorm);
    this.upsertNode("File", fileId, fileNorm, { path: fileNorm });

    const import_node_ids: string[] = [];
    const edges: HybridGraphEdge[] = [];
    const seen = new Set<string>();

    for (const raw of imports) {
      const resolved = resolveRelativeImport(fileNorm, raw) ?? normalizeGraphPath(raw);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      const impId = fileNodeId(resolved);
      this.upsertNode("File", impId, resolved, { path: resolved });
      import_node_ids.push(impId);
      edges.push(this.upsertEdge(fileId, impId, "DEPENDS_ON"));
    }

    import_node_ids.sort((a, b) => a.localeCompare(b));
    edges.sort((a, b) => {
      const c = a.to_id.localeCompare(b.to_id);
      return c !== 0 ? c : a.edge_id.localeCompare(b.edge_id);
    });

    return { file_node_id: fileId, import_node_ids, edges };
  }

  /**
   * Parse source then ingest relative imports only (package imports skipped).
   */
  ingestCodeDepsFromSource(filePath: string, source: string): IngestCodeDepsResult {
    const specs = extractImportsFromSource(source);
    const relative: string[] = [];
    for (const spec of specs) {
      const resolved = resolveRelativeImport(filePath, spec);
      if (resolved) relative.push(resolved);
    }
    return this.ingestCodeDeps(filePath, relative);
  }

  /**
   * Link a decision to files (DECIDES) and tests that protect those files (PROTECTS).
   * Also creates REFERENCES edges Decision → Test for discoverability within 2 hops
   * when only the decision side is traversed via an intermediate file.
   */
  linkDecision(
    decisionId: string,
    filePaths: readonly string[],
    testPaths: readonly string[] = [],
  ): LinkDecisionResult {
    const decId = decisionNodeId(decisionId);
    this.upsertNode("Decision", decId, decisionId.trim(), { decision_id: decisionId.trim() });

    const file_node_ids: string[] = [];
    const test_node_ids: string[] = [];
    const edges: HybridGraphEdge[] = [];
    const fileSeen = new Set<string>();
    const testSeen = new Set<string>();

    const files = [...filePaths].map(normalizeGraphPath).sort((a, b) => a.localeCompare(b));
    const tests = [...testPaths].map(normalizeGraphPath).sort((a, b) => a.localeCompare(b));

    for (const fp of files) {
      if (fileSeen.has(fp)) continue;
      fileSeen.add(fp);
      const fid = fileNodeId(fp);
      this.upsertNode("File", fid, fp, { path: fp });
      file_node_ids.push(fid);
      edges.push(this.upsertEdge(decId, fid, "DECIDES"));
    }

    for (const tp of tests) {
      if (testSeen.has(tp)) continue;
      testSeen.add(tp);
      const tid = testNodeId(tp);
      this.upsertNode("Test", tid, tp, { path: tp });
      test_node_ids.push(tid);
      // Each test protects every linked file (and the decision references the test).
      for (const fid of file_node_ids) {
        edges.push(this.upsertEdge(tid, fid, "PROTECTS"));
      }
      edges.push(this.upsertEdge(decId, tid, "REFERENCES"));
    }

    edges.sort((a, b) => {
      const t = a.edge_type.localeCompare(b.edge_type);
      if (t !== 0) return t;
      const f = a.from_id.localeCompare(b.from_id);
      if (f !== 0) return f;
      return a.to_id.localeCompare(b.to_id);
    });

    return { decision_node_id: decId, file_node_ids, test_node_ids, edges };
  }

  /**
   * Optional Symbol node + REFERENCES edge (File|Decision|Test → Symbol or reverse).
   */
  linkSymbolReference(fromNodeId: string, symbolKey: string): HybridGraphEdge {
    const sid = symbolNodeId(symbolKey);
    this.upsertNode("Symbol", sid, symbolKey.trim(), { symbol: symbolKey.trim() });
    return this.upsertEdge(fromNodeId, sid, "REFERENCES");
  }

  /**
   * Bidirectional BFS ≤ 2 hops from start_file.
   * Returns Decision and Test nodes only; deterministic order: hops ASC, kind ASC, node_id ASC.
   */
  expandTwoHops(startFile: string, opts?: { project_id?: string }): TwoHopExpansion {
    if (opts?.project_id != null) {
      this.assertProject(opts.project_id);
    }

    const startNorm = normalizeGraphPath(startFile);
    const start_node_id = fileNodeId(startNorm);

    const adjacency = this.loadAdjacency();
    const hopsMap = new Map<string, number>();
    hopsMap.set(start_node_id, 0);

    const queue: string[] = [start_node_id];
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++]!;
      const curHops = hopsMap.get(cur)!;
      if (curHops >= 2) continue;
      const neighbors = adjacency.get(cur) ?? [];
      for (const next of neighbors) {
        if (hopsMap.has(next)) continue;
        hopsMap.set(next, curHops + 1);
        queue.push(next);
      }
    }

    const decisions: TwoHopHit[] = [];
    const tests: TwoHopHit[] = [];

    for (const [nodeId, hops] of hopsMap) {
      if (hops < 1 || hops > 2) continue;
      const node = this.getNode(nodeId);
      if (!node) continue;
      if (node.kind === "Decision") {
        decisions.push({
          node_id: node.node_id,
          kind: "Decision",
          label: node.label,
          hops,
        });
      } else if (node.kind === "Test") {
        tests.push({
          node_id: node.node_id,
          kind: "Test",
          label: node.label,
          hops,
        });
      }
    }

    const byStable = (a: TwoHopHit, b: TwoHopHit): number => {
      if (a.hops !== b.hops) return a.hops - b.hops;
      const k = a.kind.localeCompare(b.kind);
      if (k !== 0) return k;
      return a.node_id.localeCompare(b.node_id);
    };
    decisions.sort(byStable);
    tests.sort(byStable);
    const hits = [...decisions, ...tests].sort(byStable);

    return { start_file: startNorm, start_node_id, decisions, tests, hits };
  }

  /** Load undirected adjacency for this project only. */
  private loadAdjacency(): Map<string, string[]> {
    const edges = this.listEdges();
    const map = new Map<string, Set<string>>();
    const add = (a: string, b: string): void => {
      let sa = map.get(a);
      if (!sa) {
        sa = new Set();
        map.set(a, sa);
      }
      sa.add(b);
    };
    for (const e of edges) {
      add(e.from_id, e.to_id);
      add(e.to_id, e.from_id);
    }
    const out = new Map<string, string[]>();
    for (const [k, set] of map) {
      out.set(k, [...set].sort((a, b) => a.localeCompare(b)));
    }
    return out;
  }
}

/** Stable content hash helper for callers that want cache keys over graph snapshots. */
export function hashHybridGraphSnapshot(nodes: HybridGraphNode[], edges: HybridGraphEdge[]): string {
  const payload = JSON.stringify({
    nodes: [...nodes]
      .map((n) => ({ id: n.node_id, kind: n.kind, label: n.label }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges]
      .map((e) => ({ f: e.from_id, t: e.to_id, ty: e.edge_type }))
      .sort((a, b) => `${a.ty}|${a.f}|${a.t}`.localeCompare(`${b.ty}|${b.f}|${b.t}`)),
  });
  return createHash("sha256").update(payload).digest("hex");
}
