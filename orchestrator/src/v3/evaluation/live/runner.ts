/**
 * Live LLM engineering evaluation path.
 * When readiness is READY: invokes consented harness for real agent work.
 * When BLOCKED/PARTIAL: records plumbing dry-runs + BLOCKED status (never claims live PASS).
 */

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { V3DataPaths } from "../../paths.js";
import { EngineeringWorkspace, walkRelFiles } from "../../engineering/workspace.js";
import { exploreRepository } from "../explore.js";
import { EvidenceStore, fingerprintWorkspace } from "../evidence.js";
import { evaluateVerifiedTrueFullPass } from "../verified-pass.js";
import { GoalContractStore } from "../../goal-contract/store.js";
import { AgentRegistryStore } from "../../agent-registry/store.js";
import { TaskGraphStore } from "../../task-graph/store.js";
import { ContinuityEngine } from "../../continuity/engine.js";
import { resolveMeasurementPaths } from "../../../telemetry/measurement-plane/paths.js";
import { MeasurementEventStore } from "../../../telemetry/measurement-plane/event-store.js";
import { TelemetryCollector } from "../../../telemetry/measurement-plane/collector.js";
import { createMeasurementEvent } from "../../../telemetry/measurement-plane/envelope.js";
import {
  buildAgentLifecycleEvent,
  buildDelegationEvent,
} from "../../../telemetry/measurement-plane/adapters/hierarchy-adapter.js";
import { probeLiveLlmReadiness, type LiveReadinessReport } from "./readiness.js";
import { LIVE_TASK_BRIEFS, buildReviewerPrompt, buildWorkerPrompt } from "./prompts.js";

export interface LiveRunOptions {
  repoRoot: string;
  paths: V3DataPaths;
  fixtureRel: string;
  taskId: keyof typeof LIVE_TASK_BRIEFS;
  strategy: "A_single_agent" | "B_evolveloop_no_delegation" | "C_evolveloop_adaptive";
  /** Inject recovery mid-run (handoff) when live or dry plumbing */
  injectRecovery?: boolean;
  work_id?: string;
}

export interface LiveRunResult {
  kind: "LiveEngineeringRunResult";
  run_id: string;
  task_id: string;
  strategy: string;
  readiness: LiveReadinessReport;
  mode: "LIVE" | "DRY_PLUMBING" | "BLOCKED";
  workspace: string;
  files_changed: string[];
  exploration_file_count: number;
  true_full_pass: boolean;
  review: {
    independent: boolean;
    session_separated: boolean;
    verdict: "PASS" | "FAIL" | "NOT_RUN" | "BLOCKED";
    provenance: string;
    raw?: string;
  };
  recovery?: {
    used: boolean;
    handoff_status?: string;
    substitute_agent_id?: string;
  };
  provider_usage: {
    provenance: "PROVIDER_REPORTED" | "UNAVAILABLE";
    input_tokens?: number;
    output_tokens?: number;
  };
  measurement_run_id: string;
  limitations: string[];
  reasons: string[];
}

function listTestFiles(root: string): string[] {
  const dir = join(root, "test");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".test.js"))
    .map((f) => join("test", f))
    .sort();
}

function runTests(ws: EngineeringWorkspace) {
  const files = listTestFiles(ws.root);
  if (!files.length) return { status: 1 as number | null, stdout: "", stderr: "no tests" };
  return ws.run("node", ["--test", ...files]);
}

function invokeClaudePrompt(prompt: string, opts: { real: boolean; outDir: string; label: string }): {
  status: "spawned" | "dry_run" | "blocked" | "failed";
  output: string;
  session_id: string;
} {
  const session_id = `live-${opts.label}-${randomUUID().slice(0, 8)}`;
  mkdirSync(opts.outDir, { recursive: true });
  const promptPath = join(opts.outDir, `${session_id}.md`);
  writeFileSync(promptPath, prompt, "utf-8");

  if (!opts.real) {
    return {
      status: "dry_run",
      output: `DRY_RUN prompt written to ${promptPath}`,
      session_id,
    };
  }

  const r = spawnSync(
    "claude",
    ["-p", prompt, "--output-format", "text"],
    { encoding: "utf-8", timeout: 180_000, env: process.env, maxBuffer: 4 * 1024 * 1024 },
  );
  if (r.error || r.status !== 0) {
    return {
      status: "failed",
      output: `${r.stderr ?? ""}\n${r.stdout ?? ""}\n${r.error ?? ""}`.slice(0, 8000),
      session_id,
    };
  }
  return { status: "spawned", output: (r.stdout ?? "").slice(0, 8000), session_id };
}

/**
 * Live (or blocked/dry) engineering evaluation for one task.
 * Never uses DETERMINISTIC_SOLVER for code changes in LIVE mode.
 * In DRY/BLOCKED mode, does not fabricate LLM success — leaves workspace unmodified except markers.
 */
export function runLiveEngineeringCase(opts: LiveRunOptions): LiveRunResult {
  const readiness = probeLiveLlmReadiness();
  const brief = LIVE_TASK_BRIEFS[opts.taskId];
  const run_id = `live-${randomUUID().slice(0, 10)}`;
  const work_id = opts.work_id ?? `w-${run_id}`;
  const measurement = resolveMeasurementPaths(opts.paths.root);
  const store = new MeasurementEventStore(measurement);
  const collector = new TelemetryCollector(store, { mode: "benchmark", runId: run_id });
  const emit = (e: ReturnType<typeof createMeasurementEvent>) => collector.ingest(e);

  const fixtureAbs = resolve(opts.repoRoot, opts.fixtureRel);
  const workspace = join(opts.paths.root, "live-workspaces", run_id);
  mkdirSync(join(opts.paths.root, "live-workspaces"), { recursive: true });
  cpSync(fixtureAbs, workspace, { recursive: true });
  const ws = new EngineeringWorkspace(workspace);
  const exploration = exploreRepository(ws.root);

  const liveOk = readiness.state === "READY";
  const mode: LiveRunResult["mode"] = liveOk ? "LIVE" : readiness.state === "PARTIAL" ? "DRY_PLUMBING" : "BLOCKED";

  emit(
    createMeasurementEvent({
      event_name: "run.started",
      source: { component: "v3-live-eval", module: "runner" },
      correlation: { run_id, case_id: opts.taskId },
      attributes: { strategy: opts.strategy, mode, readiness: readiness.state },
      critical: true,
    }),
  );

  const workerId = `${work_id}-live-worker`;
  const reviewerId = `${work_id}-live-reviewer`;
  const agents = new AgentRegistryStore(opts.paths.agentsDir);
  const goals = new GoalContractStore(opts.paths.goalContractsDir);
  const tasks = new TaskGraphStore(opts.paths.taskGraphsDir);
  const evidence = new EvidenceStore(opts.paths.evidenceDir);

  agents.ensure(work_id);
  agents.register({
    agent_id: `${work_id}-master`,
    role: "master",
    work_id,
    permissions: { allowWrite: true, allowSpawn: true, allowHostInspect: true, allowShell: true },
  });
  agents.activate(work_id, `${work_id}-master`);

  const goalId = `gc-${run_id}`;
  const contract = goals.create({
    goal_contract_id: goalId,
    objective: brief.objective,
    work_id,
    criteria: [
      {
        id: "c-tests",
        description: "tests pass",
        mandatory: true,
        verification: [{ id: "v-test", kind: "test", description: "node --test" }],
        evidence_required: ["test_result"],
      },
      {
        id: "c-diff",
        description: "real changes",
        mandatory: true,
        verification: [{ id: "v-diff", kind: "diff", description: "diff" }],
        evidence_required: ["diff"],
      },
      {
        id: "c-review",
        description: "independent review",
        mandatory: true,
        verification: [{ id: "v-rev", kind: "manual", description: "review" }],
        evidence_required: ["review"],
      },
    ],
  });
  tasks.create(work_id, goalId, contract.version);
  tasks.addTask(work_id, {
    task_id: "live-impl",
    goal_contract_id: goalId,
    goal_contract_version: contract.version,
    title: brief.title,
    task_kind: "implement",
    depends_on: [],
  });
  tasks.addTask(work_id, {
    task_id: "live-review",
    goal_contract_id: goalId,
    goal_contract_version: contract.version,
    title: "Independent review",
    task_kind: "verify",
    depends_on: ["live-impl"],
  });

  agents.register({
    agent_id: workerId,
    role: "worker",
    work_id,
    parent_agent_id: `${work_id}-master`,
    task_id: "live-impl",
    permissions: { allowWrite: true, allowHostInspect: true, allowShell: true },
    delegation: {
      delegation_id: `dlg-${workerId}`,
      role: "worker",
      objective: brief.objective,
      scope: ["workspace"],
      out_of_scope: [],
      task_id: "live-impl",
      authorized_inputs: ["goal"],
      deliverables: ["diff"],
      criteria_ids: ["c-tests", "c-diff"],
      permissions: { allowWrite: true, allowHostInspect: true, allowShell: true },
      budget: {},
      expected_evidence: ["diff", "test_result"],
      termination_condition: "TRUE_PASS or FAILED",
    },
  });
  agents.activate(work_id, workerId);
  agents.register({
    agent_id: reviewerId,
    role: "verifier",
    work_id,
    parent_agent_id: `${work_id}-master`,
    task_id: "live-review",
    permissions: { allowWrite: true, allowHostInspect: true },
    delegation: {
      delegation_id: `dlg-${reviewerId}`,
      role: "verifier",
      objective: "Independent review",
      scope: ["review"],
      out_of_scope: ["implementation"],
      task_id: "live-review",
      authorized_inputs: ["diff", "tests"],
      deliverables: ["review"],
      criteria_ids: ["c-review"],
      permissions: { allowWrite: true, allowHostInspect: true },
      budget: {},
      expected_evidence: ["review"],
      termination_condition: "review recorded",
    },
  });
  agents.activate(work_id, reviewerId);

  emit(buildAgentLifecycleEvent({ run_id, agent_id: workerId, role: "worker", kind: "spawn_requested" }));
  emit(buildAgentLifecycleEvent({ run_id, agent_id: workerId, role: "worker", kind: "spawned" }));
  emit(buildAgentLifecycleEvent({ run_id, agent_id: workerId, role: "worker", kind: "started" }));

  if (opts.strategy === "C_evolveloop_adaptive") {
    emit(
      buildDelegationEvent({
        run_id,
        delegation_id: "del-live-1",
        from_agent_id: `${work_id}-master`,
        to_agent_id: workerId,
        task_id: "live-impl",
        kind: "requested",
      }),
    );
    emit(
      buildDelegationEvent({
        run_id,
        delegation_id: "del-live-1",
        from_agent_id: `${work_id}-master`,
        to_agent_id: workerId,
        task_id: "live-impl",
        kind: "accepted",
      }),
    );
  }

  const before = new Map(walkRelFiles(ws.root).map((f) => [f, ws.readFile(f)]));
  const promptDir = join(opts.paths.root, "harness-prompts", work_id);
  const workerPrompt = buildWorkerPrompt(brief, ws.root);

  let recovery: LiveRunResult["recovery"] | undefined;
  if (opts.injectRecovery) {
    ws.writeFile(".evolveloop/partial-marker.txt", `interrupted_by_live_runner\nexploration_files=${exploration.file_count}\n`);
    tasks.setTaskOwner(work_id, "live-impl", workerId);
    tasks.setTaskState(work_id, "live-impl", "IN_PROGRESS");
    const engine = new ContinuityEngine(opts.paths);
    const pkg = engine.createHandoff({
      work_id,
      agent_id: workerId,
      trigger: "TIMEOUT",
      reason: "live:inject_recovery",
      next_action: "substitute continues with persisted workspace",
    });
    const applied = engine.applyHandoff(pkg.handoff_id, { create_substitute: true });
    recovery = {
      used: true,
      handoff_status: applied.status,
      substitute_agent_id: applied.to_agent_id,
    };
    emit(
      createMeasurementEvent({
        event_name: "handoff.completed",
        source: { component: "v3-live-eval", module: "recovery" },
        correlation: { run_id, agent_id: workerId },
        attributes: { status: applied.status, to: applied.to_agent_id },
        critical: true,
      }),
    );
  }

  const workerInvoke = invokeClaudePrompt(workerPrompt, {
    real: liveOk,
    outDir: promptDir,
    label: "worker",
  });
  emit(
    createMeasurementEvent({
      event_name: liveOk ? "provider.request.completed" : "provider.request.failed",
      source: { component: "v3-live-eval", module: "worker" },
      correlation: { run_id, agent_id: workerId, session_id: workerInvoke.session_id },
      attributes: {
        status: workerInvoke.status,
        harness_id: "claude-code",
        note: liveOk ? "live_spawn_attempted" : "consent_or_auth_blocked_dry_run",
      },
      critical: true,
    }),
  );

  // LIVE mode: agent must have mutated workspace. We do NOT apply solvers here.
  // DRY/BLOCKED: workspace stays without fabricated "LLM success" patches.
  const afterListing = walkRelFiles(ws.root);
  const files_changed: string[] = [];
  for (const f of afterListing) {
    const prev = before.get(f);
    const next = existsSync(join(ws.root, f)) ? ws.readFile(f) : "";
    if (prev === undefined || prev !== next) files_changed.push(f);
  }
  files_changed.sort();

  const post = runTests(ws);
  const mutationAt = new Date().toISOString();
  const fp = fingerprintWorkspace(ws.root);

  const diffEv = evidence.create({
    evidence_kind: "diff",
    work_id,
    goal_contract_id: goalId,
    actor_agent_id: workerId,
    workspace_root: ws.root,
    payload: { files_changed, label: "diff", mode },
  });
  const testEv = evidence.create({
    evidence_kind: "test_result",
    work_id,
    goal_contract_id: goalId,
    actor_agent_id: workerId,
    workspace_root: ws.root,
    payload: {
      label: "test_result",
      exit_code: post.status,
      tests_executed: Math.max(1, (post.stdout.match(/# (pass|fail) /g) || []).length),
      tests_skipped: 0,
      ignored: false,
      run_at: new Date().toISOString(),
    },
  });

  const reviewPrompt = buildReviewerPrompt({
    objective: brief.objective,
    acceptance: brief.acceptance,
    diffSummary: files_changed.join("\n") || "(no file changes)",
    testSummary: `exit=${post.status}\n${post.stdout.slice(0, 2000)}`,
    implementerClaim: "Implementer claims done (untrusted).",
  });
  const reviewInvoke = invokeClaudePrompt(reviewPrompt, {
    real: liveOk,
    outDir: promptDir,
    label: "reviewer",
  });

  let reviewVerdict: LiveRunResult["review"]["verdict"] = "BLOCKED";
  let reviewRaw = reviewInvoke.output;
  if (liveOk && reviewInvoke.status === "spawned") {
    try {
      const jsonMatch = reviewRaw.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      reviewVerdict = parsed?.verdict === "PASS" ? "PASS" : "FAIL";
    } catch {
      reviewVerdict = "FAIL";
    }
  } else if (!liveOk) {
    reviewVerdict = "BLOCKED";
  }

  // Deterministic evaluator still owns TRUE_FULL_PASS — LLM review complements.
  const reviewEv = evidence.create({
    evidence_kind: "review",
    work_id,
    goal_contract_id: goalId,
    actor_agent_id: reviewerId,
    workspace_root: ws.root,
    payload: {
      label: "review",
      verdict: reviewVerdict === "PASS" ? "PASS" : "FAIL",
      reviewer_agent_id: reviewerId,
      implementer_agent_id: workerId,
      session_id: reviewInvoke.session_id,
      independent: true,
      session_separated: reviewInvoke.session_id !== workerInvoke.session_id,
      mode,
    },
  });

  if (post.status === 0) goals.updateCriterionState(goalId, "c-tests", "PASS", [testEv.evidence_id]);
  else goals.updateCriterionState(goalId, "c-tests", "FAIL", [testEv.evidence_id]);
  if (files_changed.length > 0) goals.updateCriterionState(goalId, "c-diff", "PASS", [diffEv.evidence_id]);
  else goals.updateCriterionState(goalId, "c-diff", "FAIL", [diffEv.evidence_id]);
  if (reviewVerdict === "PASS") goals.updateCriterionState(goalId, "c-review", "PASS", [reviewEv.evidence_id]);
  else goals.updateCriterionState(goalId, "c-review", "FAIL", [reviewEv.evidence_id]);

  const evaluation = evaluateVerifiedTrueFullPass(goals.loadLatest(goalId), {
    evidence,
    workspace_root: ws.root,
    implementer_agent_id: workerId,
    require_code_changes: true,
    last_mutation_at: mutationAt,
    expected_workspace_fingerprint: fp,
  });

  // Live-blocked runs must never claim TRUE_FULL_PASS from dry plumbing
  const true_full_pass = liveOk && evaluation.eligible && reviewVerdict === "PASS";

  emit(
    createMeasurementEvent({
      event_name: true_full_pass ? "run.completed" : "run.failed",
      source: { component: "v3-live-eval", module: "runner" },
      correlation: { run_id },
      attributes: {
        true_full_pass,
        mode,
        reasons: evaluation.reasons,
        readiness_blockers: readiness.blockers,
      },
      critical: true,
    }),
  );

  const result: LiveRunResult = {
    kind: "LiveEngineeringRunResult",
    run_id,
    task_id: opts.taskId,
    strategy: opts.strategy,
    readiness,
    mode,
    workspace: ws.root,
    files_changed,
    exploration_file_count: exploration.file_count,
    true_full_pass,
    review: {
      independent: true,
      session_separated: reviewInvoke.session_id !== workerInvoke.session_id,
      verdict: reviewVerdict,
      provenance: `reviewer=${reviewerId};session=${reviewInvoke.session_id};status=${reviewInvoke.status}`,
      raw: reviewRaw.slice(0, 2000),
    },
    recovery,
    provider_usage: { provenance: "UNAVAILABLE" },
    measurement_run_id: run_id,
    limitations: [
      ...readiness.notes,
      ...(liveOk ? [] : ["LIVE_LLM_NOT_EXECUTED — dry plumbing / blocked only"]),
      "TRUE_FULL_PASS still requires verified evidence; LLM review does not replace evaluator",
      "No DETERMINISTIC_SOLVER applied in this path",
    ],
    reasons: liveOk
      ? evaluation.reasons
      : [...evaluation.reasons, ...readiness.blockers.map((b) => `blocked:${b}`)],
  };

  writeFileSync(join(opts.paths.root, `live-run-${run_id}.json`), JSON.stringify(result, null, 2));
  return result;
}

export function runLiveValidationSuite(input: {
  repoRoot: string;
  paths: V3DataPaths;
}): {
  kind: "LiveValidationSuiteReport";
  readiness: LiveReadinessReport;
  results: LiveRunResult[];
  gate_l_state: "PASS" | "BLOCKED" | "FAIL" | "NOT_RUN";
} {
  const readiness = probeLiveLlmReadiness();
  const cases: Array<Omit<LiveRunOptions, "repoRoot" | "paths">> = [
    {
      fixtureRel: "orchestrator/tests/fixtures/v3-eval/alpha-lib",
      taskId: "T01",
      strategy: "A_single_agent",
    },
    {
      fixtureRel: "orchestrator/tests/fixtures/v3-eval/beta-app",
      taskId: "T04",
      strategy: "B_evolveloop_no_delegation",
      injectRecovery: true,
    },
    {
      fixtureRel: "orchestrator/tests/fixtures/v3-eval/gamma-service",
      taskId: "T07",
      strategy: "C_evolveloop_adaptive",
    },
  ];

  const results = cases.map((c) =>
    runLiveEngineeringCase({ ...c, repoRoot: input.repoRoot, paths: input.paths }),
  );

  let gate_l_state: "PASS" | "BLOCKED" | "FAIL" | "NOT_RUN" = "NOT_RUN";
  if (readiness.state !== "READY") gate_l_state = "BLOCKED";
  else if (results.every((r) => r.true_full_pass)) gate_l_state = "PASS";
  else gate_l_state = "FAIL";

  return { kind: "LiveValidationSuiteReport", readiness, results, gate_l_state };
}
