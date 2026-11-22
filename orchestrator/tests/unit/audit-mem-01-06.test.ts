/**
 * AUD-MEM-01..06 — Memory audit batch (MSO AUD-MEM-BATCH).
 * Proves isolation/provenance, index rebuild, temporal+PROPOSED gate,
 * golden Recall/Precision@5, cold scale sample+p95, federated sanitize.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MemoryBroker,
  MemoryBrokerError,
  MemoryPromotionError,
  promotionGateAllowed,
  ColdStorage,
  COLD_SCALE_100K_THIS_SESSION,
  runMemoryEvalSuite,
  createFixtureRetriever,
  DEFAULT_GOLDEN_QUERIES,
  DEFAULT_MEMORY_EVAL_GATES,
  sanitizeForFederation,
  promoteToGlobal,
  GLOBAL_FEDERATION_SCOPE,
  hashEmbedText,
} from "../../src/v3/memory/index.js";

function percentileNearest(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  const rank = Math.ceil((p / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.max(0, Math.min(sortedAsc.length - 1, rank))]!;
}

describe("AUD-MEM-01 project isolation + provenance", () => {
  let root: string;
  let alpha: MemoryBroker;
  let beta: MemoryBroker;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aud-mem-01-"));
    const db = join(root, "memory.db");
    alpha = new MemoryBroker(db, "proj-A");
    beta = new MemoryBroker(db, "proj-B");
  });

  afterEach(() => {
    alpha.close();
    beta.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("A/B isolation — beta rows invisible to alpha; provenance fields present", () => {
    const a = alpha.propose({
      memory_type: "decision",
      title: "Alpha decision",
      body: "only project A",
      source: "agent:alpha",
    });
    expect(a.project_id).toBe("proj-A");
    expect(a.source).toBe("agent:alpha");
    expect(a.created_at.length).toBeGreaterThan(10);
    expect(a.status).toBe("PROPOSED");
    expect(a.valid_from).toBeTruthy();
    expect(a.valid_to).toBeNull();
    expect(a.superseded_by).toBeNull();

    beta.propose({
      memory_type: "semantic",
      title: "Beta secret",
      body: "must not leak to A",
      source: "agent:beta",
    });

    expect(alpha.search("Beta secret").length).toBe(0);
    expect(alpha.list().every((r) => r.project_id === "proj-A")).toBe(true);
    expect(beta.list().every((r) => r.project_id === "proj-B")).toBe(true);

    expect(() => alpha.search("x", { project_id: "proj-B" })).toThrow(MemoryBrokerError);
  });
});

describe("AUD-MEM-02 rebuild FTS5/sqlite-vec from canonical", () => {
  let broker: MemoryBroker;

  beforeEach(() => {
    broker = new MemoryBroker(":memory:", "proj-rebuild");
  });

  afterEach(() => {
    broker.close();
  });

  it("rebuildDerivedIndexes restores FTS after corruption and reindexes vec from canonical", () => {
    const m1 = broker.propose({
      memory_type: "semantic",
      title: "bubblewrap sandbox",
      body: "use bwrap for workspace isolation",
      source: "audit",
    });
    broker.promote(m1.memory_id, promotionGateAllowed("mso", "ok"));
    broker.indexMemoryEmbedding(m1, hashEmbedText("bubblewrap sandbox isolation bwrap"));

    expect(broker.search("bubblewrap").length).toBeGreaterThan(0);

    // Corrupt derived FTS (delete all indexed rows) — canonical memory_entries untouched.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (broker as any).db as {
      exec: (sql: string) => void;
      prepare: (sql: string) => { run: (...a: unknown[]) => unknown; get: (...a: unknown[]) => unknown };
    };
    db.exec(`INSERT INTO memory_fts(memory_fts) VALUES('delete-all')`);
    expect(broker.search("bubblewrap").length).toBe(0);
    // Canonical still present.
    expect(broker.get(m1.memory_id)?.title).toBe("bubblewrap sandbox");

    const report = broker.rebuildDerivedIndexes();
    expect(report.fts_rebuilt).toBe(true);
    expect(report.canonical_rows).toBeGreaterThanOrEqual(1);
    expect(broker.search("bubblewrap").length).toBeGreaterThan(0);

    if (broker.vectorSearchAvailable()) {
      expect(report.vec_available).toBe(true);
      expect(report.vec_reindexed).toBe(report.canonical_rows);
      const hybrid = broker.hybridSearch("bubblewrap isolation", { status: "ACTIVE" });
      expect(hybrid.channels_used).toEqual(
        expect.arrayContaining(["fts5", "sqlite_vec"]),
      );
    }
  });
});

describe("AUD-MEM-03 valid_to/superseded_by + PROPOSED gate", () => {
  let broker: MemoryBroker;

  beforeEach(() => {
    broker = new MemoryBroker(":memory:", "proj-temporal");
  });

  afterEach(() => {
    broker.close();
  });

  it("PROPOSED is not auto-ACTIVE; supersede sets valid_to + superseded_by", () => {
    const proposed = broker.propose({
      memory_type: "semantic",
      title: "Fact v1",
      body: "canonical fact one",
      source: "writer",
    });
    expect(proposed.status).toBe("PROPOSED");
    expect(() =>
      broker.promote(proposed.memory_id, {
        allow: false,
        actor: "validator",
        reason: "deny",
      }),
    ).toThrow(MemoryPromotionError);
    expect(broker.get(proposed.memory_id)?.status).toBe("PROPOSED");

    const active = broker.promote(
      proposed.memory_id,
      promotionGateAllowed("validator", "ok"),
    );
    expect(active.status).toBe("ACTIVE");

    const next = broker.propose({
      memory_type: "semantic",
      title: "Fact v2",
      body: "canonical fact two",
      source: "writer",
    });
    const promotedNext = broker.promote(
      next.memory_id,
      promotionGateAllowed("mso", "supersede", {
        supersede_memory_id: active.memory_id,
      }),
    );
    expect(promotedNext.status).toBe("ACTIVE");
    const prior = broker.get(active.memory_id)!;
    expect(prior.status).toBe("SUPERSEDED");
    expect(prior.valid_to).toBeTruthy();
    expect(prior.superseded_by).toBe(next.memory_id);
    expect(broker.search("canonical").every((h) => h.record.valid_to === null)).toBe(true);
  });
});

describe("AUD-MEM-04 golden queries Recall@5 / Precision@5", () => {
  it("fixture suite meets Recall@5≥0.85 and Precision@5≥0.80", async () => {
    const report = await runMemoryEvalSuite({
      retrieve: createFixtureRetriever(),
      queries: DEFAULT_GOLDEN_QUERIES,
      k: 5,
    });
    expect(report.passed).toBe(true);
    expect(report.metrics.recall_at_k.value!).toBeGreaterThanOrEqual(
      DEFAULT_MEMORY_EVAL_GATES.recall_at_k_min,
    );
    expect(report.metrics.precision_at_k.value!).toBeGreaterThanOrEqual(
      DEFAULT_MEMORY_EVAL_GATES.precision_at_k_min,
    );
    expect(report.metrics.invalidated_return_rate.value).toBe(0);
    // BM-08: golden retrieval quality gate (Recall/Precision@5).
    expect(DEFAULT_MEMORY_EVAL_GATES.recall_at_k_min).toBeGreaterThanOrEqual(0.85);
    expect(DEFAULT_MEMORY_EVAL_GATES.precision_at_k_min).toBeGreaterThanOrEqual(0.8);
  });
});

describe("AUD-MEM-05 cold storage scale sample + p95", () => {
  let coldRoot: string;
  let cold: ColdStorage;

  beforeEach(() => {
    coldRoot = mkdtempSync(join(tmpdir(), "aud-mem-05-"));
    cold = new ColdStorage({ rootDir: coldRoot, compressionLevel: 1 });
  });

  afterEach(() => {
    rmSync(coldRoot, { recursive: true, force: true });
  });

  it("honest sample N=500 put/get with measured p95; 100k marked NÃO_HABILITADO", async () => {
    expect(COLD_SCALE_100K_THIS_SESSION).toBe("NÃO_HABILITADO");

    const N = 500;
    const putSamples: number[] = [];
    const getSamples: number[] = [];
    let sampleHash: string | null = null;

    for (let i = 0; i < N; i++) {
      const raw = Buffer.from(
        JSON.stringify({
          i,
          pad: "x".repeat(64),
          note: `aud-mem-05-sample-${i}`,
        }),
        "utf8",
      );
      const t0 = performance.now();
      const put = await cold.put(raw);
      putSamples.push(performance.now() - t0);
      if (i === 0) sampleHash = put.cas_hash;

      const t1 = performance.now();
      const got = await cold.get(put.cas_hash);
      getSamples.push(performance.now() - t1);
      expect(Buffer.compare(got, raw)).toBe(0);
    }

    putSamples.sort((a, b) => a - b);
    getSamples.sort((a, b) => a - b);
    const put_p95 = percentileNearest(putSamples, 95);
    const get_p95 = percentileNearest(getSamples, 95);

    expect(Number.isFinite(put_p95)).toBe(true);
    expect(Number.isFinite(get_p95)).toBe(true);
    // Soft latency gate for sample scale (not 100k).
    expect(put_p95).toBeLessThan(200);
    expect(get_p95).toBeLessThan(200);
    expect(sampleHash).toMatch(/^sha256:/);

    // BM-09: cold scale sample metrics (stdout for evidence capture).
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        gate: "AUD-MEM-05",
        sample_n: N,
        put_p95_ms: Number(put_p95.toFixed(3)),
        get_p95_ms: Number(get_p95.toFixed(3)),
        cold_scale_100k_this_session: COLD_SCALE_100K_THIS_SESSION,
        prior_100k_evidence: "docs/v3/evidence/20261122T005507Z/gates/EXIT-03.md",
      }),
    );
  });
});

describe("AUD-MEM-06 federated sanitization", () => {
  it("strips secrets/paths and refuses without allow_federation", () => {
    const secret = "sk-live-abcdefghijklmnopqrstuvwx";
    const pathUnix = "/home/user/secrets.env";
    const raw = `token ${secret} workdir ${pathUnix} lesson keep-me`;

    const denied = sanitizeForFederation(raw, {
      allow_federation: false,
      source_project_id: "proj-A",
      target_scope: "global",
    });
    // sanitize itself may still redact when called directly; promotion gate is fail-closed.
    expect(denied.text.includes(secret)).toBe(false);

    const ok = sanitizeForFederation(raw, {
      allow_federation: true,
      source_project_id: "proj-A",
      target_scope: "global",
    });
    expect(ok.leak_free).toBe(true);
    expect(ok.text.includes(secret)).toBe(false);
    expect(ok.text.includes(pathUnix)).toBe(false);
    expect(ok.text).toContain("keep-me");

    const promoted = promoteToGlobal(
      {
        memory_id: "mem-fed-1",
        project_id: "proj-A",
        memory_type: "semantic",
        title: "lesson",
        body: raw,
        source: "proj-A",
        payload: {},
      },
      {
        allow_federation: true,
        source_project_id: "proj-A",
        target_scope: "global",
      },
    );
    expect(promoted.ok).toBe(true);
    if (promoted.ok) {
      expect(promoted.memory.project_id).toBe(GLOBAL_FEDERATION_SCOPE);
      expect(promoted.memory.body.includes(secret)).toBe(false);
    }

    const blocked = promoteToGlobal(
      {
        memory_id: "mem-fed-2",
        project_id: "proj-A",
        memory_type: "semantic",
        title: "lesson",
        body: "clean text only",
        source: "proj-A",
        payload: {},
      },
      {
        allow_federation: false,
        source_project_id: "proj-A",
        target_scope: "global",
      },
    );
    expect(blocked.ok).toBe(false);
  });
});
