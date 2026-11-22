/**
 * V2-INT-03 — Agent Intelligence Profiles (evidence store + deterministic router).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentProfileStore,
  reportedEvidence,
  unavailableFieldsEvidence,
  routeByIntelligence,
  compareToStaticRoute,
  staticRouteAgent,
  computeIntelligenceScore,
  recomputeProfileFromEvidence,
} from "../../src/v3/agent-profiles/index.js";

function iso(offsetMs: number): string {
  return new Date(Date.UTC(2026, 10, 21, 12, 0, 0) + offsetMs).toISOString();
}

describe("V2-INT-03 Agent Intelligence Profiles", () => {
  let dir: string;
  let store: AgentProfileStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "v2-int-03-"));
    store = new AgentProfileStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("updates profile when evidence is appended", () => {
    const p0 = store.appendEvidence(
      reportedEvidence({
        evidence_id: "e1",
        agent_id: "agent-a",
        task_type: "refactor",
        observed_at: iso(0),
        true_full_pass: true,
        rework_count: 0,
        latency_ms: 1000,
        cost_usd: 0.01,
        tokens_in: 100,
        tokens_out: 50,
      }),
    );
    expect(p0.sample_size).toBe(1);
    expect(p0.true_full_pass_rate).toEqual({ value: 1, honesty: "reported" });
    expect(p0.window_start).toBe(iso(0));
    expect(p0.window_end).toBe(iso(0));

    const p1 = store.appendEvidence(
      reportedEvidence({
        evidence_id: "e2",
        agent_id: "agent-a",
        task_type: "refactor",
        observed_at: iso(60_000),
        true_full_pass: false,
        rework_count: 2,
        latency_ms: 2000,
        cost_usd: 0.02,
        tokens_in: 200,
        tokens_out: 80,
      }),
    );
    expect(p1.sample_size).toBe(2);
    expect(p1.true_full_pass_rate.value).toBeCloseTo(0.5);
    expect(p1.true_full_pass_rate.honesty).toBe("reported");
    expect(p1.rework_mean.value).toBeCloseTo(1);
    expect(p1.avg_latency_ms.value).toBeCloseTo(1500);
    expect(p1.avg_tokens.value).toBeCloseTo((150 + 280) / 2);
    expect(p1.window_start).toBe(iso(0));
    expect(p1.window_end).toBe(iso(60_000));

    const loaded = store.getProfile("agent-a", "refactor");
    expect(loaded?.sample_size).toBe(2);
  });

  it("marks UNAVAILABLE honesty when metrics are missing — never invents", () => {
    const p = store.appendEvidence(
      unavailableFieldsEvidence({
        evidence_id: "u1",
        agent_id: "agent-b",
        task_type: "test",
        observed_at: iso(0),
        true_full_pass: true,
        unavailable: ["cost_usd", "latency_ms", "tokens_in", "tokens_out"],
        reported: { rework_count: 1 },
      }),
    );
    expect(p.avg_cost_usd).toEqual({ value: null, honesty: "UNAVAILABLE" });
    expect(p.avg_latency_ms).toEqual({ value: null, honesty: "UNAVAILABLE" });
    expect(p.avg_tokens).toEqual({ value: null, honesty: "UNAVAILABLE" });
    expect(p.rework_mean).toEqual({ value: 1, honesty: "reported" });
    expect(p.true_full_pass_rate.honesty).toBe("reported");

    const empty = recomputeProfileFromEvidence("ghost", "test", []);
    expect(empty.sample_size).toBe(0);
    expect(empty.true_full_pass_rate.honesty).toBe("UNAVAILABLE");
    expect(empty.true_full_pass_rate.value).toBeNull();
  });

  it("routes preferentially to higher score when sample is adequate", () => {
    // agent-good: 5/5 pass, low rework
    for (let i = 0; i < 5; i++) {
      store.appendEvidence(
        reportedEvidence({
          evidence_id: `good-${i}`,
          agent_id: "agent-good",
          task_type: "implement",
          observed_at: iso(i * 1000),
          true_full_pass: true,
          rework_count: 0,
          latency_ms: 500,
          cost_usd: 0.01,
          tokens_in: 10,
          tokens_out: 10,
        }),
      );
    }
    // agent-ok: 5/5 pass but high rework → lower score
    for (let i = 0; i < 5; i++) {
      store.appendEvidence(
        reportedEvidence({
          evidence_id: `ok-${i}`,
          agent_id: "agent-ok",
          task_type: "implement",
          observed_at: iso(i * 1000),
          true_full_pass: true,
          rework_count: 4,
          latency_ms: 500,
          cost_usd: 0.01,
          tokens_in: 10,
          tokens_out: 10,
        }),
      );
    }

    const decision = routeByIntelligence(store, {
      task_type: "implement",
      candidate_agent_ids: ["agent-ok", "agent-good"],
      min_sample_size: 5,
      static_fallback_agent_id: "static-default",
    });

    expect(decision.mode).toBe("profile");
    expect(decision.selected_agent_id).toBe("agent-good");
    expect(decision.score).not.toBeNull();
    expect(decision.score!).toBeGreaterThan(0);

    const goodScore = computeIntelligenceScore(
      store.getProfile("agent-good", "implement")!,
    );
    const okScore = computeIntelligenceScore(
      store.getProfile("agent-ok", "implement")!,
    );
    expect(goodScore.score!).toBeGreaterThan(okScore.score!);
  });

  it("falls back to static when sample_size is below minimum", () => {
    store.appendEvidence(
      reportedEvidence({
        evidence_id: "tiny-1",
        agent_id: "agent-tiny",
        task_type: "docs",
        observed_at: iso(0),
        true_full_pass: true,
        rework_count: 0,
        latency_ms: 100,
        cost_usd: 0.001,
        tokens_in: 5,
        tokens_out: 5,
      }),
    );

    const decision = routeByIntelligence(store, {
      task_type: "docs",
      candidate_agent_ids: ["agent-tiny"],
      min_sample_size: 5,
      static_fallback_agent_id: "static-docs",
    });

    expect(decision.mode).toBe("static_fallback");
    expect(decision.selected_agent_id).toBe("static-docs");
    expect(decision.score).toBeNull();
    expect(decision.candidates[0]?.eligible).toBe(false);
    expect(decision.candidates[0]?.reason).toMatch(/sample_below_min/);
    expect(decision.limitations.some((l) => l.includes("static_fallback"))).toBe(
      true,
    );
  });

  it("penalizes high rework in the deterministic score", () => {
    for (let i = 0; i < 5; i++) {
      store.appendEvidence(
        reportedEvidence({
          evidence_id: `low-rw-${i}`,
          agent_id: "low-rework",
          task_type: "fix",
          observed_at: iso(i * 1000),
          true_full_pass: true,
          rework_count: 0,
          latency_ms: 100,
          cost_usd: 0.01,
          tokens_in: 1,
          tokens_out: 1,
        }),
      );
      store.appendEvidence(
        reportedEvidence({
          evidence_id: `high-rw-${i}`,
          agent_id: "high-rework",
          task_type: "fix",
          observed_at: iso(i * 1000),
          true_full_pass: true,
          rework_count: 10,
          latency_ms: 100,
          cost_usd: 0.01,
          tokens_in: 1,
          tokens_out: 1,
        }),
      );
    }

    const low = computeIntelligenceScore(store.getProfile("low-rework", "fix")!);
    const high = computeIntelligenceScore(
      store.getProfile("high-rework", "fix")!,
    );
    expect(low.rework_penalty).toBe(0);
    expect(high.rework_penalty).toBeCloseTo(5); // 10 * 0.5
    expect(low.score!).toBeGreaterThan(high.score!);

    const decision = routeByIntelligence(store, {
      task_type: "fix",
      candidate_agent_ids: ["high-rework", "low-rework"],
      min_sample_size: 5,
      static_fallback_agent_id: "static-fix",
    });
    expect(decision.selected_agent_id).toBe("low-rework");
  });

  it("exposes StaticRouteDelta API vs static routing (fixture)", () => {
    for (let i = 0; i < 5; i++) {
      store.appendEvidence(
        reportedEvidence({
          evidence_id: `delta-${i}`,
          agent_id: "profile-winner",
          task_type: "review",
          observed_at: iso(i * 1000),
          true_full_pass: true,
          rework_count: 0,
          latency_ms: 50,
          cost_usd: 0.001,
          tokens_in: 2,
          tokens_out: 2,
        }),
      );
    }

    const staticId = staticRouteAgent("static-baseline");
    const decision = routeByIntelligence(store, {
      task_type: "review",
      candidate_agent_ids: ["profile-winner"],
      min_sample_size: 5,
      static_fallback_agent_id: staticId,
    });

    expect(decision.mode).toBe("profile");
    expect(decision.selected_agent_id).toBe("profile-winner");

    const delta = compareToStaticRoute(decision, staticId);
    expect(delta.kind).toBe("StaticRouteDelta");
    expect(delta.agreed).toBe(false);
    expect(delta.profile_selected_agent_id).toBe("profile-winner");
    expect(delta.static_selected_agent_id).toBe("static-baseline");
    expect(delta.profile_mode).toBe("profile");
    expect(delta.delta_note).toBe("profile_prefers_different_agent");
    expect(delta.profile_score).not.toBeNull();

    const agreeDelta = compareToStaticRoute(decision, "profile-winner");
    expect(agreeDelta.agreed).toBe(true);
    expect(agreeDelta.delta_note).toBe("profile_agrees_with_static");
  });
});
