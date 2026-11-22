/**
 * V1-MEM-01 — Hybrid FTS5 + sqlite-vec + RRF + light reranker.
 * PASS path requires the vector channel active (extension loaded), not Unavailable.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  MemoryBroker,
  promotionGateAllowed,
  hybridSearch,
  reciprocalRankFusion,
  SQLITE_VEC_GAP,
  UnavailableVectorSearch,
  SqliteVecSearch,
  tryLoadSqliteVec,
  hashEmbedText,
  getSqliteVecLoadError,
} from "../../src/v3/memory/index.js";

describe("V1-MEM-01 hybrid search", () => {
  let broker: MemoryBroker;

  beforeEach(() => {
    broker = new MemoryBroker(":memory:", "proj-hybrid");
  });

  afterEach(() => {
    broker.close();
  });

  it("RRF merges ranked channels", () => {
    const fused = reciprocalRankFusion(
      [
        {
          name: "fts5",
          hits: [
            { memory_id: "a", rank: 1 },
            { memory_id: "b", rank: 2 },
          ],
        },
        {
          name: "vec",
          hits: [
            { memory_id: "b", rank: 1 },
            { memory_id: "c", rank: 2 },
          ],
        },
      ],
      60,
    );
    expect(fused[0]!.memory_id).toBe("b");
    expect(fused.find((f) => f.memory_id === "b")!.channels).toEqual(
      expect.arrayContaining(["fts5", "vec"]),
    );
  });

  it("loads sqlite-vec, indexes embeddings, and RRF uses FTS5 + sqlite_vec", () => {
    const loadErr = getSqliteVecLoadError();
    if (!broker.vectorSearchAvailable()) {
      throw new Error(
        `V1-MEM-01_FAIL: sqlite-vec not available on this host — ${loadErr ?? "unknown load error"}`,
      );
    }

    expect(broker.getVectorPort()).toBeInstanceOf(SqliteVecSearch);

    const m1 = broker.propose({
      memory_type: "semantic",
      title: "bubblewrap sandbox",
      body: "use bwrap for workspace isolation",
      source: "test",
    });
    const m2 = broker.propose({
      memory_type: "semantic",
      title: "network deny",
      body: "unshare-net for analyze phase",
      source: "test",
    });
    broker.promote(m1.memory_id, promotionGateAllowed("mso", "p1"));
    broker.promote(m2.memory_id, promotionGateAllowed("mso", "p2"));

    // Explicit embedding upsert proves the vector table is writable.
    broker.indexMemoryEmbedding(m1, hashEmbedText("bubblewrap sandbox isolation bwrap"));
    broker.indexMemoryEmbedding(m2, hashEmbedText("network deny unshare analyze"));

    const result = broker.hybridSearch("bubblewrap isolation", { status: "ACTIVE" });

    expect(broker.vectorSearchAvailable()).toBe(true);
    expect(result.gaps).toEqual([]);
    expect(result.channels_used).toEqual(
      expect.arrayContaining(["fts5", "sqlite_vec"]),
    );
    expect(result.channels_used).not.toContain("Unavailable");

    const top = result.hits[0];
    expect(top).toBeDefined();
    expect(top!.channels).toEqual(expect.arrayContaining(["fts5", "sqlite_vec"]));
    expect(top!.rerank_score).toBeGreaterThanOrEqual(top!.rrf_score);
    expect(top!.memory_id).toBe(m1.memory_id);
  });

  it("in-memory DB + tryLoadSqliteVec + KNN proves both RRF channels", () => {
    const db = new Database(":memory:");
    const port = tryLoadSqliteVec(db, { project_id: "p" });
    if (!port.available) {
      throw new Error(
        `V1-MEM-01_FAIL: sqlite-vec load failed — ${getSqliteVecLoadError() ?? port.gap}`,
      );
    }

    const vec = port as SqliteVecSearch;
    vec.upsert("mem-a", hashEmbedText("alpha bubblewrap isolation"), "p");
    vec.upsert("mem-b", hashEmbedText("beta network deny"), "p");

    const knn = vec.search("bubblewrap isolation", 5);
    expect(knn.length).toBeGreaterThan(0);
    expect(knn[0]!.memory_id).toBe("mem-a");

    const fts_hits = [
      {
        record: {
          memory_id: "mem-a",
          project_id: "p",
          memory_type: "semantic" as const,
          status: "ACTIVE" as const,
          contract_version: 1,
          title: "alpha bubblewrap",
          body: "isolation",
          source: "t",
          created_at: new Date().toISOString(),
          tainted: false,
          valid_from: null,
          valid_to: null,
          superseded_by: null,
          payload: {},
        },
        bm25: -1,
      },
      {
        record: {
          memory_id: "mem-b",
          project_id: "p",
          memory_type: "semantic" as const,
          status: "ACTIVE" as const,
          contract_version: 1,
          title: "beta network",
          body: "deny",
          source: "t",
          created_at: new Date().toISOString(),
          tainted: false,
          valid_from: null,
          valid_to: null,
          superseded_by: null,
          payload: {},
        },
        bm25: -0.5,
      },
    ];

    const r = hybridSearch({
      query: "bubblewrap isolation",
      fts_hits,
      vector: vec,
    });
    expect(r.channels_used).toEqual(expect.arrayContaining(["fts5", "sqlite_vec"]));
    expect(r.gaps).toEqual([]);
    expect(r.hits[0]!.channels).toEqual(expect.arrayContaining(["fts5", "sqlite_vec"]));
    db.close();
  });

  it("UnavailableVectorSearch remains the FTS-only fallback", () => {
    const v = new UnavailableVectorSearch();
    expect(v.available).toBe(false);
    expect(v.search("q", 5)).toEqual([]);
    const r = hybridSearch({
      query: "x",
      fts_hits: [],
      vector: v,
    });
    expect(r.gaps[0]).toBe(SQLITE_VEC_GAP);
    expect(r.channels_used).not.toContain("sqlite_vec");
  });
});
