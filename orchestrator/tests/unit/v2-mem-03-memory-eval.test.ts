/**
 * V2-MEM-03 — Memory Eval Suite (Recall@K / Precision@K / INVALIDATED|STALE gate).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  runMemoryEvalSuite,
  recallAtK,
  precisionAtK,
  createFixtureRetriever,
  DEFAULT_GOLDEN_QUERIES,
  DEFAULT_FIXTURE_CORPUS,
  DEFAULT_MEMORY_EVAL_GATES,
  type GoldenQuery,
  type MemoryEvalHit,
  type MemoryRetrieveFn,
} from "../../src/v3/memory/index.js";

const FIXTURE_JSON = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/v2-mem-03-golden-queries.json",
);

function loadGoldenFromJson(): GoldenQuery[] {
  const raw = JSON.parse(readFileSync(FIXTURE_JSON, "utf8")) as {
    queries: GoldenQuery[];
  };
  return raw.queries;
}

describe("V2-MEM-03 Memory Eval Suite", () => {
  it("suite passes with correct retriever on fixtures", async () => {
    const retrieve = createFixtureRetriever();
    const report = await runMemoryEvalSuite({
      retrieve,
      queries: DEFAULT_GOLDEN_QUERIES,
      k: 5,
    });

    expect(report.kind).toBe("MemoryEvalSuiteReport");
    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.metrics.recall_at_k.honesty).toBe("reported");
    expect(report.metrics.precision_at_k.honesty).toBe("reported");
    expect(report.metrics.invalidated_return_rate.honesty).toBe("reported");
    expect(report.metrics.recall_at_k.value!).toBeGreaterThanOrEqual(
      DEFAULT_MEMORY_EVAL_GATES.recall_at_k_min,
    );
    expect(report.metrics.precision_at_k.value!).toBeGreaterThanOrEqual(
      DEFAULT_MEMORY_EVAL_GATES.precision_at_k_min,
    );
    expect(report.metrics.invalidated_return_rate.value).toBe(0);
    expect(report.query_count).toBe(DEFAULT_GOLDEN_QUERIES.length);
  });

  it("loads GoldenQuery fixtures from JSON", async () => {
    const queries = loadGoldenFromJson();
    expect(queries.length).toBeGreaterThanOrEqual(4);
    const report = await runMemoryEvalSuite({
      retrieve: createFixtureRetriever(),
      queries,
      k: 5,
    });
    expect(report.passed).toBe(true);
  });

  it("fails if recall is low", async () => {
    const badRecall: MemoryRetrieveFn = () => [
      { memory_id: "mem-unrelated-noise", status: "ACTIVE" },
    ];

    const report = await runMemoryEvalSuite({
      retrieve: badRecall,
      queries: DEFAULT_GOLDEN_QUERIES,
      k: 5,
    });

    expect(report.passed).toBe(false);
    expect(report.metrics.recall_at_k.value!).toBeLessThan(
      DEFAULT_MEMORY_EVAL_GATES.recall_at_k_min,
    );
    expect(report.failures.some((f) => f.startsWith("recall_at_5="))).toBe(true);
  });

  it("fails if retriever returns INVALIDATED as vigente", async () => {
    const leakInvalidated = createFixtureRetriever(DEFAULT_FIXTURE_CORPUS, {
      includeNonCurrent: true,
    });

    const report = await runMemoryEvalSuite({
      retrieve: leakInvalidated,
      queries: DEFAULT_GOLDEN_QUERIES,
      k: 5,
    });

    expect(report.passed).toBe(false);
    expect(report.metrics.invalidated_return_rate.value!).toBeGreaterThan(0);
    expect(
      report.failures.some((f) => f.includes("invalidated_return_rate=")),
    ).toBe(true);
    const leaked = report.per_query.some(
      (q) =>
        q.invalidated_or_stale_ids.includes("mem-old-docker-sandbox") ||
        q.invalidated_or_stale_ids.includes("mem-stale-promo"),
    );
    expect(leaked).toBe(true);
  });

  it("fails if retriever returns STALE as vigente", async () => {
    const onlyStale: MemoryRetrieveFn = (query) => {
      if (query.includes("promotion")) {
        return [{ memory_id: "mem-stale-promo", status: "STALE" }];
      }
      // Still return gold for other queries so only STALE gate fires clearly
      return createFixtureRetriever()(query, 5);
    };

    const report = await runMemoryEvalSuite({
      retrieve: onlyStale,
      queries: DEFAULT_GOLDEN_QUERIES,
      k: 5,
    });

    expect(report.passed).toBe(false);
    expect(report.metrics.invalidated_return_rate.value!).toBeGreaterThan(0);
    expect(
      report.per_query
        .find((q) => q.query_id === "gq-promotion")
        ?.invalidated_or_stale_ids,
    ).toContain("mem-stale-promo");
  });

  it("precision is calculated correctly (classic Precision@K = hits∩rel / K)", async () => {
    // K=5, 2 relevant in top-5 → precision = 2/5 = 0.4
    const retrieved = ["a", "b", "x", "y", "z"];
    const relevant = ["a", "b", "c"];
    expect(precisionAtK(retrieved, relevant, 5)).toBeCloseTo(0.4, 10);
    expect(recallAtK(retrieved, relevant)).toBeCloseTo(2 / 3, 10);

    // Fewer than K returned: still divide by K
    expect(precisionAtK(["a", "b"], ["a", "b", "c"], 5)).toBeCloseTo(0.4, 10);

    const fixedHits: MemoryEvalHit[] = [
      { memory_id: "a", status: "ACTIVE" },
      { memory_id: "b", status: "ACTIVE" },
      { memory_id: "x", status: "ACTIVE" },
      { memory_id: "y", status: "ACTIVE" },
      { memory_id: "z", status: "ACTIVE" },
    ];
    const report = await runMemoryEvalSuite({
      retrieve: async () => fixedHits,
      queries: [{ query_id: "q1", query: "q", relevant_ids: ["a", "b", "c"] }],
      k: 5,
      gates: {
        recall_at_k_min: 0,
        precision_at_k_min: 0,
        invalidated_return_rate_max: 1,
      },
    });

    expect(report.metrics.precision_at_k.value).toBeCloseTo(0.4, 10);
    expect(report.metrics.recall_at_k.value).toBeCloseTo(2 / 3, 10);
    expect(report.per_query[0]!.precision_at_k).toBeCloseTo(0.4, 10);
    expect(report.metrics.precision_at_k.honesty).toBe("reported");
  });

  it("supports honesty=estimated when caller marks metrics as estimated", async () => {
    const report = await runMemoryEvalSuite({
      retrieve: createFixtureRetriever(),
      queries: DEFAULT_GOLDEN_QUERIES,
      k: 5,
      honesty: "estimated",
    });
    expect(report.metrics.recall_at_k.honesty).toBe("estimated");
    expect(report.kind).toBe("MemoryEvalSuiteReport");
  });
});
