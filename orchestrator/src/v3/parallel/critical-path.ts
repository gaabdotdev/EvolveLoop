/**
 * V3-ORCH-01 — Critical-Path scheduling + prefetch of next-node setup
 * (worktree / deps / LSP index stubs) during VALIDATING of the current node.
 *
 * Deterministic CPM on a DAG (longest weighted path). Prefetch writes
 * deterministic stub artifacts only — no real git worktree / npm / LSP.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const CRITICAL_PATH_SCHEMA_VERSION = "1" as const;

/** Node lifecycle phase relevant to the prefetch hook. */
export type CriticalPathPhase =
  | "PENDING"
  | "RUNNING"
  | "VALIDATING"
  | "DONE"
  | "FAILED";

export type PrefetchArtifactKind = "worktree" | "deps" | "lsp_index";

export interface CriticalPathNode {
  id: string;
  depends_on: string[];
  /** Estimated exclusive work duration (ms). Must be >= 0. */
  duration_ms: number;
  /**
   * Cold setup cost (worktree + deps + LSP index) paid when starting
   * without a prior prefetch hit. Default 0.
   */
  setup_ms?: number;
  /**
   * Warm setup cost when prefetch stubs already exist. Default 0.
   * Should be <= setup_ms.
   */
  setup_prefetched_ms?: number;
}

export interface CriticalPathDag {
  nodes: CriticalPathNode[];
}

export interface CriticalPathResult {
  kind: "CriticalPathResult";
  schema_version: typeof CRITICAL_PATH_SCHEMA_VERSION;
  /** One critical path (source → sink), node ids. */
  path: string[];
  /** Sum of duration_ms along `path` (setup excluded — CP is work-critical). */
  length_ms: number;
  earliest_start_ms: Record<string, number>;
  earliest_finish_ms: Record<string, number>;
  latest_start_ms: Record<string, number>;
  latest_finish_ms: Record<string, number>;
  slack_ms: Record<string, number>;
  /** Nodes with zero slack (may include parallel critical branches). */
  critical_node_ids: string[];
}

export interface PrefetchHookInput {
  current_node_id: string;
  /** Prefetch is only armed during VALIDATING. */
  phase: CriticalPathPhase;
  dag: CriticalPathDag;
  /** Directory where deterministic stubs are written. */
  prefetch_root: string;
  /**
   * Prefer the next unfinished successor on the critical path.
   * Falls back to lexicographically first unfinished successor.
   * Default true.
   */
  prefer_critical_path?: boolean;
}

export interface PrefetchArtifact {
  kind: PrefetchArtifactKind;
  node_id: string;
  path: string;
  /** sha256 of stub body (deterministic). */
  content_sha256: string;
  ready: boolean;
}

export interface PrefetchResult {
  kind: "PrefetchResult";
  schema_version: typeof CRITICAL_PATH_SCHEMA_VERSION;
  triggered_during: "VALIDATING" | "SKIPPED";
  current_node_id: string;
  next_node_id: string | null;
  /** True when stubs for `next_node_id` exist before that node starts RUNNING. */
  ahead: boolean;
  artifacts: PrefetchArtifact[];
  skipped_reason?: string;
}

export type SchedulePolicy = "fifo" | "critical_path";

export interface SimulateWallClockOptions {
  policy: SchedulePolicy;
  max_concurrent: number;
  /**
   * VALIDATING window (ms) after work completes — prefetch runs here and
   * overlaps with remaining setup of the next node when enabled.
   */
  validating_ms?: number;
  /** When true, prefetchNext stubs reduce next-node setup to setup_prefetched_ms. */
  enable_prefetch?: boolean;
  /** Optional stable FIFO key override (defaults to node id). */
  fifo_order?: string[];
}

export interface SimulatedNodeTrace {
  id: string;
  start_ms: number;
  setup_ms_paid: number;
  work_end_ms: number;
  validating_end_ms: number;
  prefetched: boolean;
}

export interface SimulateWallClockResult {
  kind: "SimulateWallClockResult";
  schema_version: typeof CRITICAL_PATH_SCHEMA_VERSION;
  policy: SchedulePolicy;
  wall_clock_ms: number;
  prefetch_hits: number;
  prefetch_ahead_events: number;
  order_started: string[];
  traces: SimulatedNodeTrace[];
  critical_path: string[];
}

export class CriticalPathError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "CriticalPathError";
  }
}

const PREFETCH_KINDS: readonly PrefetchArtifactKind[] = [
  "worktree",
  "deps",
  "lsp_index",
];

function assertAcyclicTopo(nodes: CriticalPathNode[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (byId.size !== nodes.length) {
    throw new CriticalPathError("DUPLICATE_NODE", "DAG has duplicate node ids");
  }
  for (const n of nodes) {
    if (!(Number.isFinite(n.duration_ms) && n.duration_ms >= 0)) {
      throw new CriticalPathError(
        "BAD_DURATION",
        `node '${n.id}' duration_ms must be finite >= 0`,
      );
    }
    for (const dep of n.depends_on) {
      if (!byId.has(dep)) {
        throw new CriticalPathError(
          "MISSING_DEP",
          `node '${n.id}' depends on missing '${dep}'`,
        );
      }
    }
  }

  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    indegree.set(n.id, 0);
    children.set(n.id, []);
  }
  for (const n of nodes) {
    for (const dep of n.depends_on) {
      indegree.set(n.id, (indegree.get(n.id) ?? 0) + 1);
      children.get(dep)!.push(n.id);
    }
  }

  const queue = [...nodes.map((n) => n.id)]
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort((a, b) => a.localeCompare(b));
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    const next = (children.get(id) ?? []).slice().sort((a, b) => a.localeCompare(b));
    for (const child of next) {
      const d = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, d);
      if (d === 0) queue.push(child);
    }
    queue.sort((a, b) => a.localeCompare(b));
  }
  if (order.length !== nodes.length) {
    throw new CriticalPathError("CYCLE", "DAG has a cycle");
  }
  return order;
}

function childrenOf(
  nodes: CriticalPathNode[],
): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const n of nodes) children.set(n.id, []);
  for (const n of nodes) {
    for (const dep of n.depends_on) {
      children.get(dep)!.push(n.id);
    }
  }
  for (const [, kids] of children) kids.sort((a, b) => a.localeCompare(b));
  return children;
}

/**
 * Classic CPM: forward earliest times, backward latest times, zero-slack path.
 * When multiple critical paths exist, picks the lexicographically smallest
 * sink-to-source backtrack (deterministic).
 */
export function computeCriticalPath(dag: CriticalPathDag): CriticalPathResult {
  const nodes = dag.nodes;
  const order = assertAcyclicTopo(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = childrenOf(nodes);

  const earliest_start_ms: Record<string, number> = {};
  const earliest_finish_ms: Record<string, number> = {};

  for (const id of order) {
    const n = byId.get(id)!;
    let es = 0;
    for (const dep of n.depends_on) {
      es = Math.max(es, earliest_finish_ms[dep] ?? 0);
    }
    earliest_start_ms[id] = es;
    earliest_finish_ms[id] = es + n.duration_ms;
  }

  const project_ms = Math.max(0, ...Object.values(earliest_finish_ms), 0);

  const latest_finish_ms: Record<string, number> = {};
  const latest_start_ms: Record<string, number> = {};
  const reverse = [...order].reverse();
  for (const id of reverse) {
    const n = byId.get(id)!;
    const kids = children.get(id) ?? [];
    let lf = project_ms;
    if (kids.length > 0) {
      lf = Math.min(...kids.map((k) => latest_start_ms[k]!));
    }
    latest_finish_ms[id] = lf;
    latest_start_ms[id] = lf - n.duration_ms;
  }

  const slack_ms: Record<string, number> = {};
  const critical_node_ids: string[] = [];
  for (const id of order) {
    const slack = (latest_start_ms[id] ?? 0) - (earliest_start_ms[id] ?? 0);
    // Float-safe: durations are integers in practice; still clamp tiny eps.
    const s = Math.abs(slack) < 1e-9 ? 0 : slack;
    slack_ms[id] = s;
    if (s === 0) critical_node_ids.push(id);
  }

  // Reconstruct one critical path: start from a source with slack 0 and
  // always step to the lex-smallest critical successor that preserves EF chain.
  const sources = order.filter(
    (id) => (byId.get(id)!.depends_on.length === 0) && slack_ms[id] === 0,
  );
  let cursor =
    sources.sort((a, b) => a.localeCompare(b))[0] ??
    critical_node_ids.slice().sort((a, b) => a.localeCompare(b))[0];
  const path: string[] = [];
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    path.push(cursor);
    const nextCrit = (children.get(cursor) ?? []).filter(
      (k) =>
        slack_ms[k] === 0 &&
        (earliest_start_ms[k] ?? 0) === (earliest_finish_ms[cursor!] ?? 0),
    );
    cursor = nextCrit.sort((a, b) => a.localeCompare(b))[0];
  }

  const length_ms = path.reduce(
    (acc, id) => acc + (byId.get(id)?.duration_ms ?? 0),
    0,
  );

  return {
    kind: "CriticalPathResult",
    schema_version: CRITICAL_PATH_SCHEMA_VERSION,
    path,
    length_ms,
    earliest_start_ms,
    earliest_finish_ms,
    latest_start_ms,
    latest_finish_ms,
    slack_ms,
    critical_node_ids,
  };
}

function stubFileName(kind: PrefetchArtifactKind): string {
  switch (kind) {
    case "worktree":
      return "worktree.stub.json";
    case "deps":
      return "deps.stub.json";
    case "lsp_index":
      return "lsp_index.stub.json";
  }
}

function stubBody(nodeId: string, kind: PrefetchArtifactKind): string {
  // Stable JSON — no timestamps — so sha256 is deterministic across runs.
  return `${JSON.stringify(
    {
      kind,
      node_id: nodeId,
      prepared: true,
      schema_version: CRITICAL_PATH_SCHEMA_VERSION,
      stub: true,
    },
    null,
    2,
  )}\n`;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function prefetchArtifactPaths(
  prefetchRoot: string,
  nodeId: string,
): Record<PrefetchArtifactKind, string> {
  const dir = join(prefetchRoot, nodeId);
  return {
    worktree: join(dir, stubFileName("worktree")),
    deps: join(dir, stubFileName("deps")),
    lsp_index: join(dir, stubFileName("lsp_index")),
  };
}

export function isNodePrefetched(prefetchRoot: string, nodeId: string): boolean {
  const paths = prefetchArtifactPaths(prefetchRoot, nodeId);
  return PREFETCH_KINDS.every((k) => existsSync(paths[k]));
}

/**
 * During VALIDATING of `current_node_id`, prepare deterministic stubs for the
 * next successor (critical-path preferred). No-op outside VALIDATING.
 */
export function prefetchNext(input: PrefetchHookInput): PrefetchResult {
  const preferCp = input.prefer_critical_path !== false;

  if (input.phase !== "VALIDATING") {
    return {
      kind: "PrefetchResult",
      schema_version: CRITICAL_PATH_SCHEMA_VERSION,
      triggered_during: "SKIPPED",
      current_node_id: input.current_node_id,
      next_node_id: null,
      ahead: false,
      artifacts: [],
      skipped_reason: `phase=${input.phase}; prefetch only runs during VALIDATING`,
    };
  }

  const byId = new Map(input.dag.nodes.map((n) => [n.id, n]));
  if (!byId.has(input.current_node_id)) {
    throw new CriticalPathError(
      "UNKNOWN_NODE",
      `current_node_id '${input.current_node_id}' not in DAG`,
    );
  }

  const cp = computeCriticalPath(input.dag);
  const children = childrenOf(input.dag.nodes);
  const successors = children.get(input.current_node_id) ?? [];

  if (successors.length === 0) {
    return {
      kind: "PrefetchResult",
      schema_version: CRITICAL_PATH_SCHEMA_VERSION,
      triggered_during: "VALIDATING",
      current_node_id: input.current_node_id,
      next_node_id: null,
      ahead: false,
      artifacts: [],
      skipped_reason: "no successors to prefetch",
    };
  }

  let next: string | undefined;
  if (preferCp) {
    const idx = cp.path.indexOf(input.current_node_id);
    if (idx >= 0 && idx + 1 < cp.path.length) {
      const cand = cp.path[idx + 1]!;
      if (successors.includes(cand)) next = cand;
    }
    if (!next) {
      next = successors
        .filter((s) => cp.critical_node_ids.includes(s))
        .sort((a, b) => a.localeCompare(b))[0];
    }
  }
  if (!next) {
    next = [...successors].sort((a, b) => a.localeCompare(b))[0];
  }

  mkdirSync(join(input.prefetch_root, next), { recursive: true });
  const artifacts: PrefetchArtifact[] = [];
  for (const kind of PREFETCH_KINDS) {
    const body = stubBody(next, kind);
    const path = prefetchArtifactPaths(input.prefetch_root, next)[kind];
    writeFileSync(path, body, "utf8");
    artifacts.push({
      kind,
      node_id: next,
      path,
      content_sha256: sha256(body),
      ready: true,
    });
  }

  return {
    kind: "PrefetchResult",
    schema_version: CRITICAL_PATH_SCHEMA_VERSION,
    triggered_during: "VALIDATING",
    current_node_id: input.current_node_id,
    next_node_id: next,
    ahead: true,
    artifacts,
  };
}

/**
 * Rank ready node ids: critical-path policy prefers least slack, then
 * remaining path length (EF chain), then id. FIFO uses provided order or id.
 */
export function rankReadyNodes(
  readyIds: string[],
  dag: CriticalPathDag,
  policy: SchedulePolicy,
  fifoOrder?: string[],
): string[] {
  if (readyIds.length <= 1) return [...readyIds];
  if (policy === "fifo") {
    if (fifoOrder && fifoOrder.length > 0) {
      const rank = new Map(fifoOrder.map((id, i) => [id, i]));
      return [...readyIds].sort((a, b) => {
        const ra = rank.has(a) ? rank.get(a)! : Number.MAX_SAFE_INTEGER;
        const rb = rank.has(b) ? rank.get(b)! : Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        return a.localeCompare(b);
      });
    }
    return [...readyIds].sort((a, b) => a.localeCompare(b));
  }

  const cp = computeCriticalPath(dag);
  const byId = new Map(dag.nodes.map((n) => [n.id, n]));
  // Remaining critical contribution ≈ duration + max successor remaining.
  const remaining = new Map<string, number>();
  const order = assertAcyclicTopo(dag.nodes);
  const children = childrenOf(dag.nodes);
  for (const id of [...order].reverse()) {
    const n = byId.get(id)!;
    const kids = children.get(id) ?? [];
    const childRem =
      kids.length === 0
        ? 0
        : Math.max(...kids.map((k) => remaining.get(k) ?? 0));
    remaining.set(id, n.duration_ms + childRem);
  }

  return [...readyIds].sort((a, b) => {
    const sa = cp.slack_ms[a] ?? Number.MAX_SAFE_INTEGER;
    const sb = cp.slack_ms[b] ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    const ra = remaining.get(a) ?? 0;
    const rb = remaining.get(b) ?? 0;
    if (ra !== rb) return rb - ra;
    return a.localeCompare(b);
  });
}

/**
 * Discrete-event wall-clock simulation of a synthetic DAG under FIFO vs
 * critical-path priority, with optional VALIDATING-window prefetch.
 */
export function simulateDagWallClock(
  dag: CriticalPathDag,
  opts: SimulateWallClockOptions,
): SimulateWallClockResult {
  const validating_ms = Math.max(0, opts.validating_ms ?? 0);
  const enable_prefetch = opts.enable_prefetch === true;
  const max_concurrent = Math.max(1, Math.floor(opts.max_concurrent));
  const cp = computeCriticalPath(dag);
  const byId = new Map(dag.nodes.map((n) => [n.id, n]));
  const done = new Set<string>();
  const started = new Set<string>();
  const prefetched = new Set<string>();
  const order_started: string[] = [];
  const traces: SimulatedNodeTrace[] = [];
  let prefetch_hits = 0;
  let prefetch_ahead_events = 0;

  type Active = {
    id: string;
    start_ms: number;
    work_end: number;
    validating_end: number;
    setup_paid: number;
    was_prefetched: boolean;
    prefetch_armed: boolean;
  };
  const active: Active[] = [];
  let now = 0;

  const depsSatisfied = (n: CriticalPathNode): boolean =>
    n.depends_on.every((d) => done.has(d));

  const readyIds = (): string[] =>
    dag.nodes
      .filter((n) => !started.has(n.id) && !done.has(n.id) && depsSatisfied(n))
      .map((n) => n.id);

  // Prefetch readiness is tracked in-memory here; real FS stubs are covered
  // by prefetchNext unit tests.

  while (done.size < dag.nodes.length) {
    while (active.length < max_concurrent) {
      const ready = rankReadyNodes(
        readyIds(),
        dag,
        opts.policy,
        opts.fifo_order,
      );
      if (ready.length === 0) break;
      const id = ready[0]!;
      const n = byId.get(id)!;
      const wasPref = prefetched.has(id);
      const setup = wasPref
        ? Math.max(0, n.setup_prefetched_ms ?? 0)
        : Math.max(0, n.setup_ms ?? 0);
      if (wasPref) prefetch_hits += 1;
      started.add(id);
      order_started.push(id);
      const setup_end = now + setup;
      const work_end = setup_end + n.duration_ms;
      const validating_end = work_end + validating_ms;
      active.push({
        id,
        start_ms: now,
        work_end,
        validating_end,
        setup_paid: setup,
        was_prefetched: wasPref,
        prefetch_armed: false,
      });
    }

    if (active.length === 0) {
      throw new CriticalPathError(
        "DEADLOCK",
        "simulation stuck with no active and no ready nodes",
      );
    }

    // Only schedule events strictly in the future to avoid re-hitting work_end.
    const futureEvents: number[] = [];
    for (const a of active) {
      if (a.work_end > now) futureEvents.push(a.work_end);
      if (a.validating_end > now) futureEvents.push(a.validating_end);
    }
    if (futureEvents.length === 0) {
      throw new CriticalPathError(
        "SIM_STALL",
        `no future events at now=${now}; active=${active.map((a) => a.id).join(",")}`,
      );
    }
    now = Math.min(...futureEvents);

    for (const a of active) {
      if (
        a.work_end === now &&
        !a.prefetch_armed &&
        enable_prefetch &&
        validating_ms > 0
      ) {
        a.prefetch_armed = true;
        const children = childrenOf(dag.nodes).get(a.id) ?? [];
        let next: string | undefined;
        const idx = cp.path.indexOf(a.id);
        if (idx >= 0 && idx + 1 < cp.path.length) {
          const cand = cp.path[idx + 1]!;
          if (children.includes(cand) && !started.has(cand)) next = cand;
        }
        if (!next) {
          next = children
            .filter((c) => !started.has(c))
            .sort((x, y) => x.localeCompare(y))[0];
        }
        if (next && !prefetched.has(next)) {
          prefetched.add(next);
          prefetch_ahead_events += 1;
        }
      }
    }

    const still: Active[] = [];
    for (const a of active) {
      if (a.validating_end === now) {
        done.add(a.id);
        traces.push({
          id: a.id,
          start_ms: a.start_ms,
          setup_ms_paid: a.setup_paid,
          work_end_ms: a.work_end,
          validating_end_ms: a.validating_end,
          prefetched: a.was_prefetched,
        });
      } else {
        still.push(a);
      }
    }
    active.length = 0;
    active.push(...still);
  }

  const wall_clock_ms = Math.max(
    0,
    ...traces.map((t) => t.validating_end_ms),
    0,
  );

  return {
    kind: "SimulateWallClockResult",
    schema_version: CRITICAL_PATH_SCHEMA_VERSION,
    policy: opts.policy,
    wall_clock_ms,
    prefetch_hits,
    prefetch_ahead_events,
    order_started,
    traces: traces.sort((a, b) => a.start_ms - b.start_ms || a.id.localeCompare(b.id)),
    critical_path: cp.path,
  };
}

/** Read back a stub for tests / debugging. */
export function readPrefetchStub(
  prefetchRoot: string,
  nodeId: string,
  kind: PrefetchArtifactKind,
): { prepared: boolean; node_id: string; kind: PrefetchArtifactKind } | null {
  const path = prefetchArtifactPaths(prefetchRoot, nodeId)[kind];
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    prepared: boolean;
    node_id: string;
    kind: PrefetchArtifactKind;
  };
  return raw;
}
