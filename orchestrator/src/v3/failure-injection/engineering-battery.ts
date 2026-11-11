/**
 * Engineering-stage failure injection matrix (V3 finalization).
 * Exercises plan/implement/test/review/recovery stop conditions with ProgressTracker.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { V3DataPaths } from "../paths.js";
import { GoalContractStore } from "../goal-contract/store.js";
import { EvidenceStore } from "../evaluation/evidence.js";
import { evaluateVerifiedTrueFullPass } from "../evaluation/verified-pass.js";
import { ProgressTracker } from "../evaluation/progress.js";
import { EngineeringWorkspace } from "../engineering/workspace.js";
import { ContinuityEngine } from "../continuity/engine.js";
import { AgentRegistryStore } from "../agent-registry/store.js";
import { TaskGraphStore } from "../task-graph/store.js";

export interface EngScenarioResult {
  id: string;
  stage: string;
  passed: boolean;
  detail: string;
}

export interface EngFailureBatteryReport {
  kind: "EngineeringFailureBatteryReport";
  scenarios: EngScenarioResult[];
  passed: boolean;
  limitations: string[];
}

export function runEngineeringFailureBattery(
  paths: V3DataPaths,
  workspaceRoot: string,
): EngFailureBatteryReport {
  mkdirSync(workspaceRoot, { recursive: true });
  const scenarios: EngScenarioResult[] = [];

  scenarios.push(planIncomplete(paths));
  scenarios.push(ambiguousAcceptance(paths));
  scenarios.push(budgetInsufficient());
  scenarios.push(providerUnavailableRecovery(paths));
  scenarios.push(testFailThenStop(paths, workspaceRoot));
  scenarios.push(staleTestRejected(paths, workspaceRoot));
  scenarios.push(selfReviewRejected(paths, workspaceRoot));
  scenarios.push(missingEvidenceRejected(paths, workspaceRoot));
  scenarios.push(antiLoopExcessiveReplans());
  scenarios.push(duplicateTaskDetection());

  return {
    kind: "EngineeringFailureBatteryReport",
    scenarios,
    passed: scenarios.every((s) => s.passed),
    limitations: [
      "Deterministic in-process injections — not live LLM/provider crashes",
      "Harness process kill is out of scope (Core cancel only)",
    ],
  };
}

function planIncomplete(paths: V3DataPaths): EngScenarioResult {
  const id = "plan_incomplete";
  try {
    const goals = new GoalContractStore(paths.goalContractsDir);
    const gid = `gc-fail-plan-${randomUUID().slice(0, 6)}`;
    goals.create({
      goal_contract_id: gid,
      objective: "incomplete plan",
      criteria: [
        {
          id: "c1",
          description: "never started",
          mandatory: true,
          verification: [{ id: "v1", kind: "manual", description: "x" }],
          evidence_required: ["diff"],
          state: "NOT_STARTED",
        },
      ],
    });
    const ev = goals.evaluate(gid);
    return { id, stage: "PLAN", passed: !ev.eligible, detail: ev.reasons.join(",") };
  } catch (e) {
    return { id, stage: "PLAN", passed: false, detail: String(e) };
  }
}

function ambiguousAcceptance(paths: V3DataPaths): EngScenarioResult {
  const id = "ambiguous_acceptance_blocked";
  try {
    const goals = new GoalContractStore(paths.goalContractsDir);
    const gid = `gc-fail-amb-${randomUUID().slice(0, 6)}`;
    goals.create({
      goal_contract_id: gid,
      objective: "ambiguous",
      criteria: [
        {
          id: "c1",
          description: "something good happens",
          mandatory: true,
          verification: [{ id: "v1", kind: "manual", description: "vague" }],
          evidence_required: ["review"],
          state: "BLOCKED",
        },
      ],
    });
    const ev = goals.evaluate(gid);
    return {
      id,
      stage: "PLAN",
      passed: !ev.eligible && ev.reasons.some((r) => r.includes("blocked") || r.includes("incomplete")),
      detail: ev.reasons.join(","),
    };
  } catch (e) {
    return { id, stage: "PLAN", passed: false, detail: String(e) };
  }
}

function budgetInsufficient(): EngScenarioResult {
  const id = "budget_insufficient_stop";
  const p = new ProgressTracker({ max_replans: 1, max_same_error: 2, max_reverts: 1, max_redundant_delegations: 1 });
  p.record("budget_exceeded", "tokens");
  const v = p.evaluate();
  return {
    id,
    stage: "PLAN",
    passed: !v.allow_continue && (v.action === "PAUSE" || v.action === "STOP_FAILED"),
    detail: `${v.action}:${v.reasons.join(",")}`,
  };
}

function providerUnavailableRecovery(paths: V3DataPaths): EngScenarioResult {
  const id = "provider_unavailable_handoff";
  try {
    const workId = `w-fail-prov-${randomUUID().slice(0, 6)}`;
    const goals = new GoalContractStore(paths.goalContractsDir);
    const agents = new AgentRegistryStore(paths.agentsDir);
    const tasks = new TaskGraphStore(paths.taskGraphsDir);
    const gid = `gc-${workId}`;
    goals.create({
      goal_contract_id: gid,
      objective: "prov",
      work_id: workId,
      criteria: [
        {
          id: "c1",
          description: "x",
          mandatory: true,
          verification: [{ id: "v1", kind: "manual", description: "x" }],
          evidence_required: [],
        },
      ],
    });
    tasks.create(workId, gid, 1);
    tasks.addTask(workId, {
      task_id: "t1",
      goal_contract_id: gid,
      goal_contract_version: 1,
      title: "t",
      task_kind: "implement",
      depends_on: [],
    });
    agents.ensure(workId);
    agents.register({
      agent_id: `${workId}-m`,
      role: "master",
      work_id: workId,
      permissions: { allowWrite: true, allowSpawn: true },
    });
    agents.activate(workId, `${workId}-m`);
    agents.register({
      agent_id: `${workId}-w`,
      role: "worker",
      work_id: workId,
      parent_agent_id: `${workId}-m`,
      task_id: "t1",
      permissions: { allowWrite: true },
      delegation: {
        delegation_id: `dlg-${workId}-w`,
        role: "worker",
        objective: "impl",
        scope: ["x"],
        out_of_scope: [],
        task_id: "t1",
        authorized_inputs: [],
        deliverables: [],
        criteria_ids: [],
        permissions: { allowWrite: true },
        budget: {},
        expected_evidence: [],
        termination_condition: "done",
      },
    });
    agents.activate(workId, `${workId}-w`);
    tasks.setTaskState(workId, "t1", "IN_PROGRESS");
    const engine = new ContinuityEngine(paths);
    const pkg = engine.createHandoff({
      work_id: workId,
      agent_id: `${workId}-w`,
      trigger: "PROVIDER_UNAVAILABLE",
      reason: "injected",
      next_action: "retry with substitute",
    });
    const applied = engine.applyHandoff(pkg.handoff_id, { create_substitute: true });
    return {
      id,
      stage: "IMPLEMENT",
      passed: applied.status === "applied" && Boolean(applied.to_agent_id),
      detail: `status=${applied.status} to=${applied.to_agent_id}`,
    };
  } catch (e) {
    return { id, stage: "IMPLEMENT", passed: false, detail: String(e) };
  }
}

function testFailThenStop(paths: V3DataPaths, workspaceRoot: string): EngScenarioResult {
  const id = "test_fail_no_true_full_pass";
  try {
    const ws = new EngineeringWorkspace(join(workspaceRoot, id));
    ws.writeFile("test/x.test.js", "import test from 'node:test';\ntest('x', () => { throw new Error('boom'); });\n");
    const run = ws.run("node", ["--test", "test/x.test.js"]);
    const evidence = new EvidenceStore(paths.evidenceDir);
    const goals = new GoalContractStore(paths.goalContractsDir);
    const gid = `gc-fail-test-${randomUUID().slice(0, 6)}`;
    const wid = `w-${gid}`;
    goals.create({
      goal_contract_id: gid,
      objective: "fail test",
      work_id: wid,
      criteria: [
        {
          id: "c-tests",
          description: "tests",
          mandatory: true,
          verification: [{ id: "v", kind: "test", description: "t" }],
          evidence_required: ["test_result"],
        },
      ],
    });
    const ev = evidence.create({
      evidence_kind: "test_result",
      work_id: wid,
      goal_contract_id: gid,
      workspace_root: ws.root,
      payload: { exit_code: run.status, tests_executed: 1, tests_skipped: 0, run_at: new Date().toISOString() },
    });
    goals.updateCriterionState(gid, "c-tests", "PASS", [ev.evidence_id]); // agent lies
    const verdict = evaluateVerifiedTrueFullPass(goals.loadLatest(gid), {
      evidence,
      workspace_root: ws.root,
    });
    return {
      id,
      stage: "TEST",
      passed: !verdict.eligible && verdict.reasons.some((r) => r.includes("exit") || r.includes("test")),
      detail: verdict.reasons.join(","),
    };
  } catch (e) {
    return { id, stage: "TEST", passed: false, detail: String(e) };
  }
}

function staleTestRejected(paths: V3DataPaths, workspaceRoot: string): EngScenarioResult {
  const id = "stale_test_before_mutation";
  try {
    const ws = new EngineeringWorkspace(join(workspaceRoot, id));
    ws.writeFile("a.js", "export const x=1;\n");
    const evidence = new EvidenceStore(paths.evidenceDir);
    const goals = new GoalContractStore(paths.goalContractsDir);
    const gid = `gc-stale-${randomUUID().slice(0, 6)}`;
    const wid = `w-${gid}`;
    goals.create({
      goal_contract_id: gid,
      objective: "stale",
      work_id: wid,
      criteria: [
        {
          id: "c-tests",
          description: "tests",
          mandatory: true,
          verification: [{ id: "v", kind: "test", description: "t" }],
          evidence_required: ["test_result"],
        },
      ],
    });
    const mutationAt = new Date().toISOString();
    const ev = evidence.create({
      evidence_kind: "test_result",
      work_id: wid,
      goal_contract_id: gid,
      workspace_root: ws.root,
      payload: {
        exit_code: 0,
        tests_executed: 2,
        tests_skipped: 0,
        run_at: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    goals.updateCriterionState(gid, "c-tests", "PASS", [ev.evidence_id]);
    const verdict = evaluateVerifiedTrueFullPass(goals.loadLatest(gid), {
      evidence,
      workspace_root: ws.root,
      last_mutation_at: mutationAt,
    });
    return {
      id,
      stage: "TEST",
      passed: !verdict.eligible && verdict.adversarial_checks.includes("reject_stale_test_before_mutation"),
      detail: verdict.reasons.join(","),
    };
  } catch (e) {
    return { id, stage: "TEST", passed: false, detail: String(e) };
  }
}

function selfReviewRejected(paths: V3DataPaths, workspaceRoot: string): EngScenarioResult {
  const id = "self_review_rejected";
  try {
    const ws = new EngineeringWorkspace(join(workspaceRoot, id));
    ws.writeFile("a.js", "ok\n");
    const evidence = new EvidenceStore(paths.evidenceDir);
    const goals = new GoalContractStore(paths.goalContractsDir);
    const gid = `gc-self-${randomUUID().slice(0, 6)}`;
    const wid = `w-${gid}`;
    const worker = `${wid}-worker`;
    goals.create({
      goal_contract_id: gid,
      objective: "self",
      work_id: wid,
      criteria: [
        {
          id: "c-review",
          description: "review",
          mandatory: true,
          verification: [{ id: "v", kind: "manual", description: "r" }],
          evidence_required: ["review"],
        },
      ],
    });
    const ev = evidence.create({
      evidence_kind: "review",
      work_id: wid,
      goal_contract_id: gid,
      actor_agent_id: worker,
      workspace_root: ws.root,
      payload: { verdict: "PASS", reviewer_agent_id: worker },
    });
    goals.updateCriterionState(gid, "c-review", "PASS", [ev.evidence_id]);
    const verdict = evaluateVerifiedTrueFullPass(goals.loadLatest(gid), {
      evidence,
      workspace_root: ws.root,
      implementer_agent_id: worker,
    });
    return {
      id,
      stage: "REVIEW",
      passed: !verdict.eligible && verdict.adversarial_checks.includes("reject_self_review"),
      detail: verdict.reasons.join(","),
    };
  } catch (e) {
    return { id, stage: "REVIEW", passed: false, detail: String(e) };
  }
}

function missingEvidenceRejected(paths: V3DataPaths, workspaceRoot: string): EngScenarioResult {
  const id = "missing_evidence_rejected";
  try {
    const ws = new EngineeringWorkspace(join(workspaceRoot, id));
    writeFileSync(join(ws.root, "x.txt"), "x");
    const evidence = new EvidenceStore(paths.evidenceDir);
    const goals = new GoalContractStore(paths.goalContractsDir);
    const gid = `gc-miss-${randomUUID().slice(0, 6)}`;
    goals.create({
      goal_contract_id: gid,
      objective: "miss",
      work_id: `w-${gid}`,
      criteria: [
        {
          id: "c1",
          description: "need evidence",
          mandatory: true,
          verification: [{ id: "v", kind: "test", description: "t" }],
          evidence_required: ["test_result"],
          state: "PASS",
        },
      ],
    });
    // PASS with empty evidence_ids via revise trick — updateCriterion without evidence keeps empty
    const verdict = evaluateVerifiedTrueFullPass(goals.loadLatest(gid), {
      evidence,
      workspace_root: ws.root,
    });
    // create left state NOT_STARTED; force PASS without evidence:
    goals.updateCriterionState(gid, "c1", "PASS", []);
    const verdict2 = evaluateVerifiedTrueFullPass(goals.loadLatest(gid), {
      evidence,
      workspace_root: ws.root,
    });
    return {
      id,
      stage: "VERIFY",
      passed: !verdict2.eligible,
      detail: `${verdict.reasons.join(",")}|${verdict2.reasons.join(",")}`,
    };
  } catch (e) {
    return { id, stage: "VERIFY", passed: false, detail: String(e) };
  }
}

function antiLoopExcessiveReplans(): EngScenarioResult {
  const id = "anti_loop_excessive_replans";
  const p = new ProgressTracker({ max_replans: 2, max_same_error: 5, max_reverts: 5, max_redundant_delegations: 5 });
  p.record("replan");
  p.record("replan");
  p.record("replan");
  const v = p.evaluate();
  return {
    id,
    stage: "RECOVERY",
    passed: !v.allow_continue && v.action === "STOP_FAILED",
    detail: `${v.action}:${v.reasons.join(",")}`,
  };
}

function duplicateTaskDetection(): EngScenarioResult {
  const id = "duplicate_task_rejected";
  try {
    // Simulated: ProgressTracker redundant_delegation + same error signature
    const p = new ProgressTracker({ max_replans: 5, max_same_error: 2, max_reverts: 5, max_redundant_delegations: 2 });
    p.record("redundant_delegation", "eng-implement");
    p.record("redundant_delegation", "eng-implement");
    p.record("same_error", "dup", "task_duplicate");
    p.record("same_error", "dup", "task_duplicate");
    const v = p.evaluate();
    return {
      id,
      stage: "PLAN",
      passed: !v.allow_continue,
      detail: v.reasons.join(","),
    };
  } catch (e) {
    return { id, stage: "PLAN", passed: false, detail: String(e) };
  }
}
