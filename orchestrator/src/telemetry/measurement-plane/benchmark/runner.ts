import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { TelemetryCollector } from "../collector.js";
import { createMeasurementEvent } from "../envelope.js";
import { evaluateRun, type ArtifactEvidence } from "../evaluation/engine.js";
import { MeasurementEventStore, ArtifactStore } from "../event-store.js";
import { buildRunMetricsReport } from "../metrics/engine.js";
import { calculateCost, costPerVerifiedCompletion, loadPriceTable, wastedCost } from "../metrics/cost.js";
import type { MeasurementDataPaths } from "../paths.js";
import { reconstructExecution } from "../trace/builder.js";
import type {
  BenchmarkCaseManifest,
  BenchmarkSuiteManifest,
  ExperimentManifest,
  RunValidity,
  StrategyId,
} from "../types.js";
import {
  buildAgentLifecycleEvent,
  buildDelegationEvent,
  buildSubagentEvent,
} from "../adapters/hierarchy-adapter.js";
import { getStrategy } from "./strategies.js";

export interface RunnerOptions {
  paths: MeasurementDataPaths;
  repoRoot: string;
  priceTablePath?: string;
  evolveloopCommit?: string;
  dryRun?: boolean;
}

export interface CaseRunResult {
  run_id: string;
  case_id: string;
  strategy: StrategyId;
  repetition: number;
  validity: RunValidity;
  invalid_reasons: string[];
  true_full_pass: boolean;
  metrics: ReturnType<typeof buildRunMetricsReport>;
  evaluation: ReturnType<typeof evaluateRun>["result"];
  workspace?: string;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function loadSuite(suitePath: string): BenchmarkSuiteManifest {
  return readJson(suitePath);
}

export function loadCase(casePath: string): BenchmarkCaseManifest {
  return readJson(casePath);
}

export function createExperiment(
  paths: MeasurementDataPaths,
  partial: Omit<ExperimentManifest, "created_at" | "status" | "experiment_id"> & {
    experiment_id?: string;
  },
): ExperimentManifest {
  const experiment: ExperimentManifest = {
    experiment_id: partial.experiment_id ?? `exp_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    name: partial.name,
    description: partial.description,
    suite_id: partial.suite_id,
    strategies: partial.strategies,
    case_ids: partial.case_ids,
    repetitions: partial.repetitions,
    seed: partial.seed,
    evolveloop_commit: partial.evolveloop_commit,
    branch: partial.branch,
    provider_id: partial.provider_id,
    model_id: partial.model_id,
    created_at: new Date().toISOString(),
    status: "created",
  };
  writeFileSync(join(paths.experimentsDir, `${experiment.experiment_id}.json`), JSON.stringify(experiment, null, 2));
  return experiment;
}

export function loadExperiment(paths: MeasurementDataPaths, experimentId: string): ExperimentManifest | null {
  const p = join(paths.experimentsDir, `${experimentId}.json`);
  if (!existsSync(p)) return null;
  return readJson(p);
}

export function saveExperiment(paths: MeasurementDataPaths, exp: ExperimentManifest): void {
  writeFileSync(join(paths.experimentsDir, `${exp.experiment_id}.json`), JSON.stringify(exp, null, 2));
}

/**
 * Deterministic in-process case executor for Measurement Plane smoke/benchmarks.
 * Uses strategy config explicitly; does not mutate Core PolicyEngine.
 * For adaptive hierarchy cases, synthesizes observable hierarchy events when strategy allows.
 */
export function runBenchmarkCase(
  caseManifest: BenchmarkCaseManifest,
  strategyId: StrategyId,
  opts: RunnerOptions & { experiment_id?: string; suite_id?: string; repetition?: number },
): CaseRunResult {
  const strategy = getStrategy(strategyId);
  const run_id = `run_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const store = new MeasurementEventStore(opts.paths);
  const artifacts = new ArtifactStore(opts.paths);
  const collector = new TelemetryCollector(store, { mode: "benchmark", runId: run_id });
  const invalid_reasons: string[] = [];

  const emit = (event: ReturnType<typeof createMeasurementEvent>) => {
    const r = collector.ingest(event);
    if (!r.accepted && event.critical) invalid_reasons.push(r.reason ?? "critical_reject");
  };

  emit(
    createMeasurementEvent({
      event_name: "experiment.started",
      source: { component: "measurement-plane", module: "benchmark-runner" },
      correlation: {
        run_id,
        experiment_id: opts.experiment_id,
        suite_id: opts.suite_id,
        case_id: caseManifest.case_id,
      },
      attributes: { strategy: strategyId, strategy_version: strategy.version },
      critical: true,
    }),
  );
  emit(
    createMeasurementEvent({
      event_name: "benchmark.case_started",
      source: { component: "measurement-plane", module: "benchmark-runner" },
      correlation: { run_id, case_id: caseManifest.case_id, experiment_id: opts.experiment_id },
      attributes: {
        strategy: strategyId,
        evolveloop_commit: opts.evolveloopCommit,
        config: strategy.config,
      },
      critical: true,
    }),
  );
  emit(
    createMeasurementEvent({
      event_name: "run.started",
      source: { component: "measurement-plane", module: "benchmark-runner" },
      correlation: { run_id, case_id: caseManifest.case_id },
      critical: true,
    }),
  );

  // Isolated workspace
  let workspace: string | undefined;
  const fixtureAbs = resolve(opts.repoRoot, caseManifest.fixture_path);
  if (!existsSync(fixtureAbs)) {
    invalid_reasons.push("case_fixture_missing");
    emit(
      createMeasurementEvent({
        event_name: "benchmark.case_invalidated",
        source: { component: "measurement-plane", module: "benchmark-runner" },
        correlation: { run_id, case_id: caseManifest.case_id },
        attributes: { reason: "case_fixture_missing", fixture: caseManifest.fixture_path },
        critical: true,
      }),
    );
  } else {
    workspace = join(opts.paths.root, "workspaces", run_id);
    mkdirSync(join(opts.paths.root, "workspaces"), { recursive: true });
    if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
    cpSync(fixtureAbs, workspace, { recursive: true });
    artifacts.put(JSON.stringify({ fixture: caseManifest.fixture_path, workspace }), {
      kind: "workspace_ref",
      run_id,
    });
  }

  // Root agent
  const rootId = "agent_root";
  emit(buildAgentLifecycleEvent({ run_id, agent_id: rootId, role: "root", kind: "spawn_requested" }));
  emit(buildAgentLifecycleEvent({ run_id, agent_id: rootId, role: "root", kind: "spawned" }));
  emit(buildAgentLifecycleEvent({ run_id, agent_id: rootId, role: "root", kind: "started" }));

  emit(
    createMeasurementEvent({
      event_name: "plan.created",
      source: { component: "measurement-plane", module: "benchmark-runner" },
      correlation: { run_id, agent_id: rootId, case_id: caseManifest.case_id },
      attributes: { useful: true },
    }),
  );

  const shouldDelegate =
    strategy.config.delegation_enabled &&
    (caseManifest.class === "orchestration_parallel" ||
      caseManifest.class === "orchestration_leader_workers" ||
      caseManifest.class === "orchestration_helper" ||
      caseManifest.multi_file === true);

  const shouldStayRoot =
    caseManifest.class === "orchestration_simple_root" || strategy.config.single_agent_only;

  if (shouldStayRoot || !shouldDelegate) {
    // Correct non-delegation path
    emit(
      createMeasurementEvent({
        event_name: "task.assigned",
        source: { component: "measurement-plane", module: "benchmark-runner" },
        correlation: { run_id, agent_id: rootId, task_id: "task_main" },
      }),
    );
    emit(
      createMeasurementEvent({
        event_name: "filesystem.write",
        source: { component: "measurement-plane", module: "benchmark-runner" },
        correlation: { run_id, agent_id: rootId, task_id: "task_main" },
        measurements: { duration_ms: 5 },
        attributes: { path: "src/solution.ts", op: "write" },
        privacy: { classification: "METADATA", content_included: false, redacted: true },
      }),
    );
    emit(
      createMeasurementEvent({
        event_name: "tool.completed",
        source: { component: "measurement-plane", module: "benchmark-runner" },
        correlation: { run_id, agent_id: rootId, task_id: "task_main", tool_invocation_id: "tool_1" },
        measurements: { duration_ms: 12 },
      }),
    );
  } else {
    // Delegation path under strategy C (and eligible cases)
    const leaderId = "agent_leader";
    emit(
      buildDelegationEvent({
        run_id,
        delegation_id: "del_1",
        from_agent_id: rootId,
        to_agent_id: leaderId,
        task_id: "task_branch",
        kind: "requested",
      }),
    );
    emit(buildAgentLifecycleEvent({ run_id, agent_id: leaderId, parent_agent_id: rootId, role: "leader", kind: "spawn_requested", delegation_id: "del_1" }));
    if (strategy.config.allow_subagents) {
      emit(buildAgentLifecycleEvent({ run_id, agent_id: leaderId, parent_agent_id: rootId, role: "leader", kind: "spawned", delegation_id: "del_1" }));
      emit(buildSubagentEvent({ run_id, agent_id: leaderId, parent_agent_id: rootId, role: "leader", kind: "spawned", depth: 1 }));
      emit(
        buildDelegationEvent({
          run_id,
          delegation_id: "del_1",
          from_agent_id: rootId,
          to_agent_id: leaderId,
          task_id: "task_branch",
          kind: "accepted",
        }),
      );
      const workerId = "agent_worker_1";
      emit(buildAgentLifecycleEvent({ run_id, agent_id: workerId, parent_agent_id: leaderId, role: "worker", kind: "spawn_requested" }));
      emit(buildAgentLifecycleEvent({ run_id, agent_id: workerId, parent_agent_id: leaderId, role: "worker", kind: "spawned" }));
      emit(buildSubagentEvent({ run_id, agent_id: workerId, parent_agent_id: leaderId, role: "worker", kind: "spawned", depth: 2 }));
      emit(
        createMeasurementEvent({
          event_name: "task.assigned",
          source: { component: "measurement-plane", module: "benchmark-runner" },
          correlation: { run_id, agent_id: workerId, task_id: "task_branch", parent_task_id: "task_main" },
        }),
      );
      emit(
        createMeasurementEvent({
          event_name: "filesystem.write",
          source: { component: "measurement-plane", module: "benchmark-runner" },
          correlation: { run_id, agent_id: workerId, task_id: "task_branch" },
          measurements: { duration_ms: 8 },
          attributes: { path: "src/module.ts", op: "write" },
        }),
      );
      if (caseManifest.class === "orchestration_helper" && strategy.config.max_spawn_depth >= 3) {
        const helperId = "agent_helper_1";
        emit(buildAgentLifecycleEvent({ run_id, agent_id: helperId, parent_agent_id: workerId, role: "helper", kind: "spawn_requested" }));
        emit(buildAgentLifecycleEvent({ run_id, agent_id: helperId, parent_agent_id: workerId, role: "helper", kind: "spawned" }));
        emit(buildSubagentEvent({ run_id, agent_id: helperId, parent_agent_id: workerId, role: "helper", kind: "spawned", depth: 3 }));
      }
      emit(buildAgentLifecycleEvent({ run_id, agent_id: workerId, parent_agent_id: leaderId, role: "worker", kind: "completed" }));
      emit(buildAgentLifecycleEvent({ run_id, agent_id: leaderId, parent_agent_id: rootId, role: "leader", kind: "completed" }));
    }
  }

  if (caseManifest.class === "orchestration_spawn_denied") {
    emit(
      buildAgentLifecycleEvent({
        run_id,
        agent_id: "agent_blocked",
        parent_agent_id: rootId,
        role: "worker",
        kind: "spawn_requested",
      }),
    );
    emit(
      buildAgentLifecycleEvent({
        run_id,
        agent_id: "agent_blocked",
        parent_agent_id: rootId,
        role: "worker",
        kind: "spawn_blocked",
        reason: "policy_or_budget",
        policy_block: true,
      }),
    );
  }

  // Simulated test + review evidence path
  emit(
    createMeasurementEvent({
      event_name: "test.started",
      source: { component: "measurement-plane", module: "benchmark-runner" },
      correlation: { run_id, agent_id: rootId },
    }),
  );
  emit(
    createMeasurementEvent({
      event_name: "test.completed",
      source: { component: "measurement-plane", module: "benchmark-runner" },
      correlation: { run_id, agent_id: rootId },
      measurements: { duration_ms: 20 },
      attributes: { exit_code: 0 },
    }),
  );

  const evidences: ArtifactEvidence[] = caseManifest.acceptance_criteria.map((c, i) => ({
    evidence_id: `ev_${run_id}_${i}`,
    criterion_id: c.id,
    kind: c.evaluator === "test" ? "test" : "diff",
    content_hash: `hash_${caseManifest.case_id}_${c.id}`,
    tests_executed: true,
    exit_code: 0,
    files_changed: 2,
    review_approved: true,
    workspace_fingerprint: "fp_ok",
    expected_fingerprint: "fp_ok",
    current_commit: "commit_a",
    from_commit: "commit_a",
  }));

  const { result: evaluation, events: evalEvents } = evaluateRun({
    run_id,
    caseManifest,
    evidences,
    required_review: caseManifest.class.includes("review"),
  });
  for (const e of evalEvents) emit(e);

  emit(buildAgentLifecycleEvent({ run_id, agent_id: rootId, role: "root", kind: "completed" }));
  emit(
    createMeasurementEvent({
      event_name: "run.completed",
      source: { component: "measurement-plane", module: "benchmark-runner" },
      correlation: { run_id, case_id: caseManifest.case_id },
      attributes: { true_full_pass: evaluation.true_full_pass },
      critical: true,
    }),
  );
  emit(
    createMeasurementEvent({
      event_name: "benchmark.case_completed",
      source: { component: "measurement-plane", module: "benchmark-runner" },
      correlation: { run_id, case_id: caseManifest.case_id, experiment_id: opts.experiment_id },
      attributes: { strategy: strategyId, true_full_pass: evaluation.true_full_pass },
      critical: true,
    }),
  );

  collector.flush();
  const completeness = collector.isRunComplete();
  if (!completeness.complete) invalid_reasons.push(...completeness.reasons);

  const events = store.load(run_id);
  const metrics = buildRunMetricsReport(events);
  reconstructExecution(events); // ensure reconstructable

  let validity: RunValidity = "valid";
  if (invalid_reasons.some((r) => r.startsWith("case_"))) validity = "invalid";
  else if (invalid_reasons.length) validity = "incomplete";

  const report = {
    run_id,
    case_id: caseManifest.case_id,
    strategy: strategyId,
    validity,
    invalid_reasons,
    evaluation,
    metrics,
    collector: collector.getStats(),
  };
  writeFileSync(join(opts.paths.reportsDir, `${run_id}.json`), JSON.stringify(report, null, 2));

  return {
    run_id,
    case_id: caseManifest.case_id,
    strategy: strategyId,
    repetition: opts.repetition ?? 1,
    validity,
    invalid_reasons,
    true_full_pass: evaluation.true_full_pass,
    metrics,
    evaluation,
    workspace,
  };
}

export function runExperiment(
  experiment: ExperimentManifest,
  suite: BenchmarkSuiteManifest,
  cases: BenchmarkCaseManifest[],
  opts: RunnerOptions,
): {
  experiment_id: string;
  results: CaseRunResult[];
  comparison: ReturnType<typeof compareStrategies>;
} {
  experiment.status = "running";
  saveExperiment(opts.paths, experiment);
  const selected = experiment.case_ids?.length
    ? cases.filter((c) => experiment.case_ids!.includes(c.case_id))
    : cases.filter((c) => suite.cases.includes(c.case_id));

  const results: CaseRunResult[] = [];
  try {
    for (const strategy of experiment.strategies) {
      for (const c of selected) {
        if (!c.strategies.includes(strategy)) continue;
        for (let rep = 1; rep <= experiment.repetitions; rep++) {
          results.push(
            runBenchmarkCase(c, strategy, {
              ...opts,
              experiment_id: experiment.experiment_id,
              suite_id: suite.suite_id,
              repetition: rep,
              evolveloopCommit: experiment.evolveloop_commit ?? opts.evolveloopCommit,
            }),
          );
        }
      }
    }
    experiment.status = "completed";
  } catch (err) {
    experiment.status = "failed";
    saveExperiment(opts.paths, experiment);
    throw err;
  }
  saveExperiment(opts.paths, experiment);

  const priceTable = opts.priceTablePath ? loadPriceTable(opts.priceTablePath) : null;
  const comparison = compareStrategies(results, priceTable);
  writeFileSync(
    join(opts.paths.reportsDir, `${experiment.experiment_id}.compare.json`),
    JSON.stringify({ experiment_id: experiment.experiment_id, comparison, results }, null, 2),
  );
  return { experiment_id: experiment.experiment_id, results, comparison };
}

export function compareStrategies(
  results: CaseRunResult[],
  priceTable: ReturnType<typeof loadPriceTable>,
) {
  const byStrategy = new Map<StrategyId, CaseRunResult[]>();
  for (const r of results) {
    if (!byStrategy.has(r.strategy)) byStrategy.set(r.strategy, []);
    byStrategy.get(r.strategy)!.push(r);
  }

  const arms: Record<string, unknown> = {};
  for (const [strategy, rows] of byStrategy) {
    const valid = rows.filter((r) => r.validity === "valid");
    const verified = valid.filter((r) => r.true_full_pass);
    const durations = valid
      .map((r) => r.metrics.timing.end_to_end_duration_ms)
      .filter((x): x is number => x != null);
    const costs = valid.map((r) => {
      const usage = r.metrics.usage;
      const calc = calculateCost(usage, priceTable, "mock", "mock-model");
      return { verified: r.true_full_pass, cost_usd: calc.calculated.value };
    });
    arms[strategy] = {
      sample_size: valid.length,
      invalid_or_incomplete: rows.length - valid.length,
      verified_completion_rate: valid.length ? verified.length / valid.length : null,
      mean_duration_ms: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
      cost_per_verified_completion: costPerVerifiedCompletion(costs),
      wasted_cost: wastedCost(costs),
      mean_delegation_depth: average(valid.map((r) => r.metrics.hierarchy.delegation_depth)),
      mean_subagent_count: average(valid.map((r) => r.metrics.hierarchy.subagent_count)),
      mean_agent_count: average(valid.map((r) => r.metrics.hierarchy.agent_count_created)),
    };
  }

  return {
    arms,
    notes: [
      "Strategies compared on same cases when eligible.",
      "Cost requires price table; otherwise UNAVAILABLE.",
      "Adaptive strategy is not assumed to win.",
    ],
  };
}

function average(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function doctor(paths: MeasurementDataPaths) {
  const store = new MeasurementEventStore(paths);
  const runs = store.listRunIds();
  return {
    ok: true,
    measurement_root: paths.root,
    run_count: runs.length,
    experiments: existsSync(paths.experimentsDir)
      ? readdirSync(paths.experimentsDir).filter((f) => f.endsWith(".json")).length
      : 0,
    local_first: true,
    notes: ["Measurement Plane stores data only under local --data-dir/measurement"],
  };
}
