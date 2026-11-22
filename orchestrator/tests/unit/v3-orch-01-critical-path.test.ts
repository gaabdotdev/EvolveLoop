/**
 * V3-ORCH-01 — Critical-Path scheduling + VALIDATING prefetch (worktree/deps/LSP stubs).
 * Wall-clock vs FIFO on a synthetic DAG; prefetch-ahead evidence.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeCriticalPath,
  prefetchNext,
  isNodePrefetched,
  prefetchArtifactPaths,
  rankReadyNodes,
  simulateDagWallClock,
  readPrefetchStub,
  CriticalPathError,
  CRITICAL_PATH_SCHEMA_VERSION,
  type CriticalPathDag,
} from "../../src/v3/parallel/index.js";

/** Diamond with a long critical arm: A → B(long) → D and A → C(short) → D. */
function diamondDag(): CriticalPathDag {
  return {
    nodes: [
      { id: "A", depends_on: [], duration_ms: 10 },
      { id: "B", depends_on: ["A"], duration_ms: 100 },
      { id: "C", depends_on: ["A"], duration_ms: 5 },
      { id: "D", depends_on: ["B", "C"], duration_ms: 10 },
    ],
  };
}

/**
 * Fan-out where FIFO (fat-first) delays the long chain under limited concurrency.
 * Critical path: root → c1 → c2 → c3 → sink.
 */
function contentionDag(): CriticalPathDag {
  const fat = Array.from({ length: 8 }, (_, i) => ({
    id: `f${String(i + 1).padStart(2, "0")}`,
    depends_on: ["root"],
    duration_ms: 40,
    setup_ms: 0,
  }));
  return {
    nodes: [
      { id: "root", depends_on: [], duration_ms: 1 },
      { id: "c1", depends_on: ["root"], duration_ms: 50 },
      { id: "c2", depends_on: ["c1"], duration_ms: 50 },
      { id: "c3", depends_on: ["c2"], duration_ms: 50 },
      ...fat,
      {
        id: "sink",
        depends_on: ["c3", ...fat.map((f) => f.id)],
        duration_ms: 1,
      },
    ],
  };
}

/** Linear chain with expensive cold setup — prefetch during VALIDATING warms the next node. */
function chainWithSetup(): CriticalPathDag {
  const setup_ms = 80;
  const setup_prefetched_ms = 5;
  return {
    nodes: [
      {
        id: "n1",
        depends_on: [],
        duration_ms: 20,
        setup_ms,
        setup_prefetched_ms,
      },
      {
        id: "n2",
        depends_on: ["n1"],
        duration_ms: 20,
        setup_ms,
        setup_prefetched_ms,
      },
      {
        id: "n3",
        depends_on: ["n2"],
        duration_ms: 20,
        setup_ms,
        setup_prefetched_ms,
      },
    ],
  };
}

describe("V3-ORCH-01 Critical Path + Prefetch", () => {
  let prefetchRoot: string;

  beforeEach(() => {
    prefetchRoot = mkdtempSync(join(tmpdir(), "v3-orch-01-pf-"));
  });

  afterEach(() => {
    rmSync(prefetchRoot, { recursive: true, force: true });
  });

  it("computeCriticalPath returns A→B→D on diamond (long arm)", () => {
    const result = computeCriticalPath(diamondDag());
    expect(result.schema_version).toBe(CRITICAL_PATH_SCHEMA_VERSION);
    expect(result.path).toEqual(["A", "B", "D"]);
    expect(result.length_ms).toBe(10 + 100 + 10);
    expect(result.slack_ms["B"]).toBe(0);
    expect(result.slack_ms["C"]).toBeGreaterThan(0);
    expect(result.critical_node_ids).toContain("A");
    expect(result.critical_node_ids).toContain("B");
    expect(result.critical_node_ids).toContain("D");
    expect(result.critical_node_ids).not.toContain("C");
  });

  it("computeCriticalPath rejects cycles and missing deps", () => {
    expect(() =>
      computeCriticalPath({
        nodes: [
          { id: "x", depends_on: ["y"], duration_ms: 1 },
          { id: "y", depends_on: ["x"], duration_ms: 1 },
        ],
      }),
    ).toThrow(CriticalPathError);

    expect(() =>
      computeCriticalPath({
        nodes: [{ id: "x", depends_on: ["missing"], duration_ms: 1 }],
      }),
    ).toThrow(/MISSING_DEP/);
  });

  it("rankReadyNodes critical_path prefers least slack over FIFO id order", () => {
    const dag = diamondDag();
    // After A done, B and C ready — CP prefers B (slack 0).
    const ranked = rankReadyNodes(["C", "B"], dag, "critical_path");
    expect(ranked[0]).toBe("B");

    const fifo = rankReadyNodes(["C", "B"], dag, "fifo");
    expect(fifo[0]).toBe("B"); // lex still B < C
    const fifoForced = rankReadyNodes(["C", "B"], dag, "fifo", ["C", "B"]);
    expect(fifoForced[0]).toBe("C");
  });

  it("prefetchNext during VALIDATING writes worktree/deps/lsp stubs ahead", () => {
    const dag = diamondDag();
    const skipped = prefetchNext({
      current_node_id: "A",
      phase: "RUNNING",
      dag,
      prefetch_root: prefetchRoot,
    });
    expect(skipped.triggered_during).toBe("SKIPPED");
    expect(skipped.ahead).toBe(false);
    expect(skipped.artifacts).toEqual([]);

    const hit = prefetchNext({
      current_node_id: "A",
      phase: "VALIDATING",
      dag,
      prefetch_root: prefetchRoot,
    });
    expect(hit.triggered_during).toBe("VALIDATING");
    expect(hit.next_node_id).toBe("B"); // next on critical path
    expect(hit.ahead).toBe(true);
    expect(hit.artifacts).toHaveLength(3);
    expect(isNodePrefetched(prefetchRoot, "B")).toBe(true);

    const paths = prefetchArtifactPaths(prefetchRoot, "B");
    for (const kind of ["worktree", "deps", "lsp_index"] as const) {
      expect(existsSync(paths[kind])).toBe(true);
      const stub = readPrefetchStub(prefetchRoot, "B", kind);
      expect(stub?.prepared).toBe(true);
      expect(stub?.node_id).toBe("B");
      expect(stub?.kind).toBe(kind);
      const body = readFileSync(paths[kind], "utf8");
      expect(body).toContain('"stub": true');
      const art = hit.artifacts.find((a) => a.kind === kind)!;
      expect(art.content_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(art.ready).toBe(true);
    }
  });

  it("prefetchNext is deterministic (same sha across calls on fresh root)", () => {
    const dag = diamondDag();
    const a = prefetchNext({
      current_node_id: "A",
      phase: "VALIDATING",
      dag,
      prefetch_root: prefetchRoot,
    });
    const root2 = mkdtempSync(join(tmpdir(), "v3-orch-01-pf2-"));
    try {
      const b = prefetchNext({
        current_node_id: "A",
        phase: "VALIDATING",
        dag,
        prefetch_root: root2,
      });
      expect(a.artifacts.map((x) => x.content_sha256)).toEqual(
        b.artifacts.map((x) => x.content_sha256),
      );
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });

  it("wall-clock: critical_path beats fat-first FIFO on contention DAG", () => {
    const dag = contentionDag();
    const cp = computeCriticalPath(dag);
    expect(cp.path).toEqual(["root", "c1", "c2", "c3", "sink"]);

    const fifoOrder = [
      "root",
      "f01",
      "f02",
      "f03",
      "f04",
      "f05",
      "f06",
      "f07",
      "f08",
      "c1",
      "c2",
      "c3",
      "sink",
    ];

    const fifo = simulateDagWallClock(dag, {
      policy: "fifo",
      max_concurrent: 2,
      fifo_order: fifoOrder,
      validating_ms: 0,
      enable_prefetch: false,
    });
    const crit = simulateDagWallClock(dag, {
      policy: "critical_path",
      max_concurrent: 2,
      validating_ms: 0,
      enable_prefetch: false,
    });

    expect(crit.order_started[0]).toBe("root");
    // After root, CP must start c1 before draining fat queue.
    const critAfterRoot = crit.order_started.slice(1, 3);
    expect(critAfterRoot).toContain("c1");

    expect(fifo.wall_clock_ms).toBeGreaterThan(crit.wall_clock_ms);
    expect(crit.critical_path).toEqual(["root", "c1", "c2", "c3", "sink"]);
  });

  it("wall-clock: VALIDATING prefetch reduces chain setup vs cold FIFO", () => {
    const dag = chainWithSetup();

    const cold = simulateDagWallClock(dag, {
      policy: "fifo",
      max_concurrent: 1,
      validating_ms: 10,
      enable_prefetch: false,
    });
    const warm = simulateDagWallClock(dag, {
      policy: "critical_path",
      max_concurrent: 1,
      validating_ms: 10,
      enable_prefetch: true,
    });

    expect(warm.prefetch_ahead_events).toBeGreaterThanOrEqual(2);
    expect(warm.prefetch_hits).toBeGreaterThanOrEqual(2);
    expect(warm.wall_clock_ms).toBeLessThan(cold.wall_clock_ms);

    // Evidence: successors paid warm setup.
    const warmSetups = warm.traces.filter((t) => t.id !== "n1");
    for (const t of warmSetups) {
      expect(t.prefetched).toBe(true);
      expect(t.setup_ms_paid).toBe(5);
    }
    const coldSetups = cold.traces;
    for (const t of coldSetups) {
      expect(t.prefetched).toBe(false);
      expect(t.setup_ms_paid).toBe(80);
    }
  });

  it("prefetchNext with no successors returns ahead=false", () => {
    const dag = diamondDag();
    const r = prefetchNext({
      current_node_id: "D",
      phase: "VALIDATING",
      dag,
      prefetch_root: prefetchRoot,
    });
    expect(r.next_node_id).toBeNull();
    expect(r.ahead).toBe(false);
    expect(r.skipped_reason).toMatch(/no successors/);
  });
});
