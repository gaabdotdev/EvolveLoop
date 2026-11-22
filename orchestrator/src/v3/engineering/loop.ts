/**
 * V3.4 Engineering Loop — integrates Goal Contract, TaskGraph, hierarchy,
 * confined workspace mutations, independent review, tests, replan, verify.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { V3DataPaths } from "../paths.js";
import { GoalContractStore } from "../goal-contract/store.js";
import { CoordinatorService } from "../coordinator/service.js";
import { AgentRegistryStore } from "../agent-registry/store.js";
import { TaskGraphStore } from "../task-graph/store.js";
import { spawnDomainHierarchy, approveDomainPlan, spawnAuxiliary } from "../hierarchy/spawn.js";
import { CoordinationEventLog } from "../event-log/store.js";
import { WorkLedgerStore } from "../work-ledger/store.js";
import { scheduleReadyTasks } from "../parallel/scheduler.js";
import { EngineeringWorkspace, walkRelFiles } from "./workspace.js";
import type {
  EngineeringLoopResult,
  EngineeringRun,
  EngineeringStageId,
  StageRecord,
} from "./types.js";

const LIMITATIONS = [
  "Workspace confinement is realpath-based — not a full OS sandbox",
  "Implement/fix/review stages use Core deterministic workers, not LLM generation",
  "TRUE_FULL_PASS only via GoalContractStore.evaluate (never agent prose)",
  "Harness adapters remain classified separately (see harness-matrix)",
];

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

function stage(
  id: EngineeringStageId,
  status: StageRecord["status"],
  extra: Partial<StageRecord> = {},
): StageRecord {
  return {
    stage_id: id,
    status,
    evidence_ids: [],
    artifacts: [],
    ...extra,
  };
}

export interface EngineeringLoopInput {
  work_id: string;
  workspace_root: string;
  /** Optional existing goal; otherwise created from objective */
  goal_contract_id?: string;
  objective?: string;
  domain?: string;
  max_replans?: number;
  /** Relative path to implement (default src/solution.js) */
  solution_relpath?: string;
  /** Spec: buggy→fixed content for deterministic engineering demo */
  initial_solution?: string;
  fixed_solution?: string;
  test_command?: { cmd: string; args: string[] };
}

export class EngineeringLoopService {
  constructor(private readonly paths: V3DataPaths) {
    mkdirSync(join(paths.root, "engineering-runs"), { recursive: true });
  }

  private runPath(runId: string): string {
    return join(this.paths.root, "engineering-runs", `${runId}.json`);
  }

  load(runId: string): EngineeringRun {
    const path = this.runPath(runId);
    if (!existsSync(path)) throw new Error(`ENGINEERING_RUN_NOT_FOUND: ${runId}`);
    return JSON.parse(readFileSync(path, "utf-8")) as EngineeringRun;
  }

  private save(run: EngineeringRun): void {
    run.updated_at = nowIso();
    atomicWrite(this.runPath(run.run_id), JSON.stringify(run, null, 2));
  }

  /**
   * Execute a complete engineering cycle against a real workspace.
   * Deterministic implement/fix/review suitable for CI without LLM keys.
   */
  run(input: EngineeringLoopInput): EngineeringLoopResult {
    const events = new CoordinationEventLog(this.paths.eventLogDir);
    const ledger = new WorkLedgerStore(this.paths.workLedgerDir);
    const goals = new GoalContractStore(this.paths.goalContractsDir);
    const coordinator = new CoordinatorService(this.paths);
    const agents = new AgentRegistryStore(this.paths.agentsDir);
    const tasks = new TaskGraphStore(this.paths.taskGraphsDir);
    const ws = new EngineeringWorkspace(input.workspace_root);
    const before = new Set(walkRelFiles(ws.root));

    const objective =
      input.objective ??
      (input.goal_contract_id
        ? goals.loadLatest(input.goal_contract_id).objective
        : "Engineering objective");
    const domain = input.domain ?? "backend";
    const solutionRel = input.solution_relpath ?? "src/solution.js";
    const testCmd = input.test_command ?? { cmd: "node", args: ["--test", "test/solution.test.js"] };

    // CONTRACT
    let goalId = input.goal_contract_id;
    let goalVersion = 1;
    if (!goalId) {
      goalId = `gc-eng-${randomUUID().slice(0, 8)}`;
      const contract = goals.create({
        goal_contract_id: goalId,
        objective,
        scope: [`workspace:${ws.root}`, `domain:${domain}`],
        out_of_scope: ["unrelated refactors"],
        criteria: [
          {
            id: "c-tests",
            description: "Automated tests pass in workspace",
            mandatory: true,
            verification: [{ id: "v-test", kind: "test", description: "node --test" }],
            evidence_required: ["test-log"],
          },
          {
            id: "c-solution",
            description: `Solution file ${solutionRel} exists and exports expected behavior`,
            mandatory: true,
            verification: [{ id: "v-file", kind: "manual", description: "file inspection" }],
            evidence_required: ["solution-path"],
          },
          {
            id: "c-review",
            description: "Independent review agent recorded PASS",
            mandatory: true,
            verification: [{ id: "v-review", kind: "manual", description: "review artifact" }],
            evidence_required: ["review-report"],
          },
        ],
      });
      goalVersion = contract.version;
    } else {
      goalVersion = goals.loadLatest(goalId).version;
    }

    // Ensure work registered
    try {
      coordinator.registerWork(input.work_id, goalId, goalVersion);
    } catch {
      /* work may already exist */
    }
    const snap = agents.ensure(input.work_id);
    if (!snap.agents.some((a) => a.role === "master")) {
      agents.register({
        agent_id: `${input.work_id}-master`,
        role: "master",
        work_id: input.work_id,
        permissions: { allowWrite: true, allowSpawn: true, allowHostInspect: true, allowShell: true },
      });
      agents.activate(input.work_id, `${input.work_id}-master`);
    }

    const run: EngineeringRun = {
      kind: "EngineeringRun",
      run_id: `er-${randomUUID()}`,
      work_id: input.work_id,
      goal_contract_id: goalId,
      goal_contract_version: goalVersion,
      workspace_root: ws.root,
      stages: [],
      current_stage: "INTAKE",
      work_state: "IN_PROGRESS",
      replan_count: 0,
      max_replans: input.max_replans ?? 2,
      created_at: nowIso(),
      updated_at: nowIso(),
      limitations: [...LIMITATIONS],
    };

    const mark = (id: EngineeringStageId, status: StageRecord["status"], extra: Partial<StageRecord> = {}) => {
      run.stages.push(
        stage(id, status, {
          started_at: nowIso(),
          finished_at: nowIso(),
          ...extra,
        }),
      );
      run.current_stage = id;
      this.save(run);
    };

    mark("INTAKE", "PASSED", { notes: `objective=${objective}` });
    mark("CONTRACT", "PASSED", {
      notes: `goal=${goalId}@v${goalVersion}`,
      artifacts: [`goal-contracts/${goalId}`],
    });

    // ANALYZE — inspect workspace
    const listing = walkRelFiles(ws.root);
    mark("ANALYZE", "PASSED", {
      notes: `files=${listing.length}`,
      artifacts: listing.slice(0, 20),
    });

    // PLAN — hierarchy + tasks
    try {
      spawnDomainHierarchy(this.paths, { work_id: input.work_id, domains: [domain] });
    } catch {
      /* domain may exist */
    }
    try {
      approveDomainPlan(this.paths, input.work_id, domain, 1);
    } catch {
      /* already approved */
    }
    const graph = tasks.load(input.work_id);
    if (!graph.tasks.some((t) => t.task_id === "eng-implement")) {
      tasks.addTask(input.work_id, {
        task_id: "eng-implement",
        goal_contract_id: goalId,
        goal_contract_version: goalVersion,
        title: "Implement solution",
        domain,
        task_kind: "implement",
        depends_on: [`plan-${domain}`],
      });
    }
    if (!graph.tasks.some((t) => t.task_id === "eng-review")) {
      tasks.addTask(input.work_id, {
        task_id: "eng-review",
        goal_contract_id: goalId,
        goal_contract_version: goalVersion,
        title: "Independent review",
        domain,
        task_kind: "verify",
        depends_on: ["eng-implement"],
      });
    }
    scheduleReadyTasks(this.paths, input.work_id, { max_in_progress: 2 });
    mark("PLAN", "PASSED", {
      notes: "hierarchy+PLAN_APPROVED+eng tasks",
      actor_agent_id: `${input.work_id}-planner-${domain}`,
    });

    // Seed tests + optional buggy solution
    const testRel = "test/solution.test.js";
    if (!ws.exists(testRel)) {
      ws.writeFile(
        testRel,
        [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "import { add } from '../src/solution.js';",
          "test('add(2,3) === 5', () => { assert.equal(add(2, 3), 5); });",
          "",
        ].join("\n"),
      );
    }
    const buggy =
      input.initial_solution ??
      "export function add(a, b) {\n  return a - b; // intentional bug\n}\n";
    const fixed =
      input.fixed_solution ?? "export function add(a, b) {\n  return a + b;\n}\n";

    // IMPLEMENT (buggy first if file missing)
    const workerId = `${input.work_id}-worker-eng`;
    if (!agents.load(input.work_id).agents.some((a) => a.agent_id === workerId)) {
      agents.register({
        agent_id: workerId,
        role: "worker",
        work_id: input.work_id,
        domain,
        parent_agent_id: `${input.work_id}-leader-${domain}`,
        task_id: "eng-implement",
        // Permissions ⊆ leader (childPerms: write/hostInspect/spawn; shell false)
        permissions: { allowWrite: true, allowHostInspect: true, allowSpawn: true },
        delegation: {
          delegation_id: `dlg-${workerId}`,
          role: "worker",
          objective: "Implement solution",
          scope: [domain, "src"],
          out_of_scope: [],
          task_id: "eng-implement",
          authorized_inputs: ["goal_contract"],
          deliverables: [solutionRel],
          criteria_ids: ["c-solution", "c-tests"],
          permissions: { allowWrite: true, allowHostInspect: true, allowSpawn: true },
          budget: { max_children: 2 },
          expected_evidence: ["solution-path"],
          termination_condition: "TRUE_PASS or FAILED",
        },
      });
      agents.activate(input.work_id, workerId);
    }
    ws.writeFile(solutionRel, buggy);
    tasks.setTaskState(input.work_id, "eng-implement", "IN_PROGRESS");
    tasks.setTaskOwner(input.work_id, "eng-implement", workerId);
    mark("IMPLEMENT", "PASSED", {
      actor_agent_id: workerId,
      artifacts: [solutionRel],
      notes: "wrote initial solution (may be buggy for diagnose/fix cycle)",
    });

    // TEST
    let testResult = ws.run(testCmd.cmd, testCmd.args);
    mark("TEST", testResult.status === 0 ? "PASSED" : "FAILED", {
      notes: `exit=${testResult.status}`,
      artifacts: ["test-log"],
      evidence_ids: ["test-log"],
    });
    ws.writeFile(
      ".evolveloop/test-log.txt",
      `status=${testResult.status}\nstdout:\n${testResult.stdout}\nstderr:\n${testResult.stderr}\n`,
    );

    // DIAGNOSE + FIX + REPLAN if failed
    let reviewPassed = false;
    while (testResult.status !== 0 && run.replan_count < run.max_replans) {
      mark("DIAGNOSE", "PASSED", {
        actor_agent_id: workerId,
        notes: "test failure detected; preparing fix",
      });
      try {
        spawnAuxiliary(this.paths, {
          work_id: input.work_id,
          parent_agent_id: workerId,
          objective: "Investigate failing add() tests",
          domain,
        });
      } catch {
        /* optional */
      }
      mark("REPLAN", "PASSED", {
        notes: `replan #${run.replan_count + 1}: replace buggy implementation`,
      });
      run.replan_count += 1;
      mark("FIX", "PASSED", {
        actor_agent_id: workerId,
        artifacts: [solutionRel],
      });
      ws.writeFile(solutionRel, fixed);
      testResult = ws.run(testCmd.cmd, testCmd.args);
      mark("TEST", testResult.status === 0 ? "PASSED" : "FAILED", {
        notes: `retest exit=${testResult.status}`,
        evidence_ids: ["test-log"],
      });
      ws.writeFile(
        ".evolveloop/test-log.txt",
        `status=${testResult.status}\nstdout:\n${testResult.stdout}\nstderr:\n${testResult.stderr}\n`,
      );
    }

    // REVIEW — independent agent (not the worker)
    const reviewerId = `${input.work_id}-reviewer-eng`;
    if (!agents.load(input.work_id).agents.some((a) => a.agent_id === reviewerId)) {
      agents.register({
        agent_id: reviewerId,
        role: "verifier",
        work_id: input.work_id,
        domain,
        parent_agent_id: `${input.work_id}-leader-${domain}`,
        task_id: "eng-review",
        permissions: { allowWrite: true, allowHostInspect: true },
        delegation: {
          delegation_id: `dlg-${reviewerId}`,
          role: "verifier",
          objective: "Independent review",
          scope: [domain, "review"],
          out_of_scope: ["implementation"],
          task_id: "eng-review",
          authorized_inputs: ["solution", "tests"],
          deliverables: ["review-report"],
          criteria_ids: ["c-review"],
          permissions: { allowWrite: true, allowHostInspect: true },
          budget: {},
          expected_evidence: ["review-report"],
          termination_condition: "review recorded",
        },
      });
      agents.activate(input.work_id, reviewerId);
    }
    const solutionSrc = ws.readFileHost(solutionRel);
    reviewPassed =
      testResult.status === 0 &&
      solutionSrc.includes("return a + b") &&
      !solutionSrc.includes("return a - b");
    ws.writeFile(
      ".evolveloop/review-report.md",
      [
        `# Review by ${reviewerId}`,
        ``,
        `- worker: ${workerId}`,
        `- tests_pass: ${testResult.status === 0}`,
        `- solution_ok: ${reviewPassed}`,
        `- verdict: ${reviewPassed ? "PASS" : "FAIL"}`,
        ``,
      ].join("\n"),
    );
    tasks.setTaskState(input.work_id, "eng-review", reviewPassed ? "TRUE_PASS" : "FAILED");
    tasks.setTaskOwner(input.work_id, "eng-review", reviewerId);
    if (testResult.status === 0) {
      tasks.setTaskState(input.work_id, "eng-implement", "TRUE_PASS");
    }
    mark("REVIEW", reviewPassed ? "PASSED" : "FAILED", {
      actor_agent_id: reviewerId,
      artifacts: [".evolveloop/review-report.md"],
      evidence_ids: ["review-report"],
    });

    // VERIFY — bind evidence to criteria; evaluate TRUE_FULL_PASS
    if (testResult.status === 0) {
      goals.updateCriterionState(goalId, "c-tests", "PASS", ["test-log"]);
    } else {
      goals.updateCriterionState(goalId, "c-tests", "FAIL", ["test-log"]);
    }
    if (ws.exists(solutionRel)) {
      goals.updateCriterionState(goalId, "c-solution", "PASS", ["solution-path"]);
    }
    if (reviewPassed) {
      goals.updateCriterionState(goalId, "c-review", "PASS", ["review-report"]);
    } else {
      goals.updateCriterionState(goalId, "c-review", "FAIL", ["review-report"]);
    }
    const evaluation = goals.evaluate(goalId);
    run.work_state = evaluation.eligible ? "TRUE_FULL_PASS" : "NOT_PASS";
    mark("VERIFY", evaluation.eligible ? "PASSED" : "FAILED", {
      notes: evaluation.reasons.join("; "),
    });
    mark("DONE", evaluation.eligible ? "PASSED" : "FAILED");

    const after = new Set(walkRelFiles(ws.root));
    const workspace_changes = [...after].filter((p) => !before.has(p)).sort();

    events.append({
      work_id: input.work_id,
      type: "engineering.loop.completed",
      actor: "engineering-loop",
      payload: {
        run_id: run.run_id,
        true_full_pass: evaluation.eligible,
        replan_count: run.replan_count,
      },
    });
    ledger.append({
      work_id: input.work_id,
      type: "note",
      origin: "engineering.loop",
      goal_contract_id: goalId,
      payload: {
        run_id: run.run_id,
        true_full_pass: evaluation.eligible,
        workspace_changes,
      },
      provenance: { source: "engineering-loop", refs: [run.run_id] },
    });
    if (evaluation.eligible) {
      ledger.recordStateChange(input.work_id, "TRUE_FULL_PASS", "engineering.loop");
    }

    this.save(run);
    return {
      kind: "EngineeringLoopResult",
      run,
      true_full_pass: evaluation.eligible,
      reasons: evaluation.reasons,
      workspace_changes,
      test_exit_code: testResult.status,
      review_passed: reviewPassed,
      limitations: [...LIMITATIONS],
    };
  }
}
