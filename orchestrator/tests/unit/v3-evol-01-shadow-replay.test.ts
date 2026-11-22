/**
 * V3-EVOL-01 — Self-Improvement Pipeline + Shadow Replay Histórico.
 *
 * Gate (§5.4): 3 candidates (beneficial, neutral, subtle regression) →
 * only beneficial passes; rollback in 1 command.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  EvolutionPipeline,
  evaluateAgainstBaseline,
  SHADOW_REPLAY_ROLLBACK_COMMAND,
  SHADOW_REPLAY_SCHEMA_VERSION,
  type CandidateProposal,
  type HistoricalEvent,
  type ShadowReplayScore,
} from "../../src/v3/evolution/index.js";

const NOW = "2026-11-22T00:20:00.000Z";

function makeCandidate(
  id: string,
  skill = "skill-router",
  version = "v2",
): CandidateProposal {
  return {
    candidate_id: id,
    version,
    diff_or_script_ref: `skill:${skill}#shadow:${id}`,
    parent_skill_id: skill,
    status: "proposed",
    observation_ids: [`obs-${id}`],
    rework_score: 5,
    rationale: `fixture ${id}`,
    created_at: NOW,
  };
}

/**
 * Historical corpus (fixture shaped like real events):
 * baseline: 3/5 success, cost 100, 0 security incidents.
 * - beneficial: flips 1 failure → success, same cost/security
 * - neutral: identical to baseline on every event
 * - subtle_regression: same successes but injects 1 security incident + higher cost
 */
function historicalCorpus(
  beneficialId: string,
  neutralId: string,
  regressionId: string,
): HistoricalEvent[] {
  const events: HistoricalEvent[] = [
    {
      event_id: "hist-01",
      skill_id: "skill-router",
      observed_at: "2026-11-01T10:00:00.000Z",
      baseline: { success: true, cost_tokens: 100, security_incident: false },
    },
    {
      event_id: "hist-02",
      skill_id: "skill-router",
      observed_at: "2026-11-02T10:00:00.000Z",
      baseline: { success: true, cost_tokens: 100, security_incident: false },
    },
    {
      event_id: "hist-03",
      skill_id: "skill-router",
      observed_at: "2026-11-03T10:00:00.000Z",
      baseline: { success: true, cost_tokens: 100, security_incident: false },
    },
    {
      event_id: "hist-04",
      skill_id: "skill-router",
      observed_at: "2026-11-04T10:00:00.000Z",
      baseline: { success: false, cost_tokens: 100, security_incident: false },
      projections: {
        [beneficialId]: {
          success: true,
          cost_tokens: 100,
          security_incident: false,
        },
        // neutral: omit → baseline
        [regressionId]: {
          success: false,
          cost_tokens: 140,
          security_incident: true,
        },
      },
    },
    {
      event_id: "hist-05",
      skill_id: "skill-router",
      observed_at: "2026-11-05T10:00:00.000Z",
      baseline: { success: false, cost_tokens: 100, security_incident: false },
      projections: {
        // beneficial leaves this failure (still net better: 4/5 vs 3/5)
        [regressionId]: {
          success: false,
          cost_tokens: 120,
          security_incident: false,
        },
      },
    },
  ];

  // Ensure neutral id is referenced in the fixture contract (no projections).
  void neutralId;
  return events;
}

describe("V3-EVOL-01 evaluateAgainstBaseline", () => {
  const baseline: ShadowReplayScore = {
    success_rate: 0.6,
    avg_cost_tokens: 100,
    security_incidents: 0,
    events_scored: 5,
  };

  it("beneficial (higher success, no regression) beats baseline", () => {
    const r = evaluateAgainstBaseline(baseline, {
      success_rate: 0.8,
      avg_cost_tokens: 100,
      security_incidents: 0,
      events_scored: 5,
    });
    expect(r.beats_baseline).toBe(true);
    expect(r.reject_reasons).toEqual([]);
  });

  it("neutral (identical) does not superar baseline", () => {
    const r = evaluateAgainstBaseline(baseline, { ...baseline });
    expect(r.beats_baseline).toBe(false);
    expect(r.reject_reasons).toContain("does_not_superar_baseline");
  });

  it("subtle security regression is rejected", () => {
    const r = evaluateAgainstBaseline(baseline, {
      success_rate: 0.6,
      avg_cost_tokens: 100,
      security_incidents: 1,
      events_scored: 5,
    });
    expect(r.beats_baseline).toBe(false);
    expect(r.reject_reasons).toContain("security_regression");
  });
});

describe("V3-EVOL-01 Shadow Replay gate (3 candidates)", () => {
  let pipeline: EvolutionPipeline;
  let beneficial: CandidateProposal;
  let neutral: CandidateProposal;
  let regression: CandidateProposal;
  let events: HistoricalEvent[];

  beforeEach(() => {
    pipeline = new EvolutionPipeline({
      now: () => NOW,
      idFactory: () => "shadow-test",
    });
    beneficial = makeCandidate("cand-beneficial");
    neutral = makeCandidate("cand-neutral");
    regression = makeCandidate("cand-subtle-regression");
    events = historicalCorpus(
      beneficial.candidate_id,
      neutral.candidate_id,
      regression.candidate_id,
    );
  });

  it("só o candidato benéfico passa; neutro e regressão sutil são rejeitados", () => {
    const report = pipeline.shadowReplay(
      [beneficial, neutral, regression],
      events,
    );

    expect(report.kind).toBe("ShadowReplayReport");
    expect(report.schema_version).toBe(SHADOW_REPLAY_SCHEMA_VERSION);
    expect(report.baseline.events_scored).toBe(5);
    expect(report.baseline.success_rate).toBeCloseTo(0.6, 5);
    expect(report.baseline.security_incidents).toBe(0);

    expect(report.passed).toHaveLength(1);
    expect(report.passed[0]!.candidate_id).toBe("cand-beneficial");
    expect(report.passed[0]!.production_eligible).toBe(true);
    expect(report.passed[0]!.beats_baseline).toBe(true);
    expect(report.passed[0]!.score.success_rate).toBeCloseTo(0.8, 5);

    expect(report.rejected).toHaveLength(2);
    const byId = Object.fromEntries(
      report.rejected.map((r) => [r.candidate_id, r]),
    );
    expect(byId["cand-neutral"]!.decision).toBe("reject");
    expect(byId["cand-neutral"]!.reject_reasons).toContain(
      "does_not_superar_baseline",
    );
    expect(byId["cand-subtle-regression"]!.decision).toBe("reject");
    expect(byId["cand-subtle-regression"]!.reject_reasons).toEqual(
      expect.arrayContaining(["security_regression", "cost_regression"]),
    );

    expect(pipeline.hasShadowReplayPass("cand-beneficial")).toBe(true);
    expect(pipeline.hasShadowReplayPass("cand-neutral")).toBe(false);
    expect(pipeline.hasShadowReplayPass("cand-subtle-regression")).toBe(false);
  });

  it("nenhum candidato entra em produção sem Shadow Replay pass", () => {
    pipeline.shadowReplay([beneficial, neutral, regression], events);

    const denied = pipeline.promoteToProduction("cand-neutral");
    expect(denied.promoted).toBe(false);
    expect(denied.detail).toBe("shadow_replay_required");
    expect(pipeline.getProductionCandidateId()).toBeNull();

    const deniedReg = pipeline.promoteToProduction("cand-subtle-regression");
    expect(deniedReg.promoted).toBe(false);

    const ok = pipeline.promoteToProduction("cand-beneficial");
    expect(ok.promoted).toBe(true);
    expect(ok.rollback_command).toBe(SHADOW_REPLAY_ROLLBACK_COMMAND);
    expect(pipeline.getProductionCandidateId()).toBe("cand-beneficial");
  });

  it("rollback em 1 comando restaura baseline após promoção", () => {
    const report = pipeline.shadowReplay(
      [beneficial, neutral, regression],
      events,
    );
    expect(report.rollback_command).toBe(SHADOW_REPLAY_ROLLBACK_COMMAND);

    pipeline.promoteToProduction("cand-beneficial");
    expect(pipeline.getProductionCandidateId()).toBe("cand-beneficial");

    // Single-command API on the report (same as pipeline.rollbackProduction).
    const rolled = report.rollback();
    expect(rolled.rolled_back).toBe(true);
    expect(rolled.rollback_command).toBe(SHADOW_REPLAY_ROLLBACK_COMMAND);
    expect(rolled.cleared_candidate_id).toBe("cand-beneficial");
    expect(rolled.restored_candidate_id).toBeNull();
    expect(pipeline.getProductionCandidateId()).toBeNull();

    // Idempotent second call does not invent state.
    const again = pipeline.rollbackProduction();
    expect(again.rolled_back).toBe(false);
    expect(again.detail).toBe("nothing_in_production");
  });

  it("corpus vazio → todos rejeitados (não entram em produção)", () => {
    const report = pipeline.shadowReplay([beneficial], []);
    expect(report.passed).toHaveLength(0);
    expect(report.rejected[0]!.reject_reasons).toContain(
      "empty_historical_corpus",
    );
    expect(pipeline.promoteToProduction("cand-beneficial").promoted).toBe(
      false,
    );
  });
});
