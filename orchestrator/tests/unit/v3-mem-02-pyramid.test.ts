/**
 * V3-MEM-02 — Hierarchical Pyramid Index (RAPTOR) + coarse-to-fine latency.
 */
import { describe, it, expect } from "vitest";
import {
  InMemoryPyramidIndex,
  PyramidIndexError,
  buildPyramid,
  searchCoarseToFine,
  percentileNearest,
  PYRAMID_LEVELS,
  PYRAMID_SCHEMA_VERSION,
  PYRAMID_DISK_PERSISTENCE,
  type PyramidEvent,
} from "../../src/v3/memory/index.js";

function makeEvents(count: number, opts?: { modules?: string[]; projectId?: string }): PyramidEvent[] {
  const modules = opts?.modules ?? ["auth", "memory", "orch", "sec"];
  const projectId = opts?.projectId ?? "proj-pyramid";
  const out: PyramidEvent[] = [];
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  for (let i = 0; i < count; i++) {
    const mod = modules[i % modules.length]!;
    const day = Math.floor(i / 64); // spread across days for N1 buckets
    const ts = new Date(base + day * 86_400_000 + (i % 64) * 60_000).toISOString();
    out.push({
      event_id: `ev-${String(i).padStart(5, "0")}`,
      text: `event ${i} module ${mod} topic pyramid retrieval coarse fine marker-${mod}-${i % 17}`,
      timestamp: ts,
      module: mod,
      project_id: projectId,
      tags: [mod, "pyramid", i % 2 === 0 ? "even" : "odd"],
    });
  }
  // Plant a distinctive needle for retrieval checks.
  if (count > 10) {
    out[42] = {
      ...out[42]!,
      text: "needle unique-raptor-signal sandbox credential rotation evidence dump",
      tags: ["needle", "raptor", "auth"],
      module: "auth",
    };
  }
  return out;
}

describe("V3-MEM-02 Pyramid Index (RAPTOR)", () => {
  it("buildPyramid produces all 4 levels with parent/child links", () => {
    const events = makeEvents(48);
    const { index, stats } = buildPyramid(events, { episodeSize: 8 });

    expect(PYRAMID_SCHEMA_VERSION).toBe("1");
    // AUD-STUB-02: pyramid is explicitly not disk-durable (no fake SQLite wiring).
    expect(PYRAMID_DISK_PERSISTENCE).toBe("NÃO_HABILITADO");
    expect(stats.events).toBe(48);
    expect(stats.by_level[0]).toBe(48);
    expect(stats.by_level[1]).toBeGreaterThan(0);
    expect(stats.by_level[2]).toBeGreaterThan(0);
    expect(stats.by_level[3]).toBe(1);
    expect(stats.nodes_total).toBe(
      stats.by_level[0] + stats.by_level[1] + stats.by_level[2] + stats.by_level[3],
    );

    for (const level of PYRAMID_LEVELS) {
      expect(index.listByLevel(level).length).toBe(stats.by_level[level]);
    }

    // Parent/child integrity: every N0 has a parent chain up to N3.
    for (const leaf of index.listByLevel(0)) {
      expect(leaf.parent_id).toBeTruthy();
      const n1 = index.getNode(leaf.parent_id!);
      expect(n1?.level).toBe(1);
      expect(n1?.child_ids).toContain(leaf.node_id);
      expect(n1?.parent_id).toBeTruthy();
      const n2 = index.getNode(n1!.parent_id!);
      expect(n2?.level).toBe(2);
      expect(n2?.parent_id).toBeTruthy();
      const n3 = index.getNode(n2!.parent_id!);
      expect(n3?.level).toBe(3);
      expect(n3?.parent_id).toBeNull();
    }
  });

  it("searchCoarseToFine descends N3→N2→N1→N0 and returns hits + path", () => {
    const { index } = buildPyramid(makeEvents(64), { episodeSize: 8 });
    const result = searchCoarseToFine(index, "unique-raptor-signal credential", {
      beamWidth: 4,
      topK: 5,
    });

    expect(result.path.length).toBeGreaterThanOrEqual(4);
    expect(result.path.map((p) => p.level)).toEqual([3, 2, 1, 0]);
    expect(result.path[0]!.label).toBe("projeto");
    expect(result.path[3]!.label).toBe("bruto");
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits.every((h) => h.level === 0)).toBe(true);
    expect(result.hits.some((h) => h.summary.includes("unique-raptor-signal"))).toBe(true);
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    expect(result.nodes_scored).toBeGreaterThan(0);
  });

  it("rejects empty query", () => {
    const index = new InMemoryPyramidIndex();
    index.buildPyramid(makeEvents(8));
    expect(() => index.searchCoarseToFine("   ")).toThrow(PyramidIndexError);
  });

  it("measures p95 coarse-to-fine latency on fixture ≥1k nodes (real ms)", () => {
    /**
     * LIMITATION (plano §5.1 Suíte E): meta de escala cita 100k+ eventos.
     * Neste slice medimos fixture ≥1k nós totais (N0..N3) com medição real;
     * 100k eventos fica fora do budget unitário — documentado, não inventado.
     */
    const N0 = 1200;
    const { index, stats } = buildPyramid(makeEvents(N0), { episodeSize: 8 });
    const fixtureNodes = stats.nodes_total;
    expect(fixtureNodes).toBeGreaterThanOrEqual(1000);
    expect(stats.by_level[0]).toBe(N0);
    expect(stats.by_level[3]).toBeGreaterThanOrEqual(1);

    const queries = [
      "unique-raptor-signal credential",
      "module memory pyramid retrieval",
      "orch coarse fine marker",
      "sandbox auth rotation",
      "sec even pyramid topic",
      "marker-memory-3 event",
      "module orch topic pyramid",
      "credential rotation evidence",
    ];

    const samples: number[] = [];
    const rounds = 40;
    for (let r = 0; r < rounds; r++) {
      const q = queries[r % queries.length]!;
      const res = index.searchCoarseToFine(q, { beamWidth: 4, topK: 8 });
      expect(res.path.map((p) => p.level)).toEqual([3, 2, 1, 0]);
      samples.push(res.latency_ms);
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = percentileNearest(sorted, 95);
    const p50 = percentileNearest(sorted, 50);

    // Real numbers — never invent. Soft gate: p95 should be well under 200ms at 1k+.
    expect(Number.isFinite(p95)).toBe(true);
    expect(p95).toBeLessThan(200);

    // Surface for evidence capture (vitest reporter stdout).
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        gate: "V3-MEM-02",
        fixture_n0: N0,
        fixture_nodes: fixtureNodes,
        by_level: stats.by_level,
        samples: samples.length,
        p50_ms: Number(p50.toFixed(3)),
        p95_ms: Number(p95.toFixed(3)),
        max_ms: Number(sorted[sorted.length - 1]!.toFixed(3)),
        limitation:
          "Fixture scale = ≥1k pyramid nodes (not 100k events). Full Suíte E 100k deferred.",
      }),
    );
  });
});
