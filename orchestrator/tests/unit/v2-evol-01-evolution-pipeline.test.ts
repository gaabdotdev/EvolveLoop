/**
 * V2-EVOL-01 — Evolution Pipeline observation-first + crystallizer link.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  EvolutionPipeline,
  beneficialBattery,
  regressionBattery,
  type CandidateProposal,
  type EvolutionObservation,
} from "../../src/v3/evolution/index.js";
import {
  CrystallizerRegistry,
  CRYSTALLIZE_THRESHOLD,
} from "../../src/v3/token-economy/index.js";

async function crystallizeSkill(
  reg: CrystallizerRegistry,
  patternId: string,
  script = "#!/usr/bin/env node\nconsole.log('v1')",
): Promise<void> {
  for (let i = 0; i < CRYSTALLIZE_THRESHOLD - 1; i++) {
    await reg.run({ pattern_id: patternId, success: true });
  }
  const r = await reg.run({
    pattern_id: patternId,
    success: true,
    script,
    validate: (s) => s.includes("v1") || s.includes("crystallized"),
  });
  expect(r.status).toBe("crystallized");
}

describe("V2-EVOL-01 Evolution Pipeline", () => {
  let crystallizer: CrystallizerRegistry;
  let pipeline: EvolutionPipeline;

  beforeEach(() => {
    crystallizer = new CrystallizerRegistry({ tokensPerLiveRun: 10 });
    pipeline = new EvolutionPipeline({
      crystallizer,
      reworkThreshold: 3,
      minObservations: 1,
      idFactory: () => "test-id",
      now: () => "2026-11-21T19:00:00.000Z",
    });
  });

  it("sem observações → zero propostas", () => {
    const proposals = pipeline.observe([]);
    expect(proposals).toEqual([]);
    expect(pipeline.listProposals()).toEqual([]);
  });

  it("observação insuficiente (rework baixo) → zero propostas", () => {
    const proposals = pipeline.observe([
      {
        kind: "rework_signal",
        skill_id: "fix-import-sort",
        rework_count: 1,
      },
      {
        kind: "pass_event",
        skill_id: "fix-import-sort",
        true_full_pass: true,
      },
    ]);
    expect(proposals).toEqual([]);
  });

  it("rework alto → proposta versionada com status proposed", () => {
    const observations: EvolutionObservation[] = [
      {
        kind: "rework_signal",
        skill_id: "fix-import-sort",
        rework_count: 4,
        reason: "repeated_retry_on_edge_case",
      },
    ];
    const proposals = pipeline.observe(observations);
    expect(proposals).toHaveLength(1);
    const c = proposals[0]!;
    expect(c.status).toBe("proposed");
    expect(c.parent_skill_id).toBe("fix-import-sort");
    expect(c.version).toMatch(/^v\d+$/);
    expect(c.diff_or_script_ref.length).toBeGreaterThan(0);
    expect(c.rework_score).toBeGreaterThanOrEqual(3);
  });

  it("crystallizer link presente no candidate quando skill cristalizada", async () => {
    const pid = "fix-import-sort";
    await crystallizeSkill(crystallizer, pid);

    const recorded = pipeline.recordCrystallizerObservation(pid);
    expect(recorded.crystallized).toBe(true);

    const proposals = pipeline.observe([
      {
        kind: "rework_signal",
        skill_id: pid,
        rework_count: 5,
        task_id: "task-recurrent-1",
      },
    ]);
    expect(proposals).toHaveLength(1);
    const c = proposals[0]!;
    expect(c.crystallizer_pattern_id).toBe(pid);
    expect(c.crystallizer_script_ref).toBeDefined();
    expect(c.parent_skill_id).toBe(pid);
    expect(c.status).toBe("proposed");
    // Crystallizer script unchanged (no auto-apply).
    const still = crystallizer.get(pid)?.script;
    expect(still?.script).toContain("v1");
    expect(still?.validated).toBe(true);
  });

  it("não auto-aplica — status permanece proposed até validate", async () => {
    const proposals = pipeline.observe([
      {
        kind: "rework_signal",
        skill_id: "skill-a",
        rework_count: 3,
      },
    ]);
    expect(proposals[0]!.status).toBe("proposed");

    const beforeValidate = pipeline.getProposal(proposals[0]!.candidate_id);
    expect(beforeValidate?.status).toBe("proposed");

    // Crystallizer registry must not gain a new script from observe alone.
    expect(crystallizer.listCrystallized()).toEqual([]);
  });

  it("validate aceita candidato benéfico (fixture)", async () => {
    const [candidate] = pipeline.observe([
      { kind: "rework_signal", skill_id: "skill-ok", rework_count: 3 },
    ]);
    expect(candidate).toBeDefined();

    const result = await pipeline.validateCandidate(candidate!, async () =>
      beneficialBattery(),
    );
    expect(result.decision).toBe("accept");
    expect(result.rollback_plan).toContain("revert_to_parent");
    expect(result.candidate.status).toBe("accepted");
    expect(result.battery.beneficial).toBe(true);
    expect(result.battery.regression).toBe(false);
  });

  it("validate rejeita regressão (fixture) com rollback_plan", async () => {
    const [candidate] = pipeline.observe([
      { kind: "rework_signal", skill_id: "skill-bad", rework_count: 3 },
    ]);
    expect(candidate).toBeDefined();

    const result = await pipeline.validateCandidate(candidate!, async () =>
      regressionBattery(),
    );
    expect(result.decision).toBe("reject");
    expect(result.rollback_plan.length).toBeGreaterThan(0);
    expect(result.candidate.status).toBe("rejected");
    expect(result.battery.regression).toBe(true);
  });

  it("validate não aplica script no crystallizer mesmo ao aceitar", async () => {
    const pid = "skill-keep";
    await crystallizeSkill(crystallizer, pid, "crystallized:skill-keep:v1");
    const before = crystallizer.get(pid)!.script!.script;

    const [candidate] = pipeline.observe([
      { kind: "rework_signal", skill_id: pid, rework_count: 3 },
    ]);
    await pipeline.validateCandidate(candidate!, async () => beneficialBattery());

    expect(crystallizer.get(pid)!.script!.script).toBe(before);
    expect(candidate!.status).toBe("proposed"); // original object unchanged
    expect(pipeline.getProposal(candidate!.candidate_id)!.status).toBe("accepted");
  });

  it("campos obrigatórios do candidato", () => {
    const [c] = pipeline.observe([
      { kind: "rework_signal", skill_id: "fields", rework_count: 10 },
    ]) as [CandidateProposal];
    expect(c.version).toBeTruthy();
    expect(c.diff_or_script_ref).toBeTruthy();
    expect(c.parent_skill_id).toBe("fields");
    expect(c.status).toBe("proposed");
  });
});

describe("V1-TOK-19 crystallizer regression (V2-EVOL-01 must not break)", () => {
  it("ainda cristaliza em N>=3 e 4ª corrida é zero tokens", async () => {
    const reg = new CrystallizerRegistry({ tokensPerLiveRun: 42 });
    const pid = "regression-crystallizer";

    expect((await reg.run({ pattern_id: pid, success: true })).status).toBe("recorded");
    expect((await reg.run({ pattern_id: pid, success: true })).status).toBe("recorded");
    const r3 = await reg.run({
      pattern_id: pid,
      success: true,
      script: "#!/usr/bin/env node\nconsole.log('crystallized')",
      validate: (s) => s.includes("crystallized"),
    });
    expect(r3.status).toBe("crystallized");

    const r4 = await reg.run({ pattern_id: pid, success: true });
    expect(r4.status).toBe("zero_token_script");
    expect(r4.tokens_used).toBe(0);
  });
});
