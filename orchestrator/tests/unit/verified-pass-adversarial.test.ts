/**
 * Adversarial TRUE_FULL_PASS — must reject false positives.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GoalContractStore } from "../../src/v3/goal-contract/index.js";
import {
  EvidenceStore,
  evaluateVerifiedTrueFullPass,
} from "../../src/v3/evaluation/index.js";
import { EngineeringWorkspace } from "../../src/v3/engineering/index.js";

describe("adversarial verified TRUE_FULL_PASS", () => {
  let tmp: string;
  let goals: GoalContractStore;
  let evidence: EvidenceStore;
  let ws: EngineeringWorkspace;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "adv-pass-"));
    goals = new GoalContractStore(path.join(tmp, "goals"));
    evidence = new EvidenceStore(path.join(tmp, "evidence"));
    ws = new EngineeringWorkspace(path.join(tmp, "ws"));
    ws.writeFile("src/a.js", "export const a = 1;\n");
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  function baseContract(id: string) {
    return goals.create({
      goal_contract_id: id,
      objective: "adv",
      work_id: `w-${id}`,
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
  }

  it("rejects claim of completion without file changes", () => {
    const id = "adv-nochange";
    baseContract(id);
    const wid = `w-${id}`;
    const diff = evidence.create({
      evidence_kind: "diff",
      work_id: wid,
      goal_contract_id: id,
      workspace_root: ws.root,
      payload: { files_changed: [] },
    });
    const test = evidence.create({
      evidence_kind: "test_result",
      work_id: wid,
      goal_contract_id: id,
      workspace_root: ws.root,
      payload: { exit_code: 0, tests_executed: 1, tests_skipped: 0, run_at: new Date().toISOString() },
    });
    const review = evidence.create({
      evidence_kind: "review",
      work_id: wid,
      goal_contract_id: id,
      actor_agent_id: `${wid}-reviewer`,
      workspace_root: ws.root,
      payload: { verdict: "PASS", reviewer_agent_id: `${wid}-reviewer` },
    });
    goals.updateCriterionState(id, "c-diff", "PASS", [diff.evidence_id]);
    goals.updateCriterionState(id, "c-tests", "PASS", [test.evidence_id]);
    goals.updateCriterionState(id, "c-review", "PASS", [review.evidence_id]);
    const v = evaluateVerifiedTrueFullPass(goals.loadLatest(id), {
      evidence,
      workspace_root: ws.root,
      implementer_agent_id: `${wid}-worker`,
      require_code_changes: true,
    });
    expect(v.eligible).toBe(false);
    expect(v.adversarial_checks).toContain("reject_claim_without_file_changes");
  });

  it("rejects tests not executed / ignored / wrong exit", () => {
    const id = "adv-notest";
    baseContract(id);
    const wid = `w-${id}`;
    const test = evidence.create({
      evidence_kind: "test_result",
      work_id: wid,
      goal_contract_id: id,
      workspace_root: ws.root,
      payload: { exit_code: 0, tests_executed: 0, tests_skipped: 0, ignored: true, run_at: new Date().toISOString() },
    });
    goals.updateCriterionState(id, "c-tests", "PASS", [test.evidence_id]);
    goals.updateCriterionState(id, "c-diff", "PASS", [
      evidence.create({
        evidence_kind: "diff",
        work_id: wid,
        goal_contract_id: id,
        workspace_root: ws.root,
        payload: { files_changed: ["src/a.js"] },
      }).evidence_id,
    ]);
    goals.updateCriterionState(id, "c-review", "PASS", [
      evidence.create({
        evidence_kind: "review",
        work_id: wid,
        goal_contract_id: id,
        actor_agent_id: "rev",
        workspace_root: ws.root,
        payload: { verdict: "PASS", reviewer_agent_id: "rev" },
      }).evidence_id,
    ]);
    const v = evaluateVerifiedTrueFullPass(goals.loadLatest(id), {
      evidence,
      workspace_root: ws.root,
      implementer_agent_id: "worker",
    });
    expect(v.eligible).toBe(false);
    expect(
      v.adversarial_checks.some((c) =>
        ["reject_no_tests_executed", "reject_ignored_tests"].includes(c),
      ),
    ).toBe(true);
  });

  it("rejects self-review", () => {
    const id = "adv-self";
    baseContract(id);
    const wid = `w-${id}`;
    const worker = `${wid}-worker`;
    goals.updateCriterionState(id, "c-tests", "PASS", [
      evidence.create({
        evidence_kind: "test_result",
        work_id: wid,
        goal_contract_id: id,
        workspace_root: ws.root,
        payload: { exit_code: 0, tests_executed: 2, run_at: new Date().toISOString() },
      }).evidence_id,
    ]);
    goals.updateCriterionState(id, "c-diff", "PASS", [
      evidence.create({
        evidence_kind: "diff",
        work_id: wid,
        goal_contract_id: id,
        workspace_root: ws.root,
        payload: { files_changed: ["src/a.js"] },
      }).evidence_id,
    ]);
    goals.updateCriterionState(id, "c-review", "PASS", [
      evidence.create({
        evidence_kind: "review",
        work_id: wid,
        goal_contract_id: id,
        actor_agent_id: worker,
        workspace_root: ws.root,
        payload: { verdict: "PASS", reviewer_agent_id: worker },
      }).evidence_id,
    ]);
    const v = evaluateVerifiedTrueFullPass(goals.loadLatest(id), {
      evidence,
      workspace_root: ws.root,
      implementer_agent_id: worker,
    });
    expect(v.eligible).toBe(false);
    expect(v.adversarial_checks).toContain("reject_self_review");
  });

  it("rejects corrupt evidence hash", async () => {
    const id = "adv-corrupt";
    baseContract(id);
    const wid = `w-${id}`;
    const rec = evidence.create({
      evidence_kind: "test_result",
      work_id: wid,
      goal_contract_id: id,
      workspace_root: ws.root,
      payload: { exit_code: 0, tests_executed: 1, run_at: new Date().toISOString() },
    });
    const p = path.join(tmp, "evidence", `${rec.evidence_id}.json`);
    const raw = JSON.parse(await fs.readFile(p, "utf-8"));
    raw.payload.fabricated = true;
    await fs.writeFile(p, JSON.stringify(raw));
    goals.updateCriterionState(id, "c-tests", "PASS", [rec.evidence_id]);
    const v = evaluateVerifiedTrueFullPass(goals.loadLatest(id), {
      evidence,
      workspace_root: ws.root,
    });
    expect(v.eligible).toBe(false);
    expect(v.reasons.some((r) => r.includes("content_hash_mismatch") || r.includes("integrity"))).toBe(
      true,
    );
  });

  it("rejects cross-contract evidence", () => {
    const id = "adv-xcontract";
    baseContract(id);
    const other = "gc-other";
    goals.create({
      goal_contract_id: other,
      objective: "other",
      criteria: [
        {
          id: "c1",
          description: "x",
          mandatory: true,
          verification: [{ id: "v", kind: "manual", description: "m" }],
          evidence_required: [],
        },
      ],
    });
    const wid = `w-${id}`;
    const stolen = evidence.create({
      evidence_kind: "test_result",
      work_id: wid,
      goal_contract_id: other,
      workspace_root: ws.root,
      payload: { exit_code: 0, tests_executed: 3, run_at: new Date().toISOString() },
    });
    goals.updateCriterionState(id, "c-tests", "PASS", [stolen.evidence_id]);
    goals.updateCriterionState(id, "c-diff", "PASS", [
      evidence.create({
        evidence_kind: "diff",
        work_id: wid,
        goal_contract_id: id,
        workspace_root: ws.root,
        payload: { files_changed: ["src/a.js"] },
      }).evidence_id,
    ]);
    goals.updateCriterionState(id, "c-review", "PASS", [
      evidence.create({
        evidence_kind: "review",
        work_id: wid,
        goal_contract_id: id,
        actor_agent_id: "rev",
        workspace_root: ws.root,
        payload: { verdict: "PASS", reviewer_agent_id: "rev" },
      }).evidence_id,
    ]);
    const v = evaluateVerifiedTrueFullPass(goals.loadLatest(id), {
      evidence,
      workspace_root: ws.root,
      implementer_agent_id: "w",
    });
    expect(v.eligible).toBe(false);
    expect(v.adversarial_checks).toContain("reject_cross_contract_evidence");
  });

  it("rejects missing review evidence", () => {
    const id = "adv-noreview";
    baseContract(id);
    const wid = `w-${id}`;
    goals.updateCriterionState(id, "c-tests", "PASS", [
      evidence.create({
        evidence_kind: "test_result",
        work_id: wid,
        goal_contract_id: id,
        workspace_root: ws.root,
        payload: { exit_code: 0, tests_executed: 1, run_at: new Date().toISOString() },
      }).evidence_id,
    ]);
    goals.updateCriterionState(id, "c-diff", "PASS", [
      evidence.create({
        evidence_kind: "diff",
        work_id: wid,
        goal_contract_id: id,
        workspace_root: ws.root,
        payload: { files_changed: ["src/a.js"] },
      }).evidence_id,
    ]);
    goals.updateCriterionState(id, "c-review", "PASS", []);
    const v = evaluateVerifiedTrueFullPass(goals.loadLatest(id), {
      evidence,
      workspace_root: ws.root,
      implementer_agent_id: "w",
    });
    expect(v.eligible).toBe(false);
  });
});
