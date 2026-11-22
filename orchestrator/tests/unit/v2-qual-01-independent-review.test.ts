/**
 * V2-QUAL-01 — Independent Review Gate (distinct agent + session).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  IndependentReviewGate,
  IndependentReviewError,
  contractRequiresIndependentReview,
  evaluateVerifiedTrueFullPass,
  EvidenceStore,
} from "../../src/v3/evaluation/index.js";
import { GoalContractStore } from "../../src/v3/goal-contract/index.js";
import type { GoalContract } from "../../src/v3/goal-contract/types.js";
import { runEvidenceValidator } from "../../src/v3/circuit/evidence-validator.js";
import { EngineeringWorkspace } from "../../src/v3/engineering/index.js";

function minimalContract(
  id: string,
  opts?: { require_independent_review?: boolean; work_id?: string },
): GoalContract {
  const ts = "2026-11-21T20:00:00.000Z";
  return {
    kind: "GoalContract",
    goal_contract_id: id,
    version: 1,
    created_at: ts,
    updated_at: ts,
    objective: "qual-01",
    scope: [],
    out_of_scope: [],
    functional_requirements: [],
    non_functional_requirements: [],
    constraints: [],
    dependencies: [],
    risks: [],
    work_id: opts?.work_id ?? `w-${id}`,
    require_independent_review: opts?.require_independent_review,
    criteria: [
      {
        id: "c1",
        description: "done",
        mandatory: true,
        verification: [{ id: "v", kind: "manual", description: "m" }],
        evidence_required: ["review"],
        state: "PASS",
        evidence_ids: ["ev-placeholder"],
        updated_at: ts,
      },
    ],
  };
}

describe("V2-QUAL-01 IndependentReviewGate", () => {
  let gate: IndependentReviewGate;

  beforeEach(() => {
    gate = new IndependentReviewGate({
      require_independent_review: true,
      clock: () => new Date("2026-11-21T20:00:00.000Z"),
    });
  });

  it("binds require_independent_review from Goal Contract", () => {
    const off = new IndependentReviewGate({ contract: minimalContract("gc-off") });
    expect(off.isRequired()).toBe(false);
    expect(contractRequiresIndependentReview(minimalContract("gc-off"))).toBe(false);

    const on = new IndependentReviewGate({
      contract: minimalContract("gc-on", { require_independent_review: true }),
    });
    expect(on.isRequired()).toBe(true);
    expect(
      contractRequiresIndependentReview(
        minimalContract("gc-on", { require_independent_review: true }),
      ),
    ).toBe(true);
  });

  it("submitReview accepts distinct agent and session with PASS", () => {
    const rec = gate.submitReview({
      executor_agent_id: "agent-exec",
      executor_session_id: "sess-exec",
      reviewer_agent_id: "agent-rev",
      reviewer_session_id: "sess-rev",
      verdict: "PASS",
      work_id: "w-1",
      goal_contract_id: "gc-1",
    });
    expect(rec.kind).toBe("IndependentReview");
    expect(rec.independent).toBe(true);
    expect(rec.session_separated).toBe(true);
    expect(rec.verdict).toBe("PASS");
    expect(gate.hasValidPassReview({ work_id: "w-1", goal_contract_id: "gc-1" })).toBe(true);
  });

  it("rejects reviewer_agent_id === executor_agent_id", () => {
    expect(() =>
      gate.submitReview({
        executor_agent_id: "same-agent",
        executor_session_id: "sess-a",
        reviewer_agent_id: "same-agent",
        reviewer_session_id: "sess-b",
        verdict: "PASS",
      }),
    ).toThrow(IndependentReviewError);
    try {
      gate.submitReview({
        executor_agent_id: "same-agent",
        executor_session_id: "sess-a",
        reviewer_agent_id: "same-agent",
        reviewer_session_id: "sess-b",
        verdict: "PASS",
      });
    } catch (e) {
      expect(e).toBeInstanceOf(IndependentReviewError);
      expect((e as IndependentReviewError).code).toBe("REVIEWER_IS_EXECUTOR");
    }
  });

  it("rejects same session_id even with different agents", () => {
    expect(() =>
      gate.submitReview({
        executor_agent_id: "agent-exec",
        executor_session_id: "sess-shared",
        reviewer_agent_id: "agent-rev",
        reviewer_session_id: "sess-shared",
        verdict: "PASS",
      }),
    ).toThrow(/SAME_SESSION|session/i);
    try {
      gate.submitReview({
        executor_agent_id: "agent-exec",
        executor_session_id: "sess-shared",
        reviewer_agent_id: "agent-rev",
        reviewer_session_id: "sess-shared",
        verdict: "PASS",
      });
    } catch (e) {
      expect((e as IndependentReviewError).code).toBe("SAME_SESSION");
    }
  });

  it("assertPassAllowed blocks TRUE_FULL_PASS and VERIFIED_PASS without valid review", () => {
    expect(() => gate.assertPassAllowed("TRUE_FULL_PASS")).toThrow(IndependentReviewError);
    try {
      gate.assertPassAllowed("VERIFIED_PASS");
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(IndependentReviewError);
      expect((e as IndependentReviewError).code).toBe("MISSING_INDEPENDENT_REVIEW");
      expect((e as IndependentReviewError).message).toMatch(/VERIFIED_PASS/);
    }

    gate.submitReview({
      executor_agent_id: "ex",
      executor_session_id: "s1",
      reviewer_agent_id: "rv",
      reviewer_session_id: "s2",
      verdict: "FAIL",
    });
    expect(() => gate.assertPassAllowed("TRUE_FULL_PASS")).toThrow(IndependentReviewError);

    gate.submitReview({
      executor_agent_id: "ex",
      executor_session_id: "s1",
      reviewer_agent_id: "rv",
      reviewer_session_id: "s2",
      verdict: "PASS",
    });
    expect(gate.assertPassAllowed("TRUE_FULL_PASS")?.verdict).toBe("PASS");
    expect(gate.assertPassAllowed("VERIFIED_PASS")?.verdict).toBe("PASS");
  });

  it("evaluateForPass allows when flag is off", () => {
    const soft = new IndependentReviewGate({ require_independent_review: false });
    expect(soft.evaluateForPass("TRUE_FULL_PASS").allowed).toBe(true);
    expect(soft.evaluateForPass("VERIFIED_PASS").allowed).toBe(true);
    expect(soft.assertPassAllowed("TRUE_FULL_PASS")).toBeNull();
  });
});

describe("V2-QUAL-01 verified-pass + evidence-validator integration", () => {
  let tmp: string;
  let goals: GoalContractStore;
  let evidence: EvidenceStore;
  let ws: EngineeringWorkspace;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v2-qual-01-"));
    goals = new GoalContractStore(path.join(tmp, "goals"));
    evidence = new EvidenceStore(path.join(tmp, "evidence"));
    ws = new EngineeringWorkspace(path.join(tmp, "ws"));
    ws.writeFile("src/a.js", "export const a = 1;\n");
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  function seedPassingEvidence(id: string, wid: string, reviewer: string, session: string) {
    const diff = evidence.create({
      evidence_kind: "diff",
      work_id: wid,
      goal_contract_id: id,
      workspace_root: ws.root,
      payload: { files_changed: ["src/a.js"] },
    });
    const test = evidence.create({
      evidence_kind: "test_result",
      work_id: wid,
      goal_contract_id: id,
      workspace_root: ws.root,
      payload: {
        exit_code: 0,
        tests_executed: 1,
        tests_skipped: 0,
        run_at: new Date().toISOString(),
      },
    });
    const review = evidence.create({
      evidence_kind: "review",
      work_id: wid,
      goal_contract_id: id,
      actor_agent_id: reviewer,
      workspace_root: ws.root,
      payload: {
        verdict: "PASS",
        reviewer_agent_id: reviewer,
        session_id: session,
      },
    });
    goals.updateCriterionState(id, "c-diff", "PASS", [diff.evidence_id]);
    goals.updateCriterionState(id, "c-tests", "PASS", [test.evidence_id]);
    goals.updateCriterionState(id, "c-review", "PASS", [review.evidence_id]);
  }

  it("GoalContractStore persists require_independent_review", () => {
    const c = goals.create({
      goal_contract_id: "gc-flag",
      objective: "flag",
      require_independent_review: true,
      criteria: [
        {
          id: "c1",
          description: "x",
          mandatory: true,
          verification: [{ id: "v", kind: "manual", description: "m" }],
          evidence_required: ["review"],
        },
      ],
    });
    expect(c.require_independent_review).toBe(true);
    expect(goals.loadLatest("gc-flag").require_independent_review).toBe(true);
  });

  it("evaluateVerifiedTrueFullPass blocks without IndependentReviewGate when flag set", () => {
    const id = "gc-vp-block";
    const wid = `w-${id}`;
    goals.create({
      goal_contract_id: id,
      objective: "block",
      work_id: wid,
      require_independent_review: true,
      criteria: [
        {
          id: "c-tests",
          description: "tests",
          mandatory: true,
          verification: [{ id: "v", kind: "test", description: "t" }],
          evidence_required: ["test_result"],
        },
        {
          id: "c-diff",
          description: "diff",
          mandatory: true,
          verification: [{ id: "v2", kind: "diff", description: "d" }],
          evidence_required: ["diff"],
        },
        {
          id: "c-review",
          description: "review",
          mandatory: true,
          verification: [{ id: "v3", kind: "manual", description: "r" }],
          evidence_required: ["review"],
        },
      ],
    });
    seedPassingEvidence(id, wid, "rev-a", "sess-rev");

    const withoutGate = evaluateVerifiedTrueFullPass(goals.loadLatest(id), {
      evidence,
      workspace_root: ws.root,
      implementer_agent_id: "exec-a",
      implementer_session_id: "sess-exec",
      require_code_changes: true,
    });
    expect(withoutGate.eligible).toBe(false);
    expect(withoutGate.adversarial_checks).toContain("reject_missing_independent_review_gate");
    expect(withoutGate.reasons.some((r) => r.includes("VERIFIED_PASS"))).toBe(true);

    const gate = new IndependentReviewGate({ require_independent_review: true });
    const stillMissing = evaluateVerifiedTrueFullPass(goals.loadLatest(id), {
      evidence,
      workspace_root: ws.root,
      implementer_agent_id: "exec-a",
      implementer_session_id: "sess-exec",
      require_code_changes: true,
      independent_review_gate: gate,
    });
    expect(stillMissing.eligible).toBe(false);
    expect(stillMissing.adversarial_checks).toContain("reject_missing_independent_review");

    gate.submitReview({
      executor_agent_id: "exec-a",
      executor_session_id: "sess-exec",
      reviewer_agent_id: "rev-a",
      reviewer_session_id: "sess-rev",
      verdict: "PASS",
      work_id: wid,
      goal_contract_id: id,
    });
    const ok = evaluateVerifiedTrueFullPass(goals.loadLatest(id), {
      evidence,
      workspace_root: ws.root,
      implementer_agent_id: "exec-a",
      implementer_session_id: "sess-exec",
      require_code_changes: true,
      independent_review_gate: gate,
    });
    expect(ok.eligible).toBe(true);
    expect(ok.work_state).toBe("TRUE_FULL_PASS");
  });

  it("evaluateVerifiedTrueFullPass rejects same-session review evidence", () => {
    const id = "gc-same-sess";
    const wid = `w-${id}`;
    goals.create({
      goal_contract_id: id,
      objective: "sess",
      work_id: wid,
      criteria: [
        {
          id: "c-tests",
          description: "tests",
          mandatory: true,
          verification: [{ id: "v", kind: "test", description: "t" }],
          evidence_required: ["test_result"],
        },
        {
          id: "c-diff",
          description: "diff",
          mandatory: true,
          verification: [{ id: "v2", kind: "diff", description: "d" }],
          evidence_required: ["diff"],
        },
        {
          id: "c-review",
          description: "review",
          mandatory: true,
          verification: [{ id: "v3", kind: "manual", description: "r" }],
          evidence_required: ["review"],
        },
      ],
    });
    seedPassingEvidence(id, wid, "rev-b", "sess-shared");
    const v = evaluateVerifiedTrueFullPass(goals.loadLatest(id), {
      evidence,
      workspace_root: ws.root,
      implementer_agent_id: "exec-b",
      implementer_session_id: "sess-shared",
      require_code_changes: true,
    });
    expect(v.eligible).toBe(false);
    expect(v.adversarial_checks).toContain("reject_same_session_review");
  });

  it("Evidence Validator blocks TRUE_FULL_PASS without valid independent review", async () => {
    const contract = minimalContract("gc-ev", {
      require_independent_review: true,
      work_id: "w-ev",
    });
    // Mark criteria PASS so evaluateTrueFullPass would otherwise succeed
    contract.criteria = contract.criteria.map((c) => ({
      ...c,
      state: "PASS" as const,
      evidence_ids: ["ev-ok"],
    }));

    const blocked = await runEvidenceValidator({
      workspace_root: ws.root,
      goal_contract: contract,
      skip_diff_gate: true,
      commands: [{ id: "true", argv: ["true"], cwd: ws.root }],
    });
    expect(blocked.status).not.toBe("TRUE_FULL_PASS");
    expect(blocked.reasons.some((r) => r.includes("independent_review"))).toBe(true);

    const gate = new IndependentReviewGate({ contract });
    gate.submitReview({
      executor_agent_id: "ex",
      executor_session_id: "s-ex",
      reviewer_agent_id: "rv",
      reviewer_session_id: "s-rv",
      verdict: "PASS",
      work_id: "w-ev",
      goal_contract_id: "gc-ev",
    });

    const passed = await runEvidenceValidator({
      workspace_root: ws.root,
      goal_contract: contract,
      skip_diff_gate: true,
      commands: [{ id: "true", argv: ["true"], cwd: ws.root }],
      independent_review_gate: gate,
    });
    expect(passed.status).toBe("TRUE_FULL_PASS");
    expect(passed.code).toBe("TRUE_FULL_PASS");
  });
});
