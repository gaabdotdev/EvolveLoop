import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  validateGrillMeResult,
  applyGrillMeToGoalContract,
  GrillMeIntakeError,
  type GrillMeResult,
} from "../../src/v3/grill-me/index.js";

function satisfied(partial?: Partial<GrillMeResult>): GrillMeResult {
  return {
    kind: "GRILL_ME_RESULT",
    problem_understood: true,
    requirements_challenged: true,
    ambiguities_found: ["a1"],
    assumptions_exposed: ["s1"],
    risks_identified: ["r1"],
    open_questions: [],
    accepted_scope: ["core api"],
    rejected_scope: ["mobile app"],
    readiness_for_planning: true,
    user_confirmed_shared_understanding: true,
    objective: "Ship API",
    ...partial,
  };
}

describe("Grill-Me intake", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "grill-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("blocks incomplete results", () => {
    const v = validateGrillMeResult(
      satisfied({ readiness_for_planning: false, open_questions: ["still open"] }),
    );
    expect(v.allow_goal_contract).toBe(false);
    expect(v.status).toBe("blocked");
  });

  it("creates Goal Contract when satisfied and writes evidence", () => {
    const out = applyGrillMeToGoalContract({
      dataGoalContractsDir: path.join(tmp, "goals"),
      evidenceDir: path.join(tmp, "evidence"),
      goal_contract_id: "gc-grill",
      objective: "fallback",
      result: satisfied(),
    });
    expect(out.validation.status).toBe("satisfied");
    expect(out.contract?.objective).toBe("Ship API");
    expect(out.contract?.scope).toContain("core api");
    expect(out.contract?.out_of_scope).toContain("mobile app");
  });

  it("fail-closed throws when blocked", () => {
    expect(() =>
      applyGrillMeToGoalContract({
        dataGoalContractsDir: path.join(tmp, "goals"),
        evidenceDir: path.join(tmp, "evidence"),
        goal_contract_id: "gc-bad",
        objective: "x",
        result: satisfied({ user_confirmed_shared_understanding: false }),
      }),
    ).toThrow(GrillMeIntakeError);
  });
});
