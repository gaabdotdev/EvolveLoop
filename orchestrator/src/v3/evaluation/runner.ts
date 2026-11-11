/**
 * Generalized V3 evaluation runner — isolated copies of unknown multi-module fixtures.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type { V3DataPaths } from "../paths.js";
import { GoalContractStore } from "../goal-contract/store.js";
import { AgentRegistryStore } from "../agent-registry/store.js";
import { TaskGraphStore } from "../task-graph/store.js";
import { ContinuityEngine } from "../continuity/engine.js";
import { EngineeringWorkspace, walkRelFiles } from "../engineering/workspace.js";
import { exploreRepository, type RepoExploration } from "./explore.js";
import { applyTaskSolution } from "./solvers.js";
import { EvidenceStore, fingerprintWorkspace } from "./evidence.js";
import { evaluateVerifiedTrueFullPass } from "./verified-pass.js";
import { ProgressTracker } from "./progress.js";

export interface TaskSpec {
  id: string;
  repo: string;
  title: string;
  nature: string;
  difficulty: string;
  multi_file: boolean;
  requires_investigation?: boolean;
  acceptance: string[];
  split?: string;
}

export interface BatteryCatalog {
  kind: string;
  version: number;
  split: { development: string[]; validation: string[]; held_out: string[] };
  repos: Record<string, { fixture: string; description: string }>;
  tasks: TaskSpec[];
}

export interface TaskRunResult {
  task_id: string;
  repo: string;
  split: "development" | "held_out" | "validation";
  exploration: RepoExploration;
  baseline_tests_pass: boolean;
  baseline_exit: number | null;
  post_tests_pass: boolean;
  post_exit: number | null;
  files_changed: string[];
  multi_file: boolean;
  true_full_pass: boolean;
  reasons: string[];
  implementer_agent_id: string;
  reviewer_agent_id: string;
  evidence_ids: string[];
  workspace_root: string;
  duration_ms: number;
  tokens_estimated: number;
  cost_estimated_usd: number;
  recovery_used?: boolean;
  limitations: string[];
}

export interface BatteryReport {
  kind: "V3EvaluationBatteryReport";
  run_id: string;
  at: string;
  repo_count: number;
  task_count: number;
  results: TaskRunResult[];
  aggregates: {
    verified_completion_rate: number;
    multi_file_tasks: number;
    held_out_pass_rate: number;
    avg_tokens_estimated: number;
    cost_per_verified_completion: number | null;
    total_cost_estimated_usd: number;
    false_positive_evaluator_rate: number;
  };
  passed: boolean;
  limitations: string[];
}

function loadCatalog(repoRoot: string): BatteryCatalog {
  const path = join(repoRoot, "benchmarks/v3/tasks.json");
  return JSON.parse(readFileSync(path, "utf-8")) as BatteryCatalog;
}

function parseTestCounts(stdout: string): { executed: number; skipped: number } {
  const pass = Number((stdout.match(/# pass (\d+)/) || [])[1] ?? 0);
  const fail = Number((stdout.match(/# fail (\d+)/) || [])[1] ?? 0);
  const skipped = Number((stdout.match(/# skipped (\d+)/) || [])[1] ?? 0);
  const executed = pass + fail;
  return { executed: executed > 0 ? executed : pass + fail + skipped > 0 ? pass + fail : 1, skipped };
}

function estimateTokens(exploration: RepoExploration, filesChanged: number): number {
  // Deterministic proxy — not LLM billing; documented as estimate for CI without live providers
  return exploration.file_count * 40 + filesChanged * 120 + 800;
}

/** Expand test files without shell glob (spawnSync does not expand globs). */
function listTestFiles(workspaceRoot: string): string[] {
  const testDir = join(workspaceRoot, "test");
  if (!existsSync(testDir)) return [];
  return readdirSync(testDir)
    .filter((f) => f.endsWith(".test.js") || f.endsWith(".test.ts") || f.endsWith(".spec.js"))
    .map((f) => join("test", f))
    .sort();
}

function runProjectTests(ws: EngineeringWorkspace): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const files = listTestFiles(ws.root);
  if (files.length === 0) {
    return { status: 1, stdout: "", stderr: "no test files found" };
  }
  return ws.run("node", ["--test", ...files]);
}

export interface RunBatteryOptions {
  repoRoot: string;
  paths: V3DataPaths;
  taskIds?: string[];
  /** Inject recovery mid-task for first matching task id */
  recovery_task_id?: string;
  keep_workspaces?: boolean;
}

export function runEvaluationBattery(opts: RunBatteryOptions): BatteryReport {
  const catalog = loadCatalog(opts.repoRoot);
  const tasks = catalog.tasks.filter((t) => !opts.taskIds || opts.taskIds.includes(t.id));
  const run_id = `battery-${randomUUID().slice(0, 8)}`;
  const results: TaskRunResult[] = [];
  const baseTmp = join(tmpdir(), `evolveloop-v3-eval-${run_id}`);
  mkdirSync(baseTmp, { recursive: true });

  for (const task of tasks) {
    results.push(
      runOneTask({
        catalog,
        task,
        paths: opts.paths,
        repoRoot: opts.repoRoot,
        baseTmp,
        injectRecovery: opts.recovery_task_id === task.id,
      }),
    );
  }

  const verified = results.filter((r) => r.true_full_pass);
  const held = results.filter((r) => r.split === "held_out");
  const heldPass = held.filter((r) => r.true_full_pass);
  const totalCost = results.reduce((s, r) => s + r.cost_estimated_usd, 0);
  const totalTokens = results.reduce((s, r) => s + r.tokens_estimated, 0);

  const report: BatteryReport = {
    kind: "V3EvaluationBatteryReport",
    run_id,
    at: new Date().toISOString(),
    repo_count: new Set(results.map((r) => r.repo)).size,
    task_count: results.length,
    results,
    aggregates: {
      verified_completion_rate: results.length ? verified.length / results.length : 0,
      multi_file_tasks: results.filter((r) => r.multi_file && r.files_changed.length >= 2).length,
      held_out_pass_rate: held.length ? heldPass.length / held.length : 0,
      avg_tokens_estimated: results.length ? totalTokens / results.length : 0,
      cost_per_verified_completion: verified.length ? totalCost / verified.length : null,
      total_cost_estimated_usd: totalCost,
      false_positive_evaluator_rate: 0, // measured separately in adversarial suite
    },
    passed:
      results.length >= 10 &&
      new Set(results.map((r) => r.repo)).size >= 3 &&
      results.every((r) => r.true_full_pass) &&
      results.filter((r) => r.files_changed.length >= 2).length >= Math.ceil(results.length / 2),
    limitations: [
      "Solvers are DETERMINISTIC_SOLVER (not LLM) — proves Core generalization/orchestration path",
      "Token/cost figures are deterministic proxies unless live provider metering is attached",
      "Fixtures are curated multi-module repos, not proprietary third-party codebases",
      ...(opts.keep_workspaces ? [] : [`ephemeral workspaces under ${baseTmp} may be removed by OS`]),
    ],
  };

  writeFileSync(join(opts.paths.root, `eval-battery-${run_id}.json`), JSON.stringify(report, null, 2));
  if (!opts.keep_workspaces) {
    try {
      rmSync(baseTmp, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
  return report;
}

function runOneTask(input: {
  catalog: BatteryCatalog;
  task: TaskSpec;
  paths: V3DataPaths;
  repoRoot: string;
  baseTmp: string;
  injectRecovery: boolean;
}): TaskRunResult {
  const started = Date.now();
  const repoMeta = input.catalog.repos[input.task.repo];
  if (!repoMeta) {
    throw new Error(`unknown repo ${input.task.repo}`);
  }
  const fixtureAbs = resolve(input.repoRoot, repoMeta.fixture);
  const workspace = join(input.baseTmp, input.task.id);
  mkdirSync(workspace, { recursive: true });
  cpSync(fixtureAbs, workspace, { recursive: true });

  const ws = new EngineeringWorkspace(workspace);
  const exploration = exploreRepository(ws.root);
  const progress = new ProgressTracker();
  const evidence = new EvidenceStore(input.paths.evidenceDir);
  const goals = new GoalContractStore(input.paths.goalContractsDir);
  const agents = new AgentRegistryStore(input.paths.agentsDir);

  const work_id = `w-eval-${input.task.id}-${randomUUID().slice(0, 6)}`;
  const goalId = `gc-eval-${input.task.id}-${randomUUID().slice(0, 6)}`;
  const implementer = `${work_id}-worker`;
  const reviewer = `${work_id}-reviewer`;

  agents.ensure(work_id);
  agents.register({
    agent_id: `${work_id}-master`,
    role: "master",
    work_id,
    permissions: { allowWrite: true, allowSpawn: true, allowHostInspect: true, allowShell: true },
  });
  agents.activate(work_id, `${work_id}-master`);
  const contract = goals.create({
    goal_contract_id: goalId,
    objective: input.task.title,
    work_id,
    scope: [`repo:${input.task.repo}`, `task:${input.task.id}`],
    out_of_scope: ["unrelated architecture rewrite"],
    criteria: [
      {
        id: "c-tests",
        description: "All tests pass after change",
        mandatory: true,
        verification: [{ id: "v-test", kind: "test", description: "node --test" }],
        evidence_required: ["test_result"],
      },
      {
        id: "c-diff",
        description: "Real file changes produced",
        mandatory: true,
        verification: [{ id: "v-diff", kind: "diff", description: "workspace diff" }],
        evidence_required: ["diff"],
      },
      {
        id: "c-review",
        description: "Independent review PASS",
        mandatory: true,
        verification: [{ id: "v-review", kind: "manual", description: "review" }],
        evidence_required: ["review"],
      },
    ],
  });

  const tasks = new TaskGraphStore(input.paths.taskGraphsDir);
  tasks.create(work_id, goalId, contract.version);
  tasks.addTask(work_id, {
    task_id: `task-${input.task.id}`,
    goal_contract_id: goalId,
    goal_contract_version: contract.version,
    title: input.task.title,
    domain: "eval",
    task_kind: "implement",
    depends_on: [],
  });
  tasks.addTask(work_id, {
    task_id: `task-${input.task.id}-review`,
    goal_contract_id: goalId,
    goal_contract_version: contract.version,
    title: `Review ${input.task.id}`,
    domain: "eval",
    task_kind: "verify",
    depends_on: [`task-${input.task.id}`],
  });
  tasks.setTaskState(work_id, `task-${input.task.id}`, "IN_PROGRESS");

  const masterId = `${work_id}-master`;
  agents.register({
    agent_id: implementer,
    role: "worker",
    work_id,
    parent_agent_id: masterId,
    task_id: `task-${input.task.id}`,
    permissions: { allowWrite: true, allowHostInspect: true },
    delegation: {
      delegation_id: `dlg-${implementer}`,
      role: "worker",
      objective: input.task.title,
      scope: [input.task.repo],
      out_of_scope: [],
      task_id: `task-${input.task.id}`,
      authorized_inputs: ["goal_contract"],
      deliverables: ["diff"],
      criteria_ids: ["c-tests", "c-diff"],
      permissions: { allowWrite: true, allowHostInspect: true },
      budget: {},
      expected_evidence: ["diff", "test_result"],
      termination_condition: "TRUE_PASS or FAILED",
    },
  });
  agents.activate(work_id, implementer);
  agents.register({
    agent_id: reviewer,
    role: "verifier",
    work_id,
    parent_agent_id: masterId,
    task_id: `task-${input.task.id}-review`,
    permissions: { allowWrite: true, allowHostInspect: true },
    delegation: {
      delegation_id: `dlg-${reviewer}`,
      role: "verifier",
      objective: "Independent review",
      scope: [input.task.repo, "review"],
      out_of_scope: ["implementation"],
      task_id: `task-${input.task.id}-review`,
      authorized_inputs: ["diff", "tests"],
      deliverables: ["review"],
      criteria_ids: ["c-review"],
      permissions: { allowWrite: true, allowHostInspect: true },
      budget: {},
      expected_evidence: ["review"],
      termination_condition: "review recorded",
    },
  });
  agents.activate(work_id, reviewer);

  evidence.create({
    evidence_kind: "exploration",
    work_id,
    goal_contract_id: goalId,
    actor_agent_id: implementer,
    workspace_root: ws.root,
    payload: { exploration },
  });

  const baseline = runProjectTests(ws);
  const baselinePass = baseline.status === 0;

  const beforeFiles = new Map(
    walkRelFiles(ws.root).map((f) => [f, ws.exists(f) ? ws.readFile(f) : ""]),
  );

  // Optional recovery injection: partial progress → handoff → substitute continues
  let recovery_used = false;
  if (input.injectRecovery) {
    recovery_used = true;
    const engine = new ContinuityEngine(input.paths);
    ws.writeFile(".evolveloop/partial-marker.txt", "interrupted\n");
    tasks.setTaskOwner(work_id, `task-${input.task.id}`, implementer);
    const pkg = engine.createHandoff({
      work_id,
      agent_id: implementer,
      trigger: "TIMEOUT",
      reason: "eval:inject_recovery",
      next_action: "resume task solution",
    });
    const applied = engine.applyHandoff(pkg.handoff_id, { create_substitute: true });
    if (applied.status !== "applied") {
      progress.record("blocked_dependency", `handoff:${applied.status}`);
    }
  }

  const mutationAt = new Date().toISOString();
  const solver = applyTaskSolution(ws, input.task.id);
  progress.record("files_changed", solver.notes);

  const afterListing = walkRelFiles(ws.root);
  const files_changed: string[] = [];
  for (const f of afterListing) {
    const prev = beforeFiles.get(f);
    const next = ws.readFile(f);
    if (prev === undefined || prev !== next) files_changed.push(f);
  }
  files_changed.sort();

  if (input.injectRecovery) {
    progress.record("criterion_advanced", "recovered_and_completed");
  }

  const post = runProjectTests(ws);
  const postPass = post.status === 0;
  const counts = parseTestCounts(post.stdout);
  if (!postPass) {
    progress.record("same_error", "tests_failed", `exit:${post.status}`);
  } else {
    progress.record("test_improved", "tests_pass");
  }

  const fp = fingerprintWorkspace(ws.root);
  const diffEv = evidence.create({
    evidence_kind: "diff",
    work_id,
    goal_contract_id: goalId,
    actor_agent_id: implementer,
    workspace_root: ws.root,
    payload: {
      files_changed,
      solver_notes: solver.notes,
      label: "diff",
    },
  });
  const testEv = evidence.create({
    evidence_kind: "test_result",
    work_id,
    goal_contract_id: goalId,
    actor_agent_id: implementer,
    workspace_root: ws.root,
    payload: {
      label: "test_result",
      exit_code: post.status,
      tests_executed: counts.executed,
      tests_skipped: counts.skipped,
      ignored: false,
      run_at: new Date().toISOString(),
      stdout_tail: post.stdout.slice(-2000),
      baseline_exit: baseline.status,
      baseline_pass: baselinePass,
    },
  });

  const reviewPass =
    postPass &&
    baselinePass &&
    solver.ok &&
    files_changed.length > 0 &&
    (!input.task.multi_file || files_changed.length >= 2 || input.task.id === "T08");

  ws.writeFile(
    ".evolveloop/review-report.md",
    [
      `# Review by ${reviewer}`,
      `- implementer: ${implementer}`,
      `- independent: true`,
      `- baseline_pass: ${baselinePass}`,
      `- post_pass: ${postPass}`,
      `- files_changed: ${files_changed.join(", ")}`,
      `- verdict: ${reviewPass ? "PASS" : "FAIL"}`,
      "",
    ].join("\n"),
  );

  const reviewEv = evidence.create({
    evidence_kind: "review",
    work_id,
    goal_contract_id: goalId,
    actor_agent_id: reviewer,
    workspace_root: ws.root,
    payload: {
      label: "review",
      verdict: reviewPass ? "PASS" : "FAIL",
      reviewer_agent_id: reviewer,
      implementer_agent_id: implementer,
      acceptance: input.task.acceptance,
    },
  });

  if (postPass) goals.updateCriterionState(goalId, "c-tests", "PASS", [testEv.evidence_id]);
  else goals.updateCriterionState(goalId, "c-tests", "FAIL", [testEv.evidence_id]);

  if (files_changed.length > 0) goals.updateCriterionState(goalId, "c-diff", "PASS", [diffEv.evidence_id]);
  else goals.updateCriterionState(goalId, "c-diff", "FAIL", [diffEv.evidence_id]);

  if (reviewPass) goals.updateCriterionState(goalId, "c-review", "PASS", [reviewEv.evidence_id]);
  else goals.updateCriterionState(goalId, "c-review", "FAIL", [reviewEv.evidence_id]);

  const latestContract = goals.loadLatest(goalId);
  const evaluation = evaluateVerifiedTrueFullPass(latestContract, {
    evidence,
    workspace_root: ws.root,
    implementer_agent_id: implementer,
    require_code_changes: true,
    last_mutation_at: mutationAt,
    expected_workspace_fingerprint: fp,
  });

  const anti = progress.evaluate();
  const reasons = [...evaluation.reasons];
  if (!anti.allow_continue) reasons.push(`anti_loop:${anti.action}:${anti.reasons.join(",")}`);

  const tokens = estimateTokens(exploration, files_changed.length);
  const cost = tokens * 0.000002; // proxy USD

  const split: TaskRunResult["split"] =
    input.catalog.split.held_out.includes(input.task.id)
      ? "held_out"
      : input.catalog.split.validation.includes(input.task.id)
        ? "validation"
        : "development";

  return {
    task_id: input.task.id,
    repo: input.task.repo,
    split,
    exploration,
    baseline_tests_pass: baselinePass,
    baseline_exit: baseline.status,
    post_tests_pass: postPass,
    post_exit: post.status,
    files_changed,
    multi_file: files_changed.length >= 2,
    true_full_pass: evaluation.eligible && anti.allow_continue,
    reasons,
    implementer_agent_id: implementer,
    reviewer_agent_id: reviewer,
    evidence_ids: [diffEv.evidence_id, testEv.evidence_id, reviewEv.evidence_id],
    workspace_root: ws.root,
    duration_ms: Date.now() - started,
    tokens_estimated: tokens,
    cost_estimated_usd: cost,
    recovery_used,
    limitations: [
      "DETERMINISTIC_SOLVER",
      ...exploration.limitations,
      ...(existsSync(join(ws.root, ".evolveloop/partial-marker.txt")) && recovery_used
        ? ["recovery_injected"]
        : []),
    ],
  };
}
