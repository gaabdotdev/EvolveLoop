/**
 * V3-MEM-06 — Utility-Based Decay (active forgetting → Cold CAS).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ColdStorage,
  MemoryBroker,
  scoreUtility,
  decayPass,
  recencyFromTimestamp,
  DEFAULT_UTILITY_THRESHOLD,
  DEFAULT_UTILITY_WEIGHTS,
  UtilityDecayError,
  type DecayAuditEntry,
} from "../../src/v3/memory/index.js";

describe("V3-MEM-06 Utility-Based Decay", () => {
  let coldRoot: string;
  let cold: ColdStorage;
  let broker: MemoryBroker;
  const fixedNow = () => new Date("2026-11-21T23:20:00.000Z");

  beforeEach(() => {
    coldRoot = mkdtempSync(join(tmpdir(), "v3-mem06-decay-"));
    cold = new ColdStorage({ rootDir: coldRoot, compressionLevel: 3 });
    broker = new MemoryBroker(":memory:", "proj-mem06");
  });

  afterEach(() => {
    broker.close();
    rmSync(coldRoot, { recursive: true, force: true });
  });

  function seed(title: string, body: string) {
    return broker.propose({
      memory_type: "episodic",
      title,
      body,
      source: "unit-test",
      payload: { title, marker: body.slice(0, 32) },
    });
  }

  it("scoreUtility rewards TFP contrib + recency and penalizes rework", () => {
    const mem = { memory_id: "m-score" };

    const useful = scoreUtility(mem, {
      true_full_pass_contrib: 1,
      rework_correlation: 0,
      recency: 1,
    });
    // 1.0*1 - 1.0*0 + 0.25*1 = 1.25
    expect(useful.score).toBeCloseTo(1.25);
    expect(useful.low_utility).toBe(false);
    expect(useful.components.true_full_pass_contrib).toBeCloseTo(1);
    expect(useful.components.rework_penalty).toBeCloseTo(0);
    expect(useful.components.recency_bonus).toBeCloseTo(0.25);

    const harmful = scoreUtility(mem, {
      true_full_pass_contrib: 0,
      rework_correlation: 1,
      recency: 0,
    });
    // 0 - 1 + 0 = -1
    expect(harmful.score).toBeCloseTo(-1);
    expect(harmful.low_utility).toBe(true);
    expect(harmful.score).toBeLessThan(DEFAULT_UTILITY_THRESHOLD);

    const mid = scoreUtility(mem, {
      true_full_pass_contrib: 0.5,
      rework_correlation: 0.2,
      recency: 0.4,
    });
    expect(mid.score).toBeCloseTo(0.5 - 0.2 + 0.25 * 0.4);
    expect(mid.weights).toEqual({ ...DEFAULT_UTILITY_WEIGHTS });
  });

  it("scoreUtility clamps signals to [0,1] and rejects non-finite", () => {
    const over = scoreUtility(
      { memory_id: "m-clamp" },
      { true_full_pass_contrib: 5, rework_correlation: -2, recency: 0.5 },
    );
    expect(over.clamped).toEqual({
      true_full_pass_contrib: 1,
      rework_correlation: 0,
      recency: 0.5,
    });
    expect(over.score).toBeCloseTo(1.125);

    expect(() =>
      scoreUtility(
        { memory_id: "m-bad" },
        { true_full_pass_contrib: Number.NaN, rework_correlation: 0, recency: 0 },
      ),
    ).toThrow(UtilityDecayError);
  });

  it("scoreUtility marks already-cold memories as non-low-utility (skip)", () => {
    const s = scoreUtility(
      { memory_id: "cold-1", cas_hash: "sha256:" + "a".repeat(64) },
      { true_full_pass_contrib: 0, rework_correlation: 1, recency: 0 },
    );
    expect(s.skip_reason).toBe("already_cold");
    expect(s.low_utility).toBe(false);
  });

  it("decayPass migrates low-utility hot memories to cold and keeps high-utility hot", async () => {
    const keep = seed("keep-tfp", "MEMORY_KEEP_" + "K".repeat(200));
    const demoteRework = seed("demote-rework", "MEMORY_REWORK_" + "R".repeat(200));
    const demoteStale = seed("demote-stale", "MEMORY_STALE_" + "S".repeat(200));

    const result = await decayPass({
      broker,
      cold,
      now: fixedNow,
      candidates: [
        {
          memory: keep,
          signals: { true_full_pass_contrib: 0.9, rework_correlation: 0.05, recency: 0.8 },
        },
        {
          memory: demoteRework,
          signals: { true_full_pass_contrib: 0.1, rework_correlation: 0.95, recency: 0.2 },
        },
        {
          memory: demoteStale,
          signals: { true_full_pass_contrib: 0.05, rework_correlation: 0.1, recency: 0.05 },
        },
      ],
    });

    expect(result.migrated.map((m) => m.memory_id).sort()).toEqual(
      [demoteRework.memory_id, demoteStale.memory_id].sort(),
    );
    expect(result.migrated.every((m) => m.cas_hash.startsWith("sha256:"))).toBe(true);

    const keepRow = broker.get(keep.memory_id)!;
    expect(keepRow.cas_hash).toBeNull();
    expect(keepRow.body).toContain("MEMORY_KEEP_");

    const reworkRow = broker.get(demoteRework.memory_id)!;
    expect(reworkRow.cas_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // MEM-01: active row keeps summary preview in body; raw payload wiped.
    expect(reworkRow.payload).toEqual({});
    expect(reworkRow.summary).toBeTruthy();
    expect(reworkRow.body).toBe(reworkRow.summary);
    expect(reworkRow.cold_migrated_at).toBeTruthy();

    const coldBytes = await broker.getColdPayload(demoteRework.memory_id, cold);
    const archived = JSON.parse(coldBytes.toString("utf8")) as {
      body: string;
      payload: { marker: string };
    };
    expect(archived.body).toContain("MEMORY_REWORK_");
    expect(archived.payload.marker).toContain("MEMORY_REWORK_");

    const keepAudit = result.audit_trail.find(
      (a) => a.memory_id === keep.memory_id && a.action === "skipped",
    );
    expect(keepAudit?.reason).toBe("above_threshold");
    const demoteAudits = result.audit_trail.filter((a) => a.action === "migrated_to_cold");
    expect(demoteAudits).toHaveLength(2);
    expect(demoteAudits.every((a) => a.cas_hash?.startsWith("sha256:"))).toBe(true);
  });

  it("decayPass preserves prior audit trail across passes (append-only)", async () => {
    const a = seed("pass-a", "BODY_A_" + "a".repeat(100));
    const b = seed("pass-b", "BODY_B_" + "b".repeat(100));

    const trail: DecayAuditEntry[] = [];
    const first = await decayPass({
      broker,
      cold,
      now: fixedNow,
      audit_trail: trail,
      candidates: [
        {
          memory: a,
          signals: { true_full_pass_contrib: 0, rework_correlation: 1, recency: 0 },
        },
      ],
    });
    expect(first.migrated).toHaveLength(1);
    expect(trail).toHaveLength(1);
    expect(trail[0].action).toBe("migrated_to_cold");

    const second = await decayPass({
      broker,
      cold,
      now: () => new Date("2026-11-21T23:21:00.000Z"),
      audit_trail: trail,
      candidates: [
        {
          memory: { ...broker.get(a.memory_id)!, memory_id: a.memory_id },
          signals: { true_full_pass_contrib: 0, rework_correlation: 1, recency: 0 },
        },
        {
          memory: b,
          signals: { true_full_pass_contrib: 0.05, rework_correlation: 0.8, recency: 0.1 },
        },
      ],
    });

    expect(second.migrated.map((m) => m.memory_id)).toEqual([b.memory_id]);
    expect(trail.length).toBeGreaterThanOrEqual(3); // prior + already_cold + migrate b (+ maybe skips)
    expect(trail[0].memory_id).toBe(a.memory_id);
    expect(trail[0].action).toBe("migrated_to_cold");
    expect(trail.some((e) => e.memory_id === a.memory_id && e.reason === "already_cold")).toBe(
      true,
    );
    // Prior audit entry object identity / fields preserved (not rewritten).
    expect(trail[0].cas_hash).toBe(first.migrated[0].cas_hash);
    expect(await cold.get(trail[0].cas_hash!)).toBeTruthy();
  });

  it("decayPass respects max_migrations (lowest utility first)", async () => {
    const low = seed("lowest", "LOW_" + "l".repeat(80));
    const mid = seed("mid", "MID_" + "m".repeat(80));
    const highish = seed("highish-but-below", "HIGHISH_" + "h".repeat(80));

    const result = await decayPass({
      broker,
      cold,
      now: fixedNow,
      max_migrations: 1,
      candidates: [
        {
          memory: mid,
          signals: { true_full_pass_contrib: 0.1, rework_correlation: 0.5, recency: 0 },
        },
        {
          memory: low,
          signals: { true_full_pass_contrib: 0, rework_correlation: 1, recency: 0 },
        },
        {
          memory: highish,
          signals: { true_full_pass_contrib: 0.2, rework_correlation: 0.3, recency: 0 },
        },
      ],
    });

    expect(result.migrated).toHaveLength(1);
    expect(result.migrated[0].memory_id).toBe(low.memory_id);
    expect(broker.get(low.memory_id)?.cas_hash).toBeTruthy();
    expect(broker.get(mid.memory_id)?.cas_hash).toBeNull();
    expect(result.audit_trail.some((e) => e.reason === "max_migrations")).toBe(true);
  });

  it("recencyFromTimestamp decays with half-life", () => {
    const now = new Date("2026-11-21T00:00:00.000Z");
    expect(recencyFromTimestamp(now.toISOString(), now)).toBeCloseTo(1);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(recencyFromTimestamp(weekAgo, now)).toBeCloseTo(0.5);
    expect(recencyFromTimestamp(null, now)).toBe(0);
    expect(recencyFromTimestamp("not-a-date", now)).toBe(0);
  });

  it("decayPass rejects missing broker/cold", async () => {
    await expect(
      decayPass({
        broker: null as unknown as MemoryBroker,
        cold,
        candidates: [],
      }),
    ).rejects.toMatchObject({ code: "BROKER_REQUIRED" });
  });
});
