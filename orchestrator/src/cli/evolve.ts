#!/usr/bin/env node
/**
 * EvolveLoop V3 product CLI (non-interactive foundation).
 *
 * Usage:
 *   evolve goal create --data-dir ./v3-data --id gc-1 --objective "..." [--criteria-json path]
 *   evolve goal show|evaluate --data-dir ./v3-data --id gc-1
 *   evolve goal criterion --data-dir ./v3-data --id gc-1 --criterion c1 --state PASS --evidence e1
 *   evolve work init --data-dir ./v3-data --work-id w1 --goal-id gc-1
 *   evolve work status --data-dir ./v3-data --work-id w1
 *   evolve task add --data-dir ./v3-data --work-id w1 --task-id t1 --title "..." --goal-id gc-1
 *   evolve task approve-plan --data-dir ./v3-data --work-id w1 --task-id plan-1 --plan-version 1
 *   evolve agents register|heartbeat|list|reconcile|adopt --data-dir ./v3-data --work-id w1 ...
 *   evolve coordinator start|stop|tick|status --data-dir ./v3-data [--work-id w1]
 *   evolve ledger show|rebuild --data-dir ./v3-data --work-id w1
 *   evolve adapters list|show|drivers|invoke|handoff-envelope --data-dir ./v3-data ...
 *   evolve tui status|run --data-dir ./v3-data [--work-id w1] [--format text|json]
 *   evolve models seed|list|show|enable --data-dir ./v3-data ...
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveV3DataPaths } from "../v3/paths.js";
import { GoalContractStore } from "../v3/goal-contract/store.js";
import type { CriterionState, GoalContractCreateInput } from "../v3/goal-contract/types.js";
import { TaskGraphStore } from "../v3/task-graph/store.js";
import { AgentRegistryStore } from "../v3/agent-registry/store.js";
import type { AgentRole } from "../v3/agent-registry/types.js";
import { CoordinatorService } from "../v3/coordinator/service.js";
import { CoordinationEventLog } from "../v3/event-log/store.js";
import {
  applyGrillMeToGoalContract,
  validateGrillMeResult,
} from "../v3/grill-me/intake.js";
import type { GrillMeResult } from "../v3/grill-me/types.js";
import { spawnDomainHierarchy, approveDomainPlan, spawnAuxiliary } from "../v3/hierarchy/spawn.js";
import { ContinuityEngine } from "../v3/continuity/engine.js";
import type { HandoffTrigger } from "../v3/continuity/types.js";
import { dispatchImplementTask } from "../v3/execution/bridge.js";
import { WorkLedgerStore } from "../v3/work-ledger/store.js";
import {
  getAdapterContract,
  isAdapterId,
  listAdapterContracts,
} from "../v3/adapters/catalog.js";
import { AdapterHandoffBridge } from "../v3/adapters/handoff-bridge.js";
import { getAdapterDriver, listAdapterDrivers } from "../v3/adapters/drivers/registry.js";
import { probeAllHarnessClis } from "../v3/adapters/drivers/cli-probe.js";
import {
  cancelHarnessSession,
  listHarnessSessions,
} from "../v3/adapters/drivers/cli-process.js";
import { triggerLimitHandoff, classifyLimitSignal } from "../v3/limits/index.js";
import { evaluateHierarchicalBudgets } from "../v3/budget/hierarchical.js";
import { EngineeringLoopService, buildHarnessMatrix } from "../v3/engineering/index.js";
import { runEvaluationBattery } from "../v3/evaluation/index.js";
import { buildStatusBoard, renderStatusBoardText } from "../v3/tui/status-board.js";
import { runInteractiveTui } from "../v3/tui/interactive.js";
import { ModelCatalogStore } from "../v3/model-catalog/store.js";
import { buildContextView } from "../v3/context/views.js";
import type { ContextViewRole } from "../v3/context/types.js";
import { compactContextView, reinjectCompactedView } from "../v3/context/compaction.js";
import { measureCompactionSavings } from "../v3/context/savings.js";
import { evaluateBudgets, detectStuck, recordBudgetConsumption } from "../v3/budget/tracker.js";
import { routeResources } from "../v3/routing/router.js";
import { probeDecisionModel } from "../v3/routing/decision-model.js";
import { probeOpenRouterJev } from "../v3/routing/openrouter-jev.js";
import {
  probeNomicEmbed,
  embedTexts,
  hybridRetrieve,
  VectorIndexStore,
} from "../v3/embeddings/index.js";
import { WorkLockStore } from "../v3/locks/store.js";
import type { LockScope } from "../v3/locks/types.js";
import { planSubtreeRecovery, recoverSubtree } from "../v3/recovery/subtree.js";
import type { RecoveryAction } from "../v3/recovery/subtree.js";
import { WorktreeManager } from "../v3/worktrees/index.js";
import { cancelWorkSlice } from "../v3/cancel/index.js";
import { scheduleReadyTasks, listReadyTasks } from "../v3/parallel/index.js";
import { runFailureBattery, runEngineeringFailureBattery } from "../v3/failure-injection/index.js";
import type { ProviderMode } from "./provider-bootstrap.js";
import {
  handleBenchmarkCommand,
  handleTelemetryCommand,
  recordEngineeringLoopObservation,
  resolveMeasurementPaths,
} from "../telemetry/measurement-plane/index.js";
import { probeLiveLlmReadiness, runLiveValidationSuite } from "../v3/evaluation/live/index.js";

function parseArgs(argv: string[]) {
  const group = argv[2] ?? "help";
  if (group === "help" || group === "--help" || group === "-h") {
    return { group: "help", command: "help" } as Record<string, string>;
  }
  const command = argv[3] && !argv[3].startsWith("--") ? argv[3] : "help";
  const args: Record<string, string> = { group, command };
  let start = argv[3] && !argv[3].startsWith("--") ? 4 : 3;
  // Optional positional subcommand / id (e.g. evolve benchmark suite list)
  if (argv[start] && !argv[start].startsWith("--")) {
    args._sub = argv[start];
    args._ = argv[start];
    start += 1;
    if (argv[start] && !argv[start].startsWith("--")) {
      args.id = argv[start];
      start += 1;
    }
  }
  for (let i = start; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith("--")) {
      const val = argv[i + 1];
      if (val && !val.startsWith("--")) {
        args[key.slice(2)] = val;
        i++;
      } else {
        args[key.slice(2)] = "true";
      }
    }
  }
  return args;
}

function requireDataDir(args: Record<string, string>) {
  if (!args["data-dir"]) {
    console.error("Required: --data-dir <path>");
    process.exit(1);
  }
  return resolveV3DataPaths(args["data-dir"]);
}

function print(obj: unknown) {
  console.log(JSON.stringify(obj, null, 2));
}

function usage() {
  print({
    name: "evolve",
    version: "3.0.0-foundation",
    groups: {
      grill: ["apply", "validate"],
      goal: ["create", "show", "evaluate", "criterion"],
      work: ["init", "status"],
      hierarchy: ["spawn", "approve", "aux"],
      task: ["add", "approve-plan", "show"],
      agents: ["register", "heartbeat", "list", "reconcile", "adopt"],
      continuity: ["handoff", "apply", "show"],
      exec: ["run"],
      coordinator: ["start", "stop", "tick", "status"],
      events: ["list"],
      ledger: ["show", "rebuild"],
      adapters: [
        "list",
        "show",
        "drivers",
        "invoke",
        "handoff-envelope",
        "handoff-apply",
        "probe",
        "sessions",
        "session-cancel",
      ],
      tui: ["status", "run"],
      models: ["seed", "list", "show", "enable"],
      context: ["view", "compact", "reinject", "savings"],
      route: ["decide", "probe-decision", "probe-openrouter"],
      budget: ["show", "record", "stuck", "hierarchical"],
      limits: ["classify", "handoff"],
      embeddings: ["probe", "embed", "retrieve", "index-build", "index-search"],
      lock: ["acquire", "renew", "release", "status", "fence-check"],
      recovery: ["plan", "apply"],
      worktree: ["create", "list", "remove"],
      cancel: ["apply"],
      parallel: ["schedule", "ready"],
      battery: ["run", "engineering", "eval"],
      engineering: ["run", "show"],
      harness: ["matrix"],
      eval: ["battery", "live-readiness", "live-suite"],
      telemetry: ["status", "inspect", "events", "trace", "agents", "usage", "export", "metrics"],
      benchmark: [
        "suite",
        "case",
        "experiment",
        "run",
        "status",
        "cancel",
        "report",
        "compare",
        "metrics",
        "regressions",
        "export",
        "validate-suite",
        "validate-evidence",
        "doctor",
      ],
    },
    notes: [
      "Closing this CLI does not erase --data-dir state.",
      "coordinator start only marks process running in this Node process; use scripts/v3/coordinator-supervise.sh or systemd user template for supervised ticks.",
      "grill apply requires a GRILL_ME_RESULT JSON (fail-closed → Goal Contract).",
      "exec run / adapters invoke require PLAN_APPROVED for implement tasks; use --provider-mode real|mock.",
      "adapters: only cursor can_invoke; claude-code/codex/antigravity drivers fail-closed (blocked).",
      "tui run is a minimal readline loop; closing it does not stop a supervisor.",
      "models catalog is metadata only — no invented tokens; remote models stay disabled until enable.",
      "context compact/reinject/savings operate on disposable views; savings never invent tokens.",
      "embeddings index-build persists --data-dir/vector-index; OmniRoute held (ADR-V3-0005).",
      "route --decision-backend openrouter requires --consent true + API key; local systemone otherwise.",
      "lock/fencing is best-effort — NOT exactly-once (ADR-V3-0006).",
      "recovery plan|apply handles subtree after leader loss; tick only suggests.",
      "worktree is git worktree isolation only — not an OS sandbox.",
      "cancel applies to Core coordination state; use --idempotency-key for safe retries.",
      "parallel schedule advances TaskGraph READY→IN_PROGRESS up to --max-in-progress (no harness spawn).",
      "battery run exercises V3.3 failure/handoff/lock/cancel/parallel scenarios in-process.",
      "battery engineering injects eng-stage failures + adversarial evaluator checks.",
      "battery eval / eval battery runs ≥10 multi-repo engineering tasks (deterministic solvers).",
      "engineering run executes V3.4 Engineering Loop against a real --workspace (deterministic workers).",
      "harness matrix classifies adapters as SUPPORTED|PARTIAL|DRY_RUN|PROBE_ONLY|BLOCKED|UNSUPPORTED.",
      "telemetry/benchmark are the Measurement Plane CLIs (local-first; never invent tokens).",
      "benchmark strategies: A_single_agent | B_evolveloop_no_delegation | C_evolveloop_adaptive.",
      "eval live-suite exercises LLM path when EVOLVELOOP_HARNESS_CONSENT=true + provider auth; else BLOCKED dry plumbing.",
    ],
  });
}

function defaultCriteria(objective: string): GoalContractCreateInput["criteria"] {
  return [
    {
      id: "c-objective",
      description: `Objective satisfied: ${objective}`,
      mandatory: true,
      verification: [{ id: "v-manual", kind: "manual", description: "verifier evidence required" }],
      evidence_required: ["acceptance-evidence"],
    },
  ];
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.group === "help") {
    usage();
    return;
  }

  try {
    if (args.group === "grill") {
      const paths = requireDataDir(args);
      if (args.command === "validate" || args.command === "apply") {
        if (!args["result-json"]) {
          console.error("Required: --result-json <path>");
          process.exit(1);
        }
        const result = JSON.parse(readFileSync(resolve(args["result-json"]), "utf-8")) as GrillMeResult;
        if (args.command === "validate") {
          print(
            validateGrillMeResult(result, {
              exempt: args.exempt === "true",
              exempt_reason: args["exempt-reason"],
            }),
          );
          return;
        }
        if (!args.id || !args.objective) {
          console.error("Required for apply: --id --objective --result-json");
          process.exit(1);
        }
        print(
          applyGrillMeToGoalContract({
            dataGoalContractsDir: paths.goalContractsDir,
            evidenceDir: paths.evidenceDir,
            goal_contract_id: args.id,
            objective: args.objective,
            work_id: args["work-id"],
            result,
            exempt: args.exempt === "true",
            exempt_reason: args["exempt-reason"],
          }),
        );
        return;
      }
    }

    if (args.group === "goal") {
      const paths = requireDataDir(args);
      const store = new GoalContractStore(paths.goalContractsDir);
      if (args.command === "create") {
        const id = args.id;
        const objective = args.objective;
        if (!id || !objective) {
          console.error("Required: --id --objective");
          process.exit(1);
        }
        let criteria = defaultCriteria(objective);
        if (args["criteria-json"]) {
          const raw = JSON.parse(readFileSync(resolve(args["criteria-json"]), "utf-8")) as {
            criteria: GoalContractCreateInput["criteria"];
          };
          criteria = raw.criteria;
        }
        print(store.create({ goal_contract_id: id, objective, criteria, work_id: args["work-id"] }));
        return;
      }
      if (args.command === "show") {
        if (!args.id) {
          console.error("Required: --id");
          process.exit(1);
        }
        print(store.loadLatest(args.id));
        return;
      }
      if (args.command === "evaluate") {
        if (!args.id) {
          console.error("Required: --id");
          process.exit(1);
        }
        print(store.evaluate(args.id));
        return;
      }
      if (args.command === "criterion") {
        if (!args.id || !args.criterion || !args.state) {
          console.error("Required: --id --criterion --state");
          process.exit(1);
        }
        const evidence = args.evidence ? args.evidence.split(",").map((s) => s.trim()) : [];
        print(
          store.updateCriterionState(
            args.id,
            args.criterion,
            args.state as CriterionState,
            evidence,
          ),
        );
        return;
      }
    }

    if (args.group === "work") {
      const paths = requireDataDir(args);
      const coordinator = new CoordinatorService(paths);
      if (args.command === "init") {
        const workId = args["work-id"];
        const goalId = args["goal-id"];
        if (!workId || !goalId) {
          console.error("Required: --work-id --goal-id");
          process.exit(1);
        }
        const goal = new GoalContractStore(paths.goalContractsDir).loadLatest(goalId);
        const state = coordinator.registerWork(workId, goalId, goal.version);
        const agents = new AgentRegistryStore(paths.agentsDir);
        agents.ensure(workId);
        if (!agents.load(workId).agents.some((a) => a.role === "master")) {
          agents.register({
            agent_id: `${workId}-master`,
            role: "master",
            work_id: workId,
            permissions: {
              allowWrite: true,
              allowShell: false,
              allowNetwork: false,
              allowHostInspect: true,
              allowSpawn: true,
            },
          });
          agents.activate(workId, `${workId}-master`);
        }
        print({ work: state.works.find((w) => w.work_id === workId), master: `${workId}-master` });
        return;
      }
      if (args.command === "status") {
        const workId = args["work-id"];
        if (!workId) {
          console.error("Required: --work-id");
          process.exit(1);
        }
        const tick = coordinator.tick(workId);
        const tasks = new TaskGraphStore(paths.taskGraphsDir).load(workId);
        const agents = new AgentRegistryStore(paths.agentsDir).load(workId);
        let ledger;
        try {
          ledger = {
            snapshot: coordinator.ledger.snapshot(workId),
            recent: coordinator.ledger.read(workId).slice(-10),
          };
        } catch {
          ledger = null;
        }
        print({
          tick,
          tasks,
          agents_summary: agents.agents.map((a) => ({
            id: a.agent_id,
            role: a.role,
            state: a.state,
          })),
          ledger,
        });
        return;
      }
    }

    if (args.group === "hierarchy") {
      const paths = requireDataDir(args);
      const workId = args["work-id"];
      if (!workId) {
        console.error("Required: --work-id");
        process.exit(1);
      }
      if (args.command === "spawn") {
        if (!args.domains) {
          console.error("Required: --domains backend,frontend,...");
          process.exit(1);
        }
        print(
          spawnDomainHierarchy(paths, {
            work_id: workId,
            domains: args.domains.split(","),
            master_agent_id: args["master-agent-id"],
          }),
        );
        return;
      }
      if (args.command === "approve") {
        if (!args.domain) {
          console.error("Required: --domain");
          process.exit(1);
        }
        const planVersion = args["plan-version"] ? parseInt(args["plan-version"], 10) : 1;
        print(approveDomainPlan(paths, workId, args.domain, planVersion));
        return;
      }
      if (args.command === "aux") {
        if (!args["parent-agent-id"] || !args.objective) {
          console.error("Required: --parent-agent-id --objective");
          process.exit(1);
        }
        print(
          spawnAuxiliary(paths, {
            work_id: workId,
            parent_agent_id: args["parent-agent-id"],
            objective: args.objective,
            domain: args.domain,
            auxiliary_id: args["agent-id"],
            task_id: args["task-id"],
          }),
        );
        return;
      }
    }

    if (args.group === "task") {
      const paths = requireDataDir(args);
      const store = new TaskGraphStore(paths.taskGraphsDir);
      const workId = args["work-id"];
      if (!workId) {
        console.error("Required: --work-id");
        process.exit(1);
      }
      if (args.command === "show") {
        print(store.load(workId));
        return;
      }
      if (args.command === "add") {
        const taskId = args["task-id"];
        const title = args.title;
        const goalId = args["goal-id"];
        if (!taskId || !title || !goalId) {
          console.error("Required: --task-id --title --goal-id");
          process.exit(1);
        }
        const goal = new GoalContractStore(paths.goalContractsDir).loadLatest(goalId);
        print(
          store.addTask(workId, {
            task_id: taskId,
            goal_contract_id: goalId,
            goal_contract_version: goal.version,
            title,
            domain: args.domain,
            parent_task_id: args["parent-task-id"],
            depends_on: args.depends
              ? args.depends
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
            owner_agent_id: args["owner-agent-id"],
          }),
        );
        return;
      }
      if (args.command === "approve-plan") {
        const taskId = args["task-id"];
        const planVersion = args["plan-version"] ? parseInt(args["plan-version"], 10) : 1;
        if (!taskId) {
          console.error("Required: --task-id");
          process.exit(1);
        }
        const snap = store.approvePlan(workId, taskId, planVersion);
        const plan = snap.tasks.find((t) => t.task_id === taskId);
        new WorkLedgerStore(paths.workLedgerDir).append({
          work_id: workId,
          type: "plan_approved",
          origin: "evolve.task.approve-plan",
          task_id: taskId,
          agent_id: plan?.owner_agent_id,
          goal_contract_id: snap.goal_contract_id,
          payload: { plan_version: planVersion },
          provenance: { source: "cli", refs: [taskId] },
        });
        print(snap);
        return;
      }
    }

    if (args.group === "agents") {
      const paths = requireDataDir(args);
      const store = new AgentRegistryStore(paths.agentsDir);
      const workId = args["work-id"];
      if (!workId) {
        console.error("Required: --work-id");
        process.exit(1);
      }
      if (args.command === "list") {
        print(store.load(workId));
        return;
      }
      if (args.command === "heartbeat") {
        if (!args["agent-id"]) {
          console.error("Required: --agent-id");
          process.exit(1);
        }
        print(store.heartbeat(workId, args["agent-id"]));
        return;
      }
      if (args.command === "reconcile") {
        if (!args["parent-agent-id"]) {
          console.error("Required: --parent-agent-id");
          process.exit(1);
        }
        const action = args.action === "cancel" ? "cancel" : "orphan";
        print(store.reconcileParentFailure(workId, args["parent-agent-id"], action));
        return;
      }
      if (args.command === "adopt") {
        if (!args["agent-id"] || !args["new-parent-id"]) {
          console.error("Required: --agent-id --new-parent-id");
          process.exit(1);
        }
        print(store.adoptOrphan(workId, args["agent-id"], args["new-parent-id"]));
        return;
      }
      if (args.command === "register") {
        const agentId = args["agent-id"];
        const role = args.role as AgentRole;
        if (!agentId || !role) {
          console.error("Required: --agent-id --role");
          process.exit(1);
        }
        const parent = args["parent-agent-id"];
        const taskId = args["task-id"];
        const delegationId = args["delegation-id"] ?? `dlg-${agentId}`;
        const perms = {
          allowWrite: args["allow-write"] === "true",
          allowShell: args["allow-shell"] === "true",
          allowNetwork: args["allow-network"] === "true",
          allowHostInspect: args["allow-host-inspect"] === "true",
          allowSpawn: args["allow-spawn"] === "true",
        };
        print(
          store.register({
            agent_id: agentId,
            role,
            work_id: workId,
            domain: args.domain,
            parent_agent_id: parent,
            task_id: taskId,
            provider_id: args.provider,
            model_id: args.model,
            permissions: perms,
            delegation:
              role === "master" || role === "coordinator"
                ? undefined
                : {
                    delegation_id: delegationId,
                    parent_agent_id: parent,
                    role,
                    objective: args.objective ?? `delegate ${agentId}`,
                    scope: args.scope ? args.scope.split(",") : [],
                    out_of_scope: [],
                    task_id: taskId!,
                    authorized_inputs: [],
                    deliverables: [],
                    criteria_ids: [],
                    permissions: perms,
                    budget: {},
                    expected_evidence: [],
                    termination_condition: args.termination ?? "task TRUE_PASS or CANCELLED",
                  },
          }),
        );
        return;
      }
    }

    if (args.group === "coordinator") {
      const paths = requireDataDir(args);
      const service = new CoordinatorService(paths);
      if (args.command === "start") {
        print(service.start());
        return;
      }
      if (args.command === "stop") {
        print(service.stop(args.reason ?? "cli_stop"));
        return;
      }
      if (args.command === "status") {
        print(service.status());
        return;
      }
      if (args.command === "tick") {
        if (!args["work-id"]) {
          console.error("Required: --work-id");
          process.exit(1);
        }
        print(service.tick(args["work-id"]));
        return;
      }
    }

    if (args.group === "continuity") {
      const paths = requireDataDir(args);
      const engine = new ContinuityEngine(paths);
      if (args.command === "handoff") {
        if (!args["work-id"] || !args["agent-id"] || !args.trigger || !args.reason) {
          console.error("Required: --work-id --agent-id --trigger --reason");
          process.exit(1);
        }
        print(
          engine.createHandoff({
            work_id: args["work-id"],
            agent_id: args["agent-id"],
            trigger: args.trigger as HandoffTrigger,
            reason: args.reason,
            next_action: args["next-action"],
          }),
        );
        return;
      }
      if (args.command === "apply") {
        if (!args["handoff-id"]) {
          console.error("Required: --handoff-id");
          process.exit(1);
        }
        print(
          engine.applyHandoff(args["handoff-id"], {
            substitute_agent_id: args["substitute-agent-id"],
            create_substitute: args["create-substitute"] !== "false",
          }),
        );
        return;
      }
      if (args.command === "show") {
        if (!args["handoff-id"]) {
          console.error("Required: --handoff-id");
          process.exit(1);
        }
        print(engine.load(args["handoff-id"]));
        return;
      }
    }

    if (args.group === "exec") {
      const paths = requireDataDir(args);
      if (args.command === "run") {
        if (!args["work-id"] || !args["task-id"] || !args.ir) {
          console.error("Required: --work-id --task-id --ir");
          process.exit(1);
        }
        const mode = (args["provider-mode"] ?? "mock") as ProviderMode;
        if (mode !== "mock" && mode !== "real") {
          console.error("--provider-mode must be mock|real");
          process.exit(1);
        }
        print(
          await dispatchImplementTask(paths, {
            work_id: args["work-id"],
            task_id: args["task-id"],
            ir_path: resolve(args.ir),
            provider_mode: mode,
            agents_root: args["agents-root"],
            policy_id: args.policy,
            jobs_dir: args["jobs-dir"],
          }),
        );
        return;
      }
    }

    if (args.group === "events") {
      const paths = requireDataDir(args);
      if (args.command === "list") {
        if (!args["work-id"]) {
          console.error("Required: --work-id");
          process.exit(1);
        }
        print({
          work_id: args["work-id"],
          events: new CoordinationEventLog(paths.eventLogDir).read(args["work-id"]),
        });
        return;
      }
    }

    if (args.group === "ledger") {
      const paths = requireDataDir(args);
      const workId = args["work-id"];
      if (!workId) {
        console.error("Required: --work-id");
        process.exit(1);
      }
      const ledger = new WorkLedgerStore(paths.workLedgerDir);
      if (args.command === "show") {
        print({
          snapshot: ledger.snapshot(workId),
          entries: ledger.read(workId),
        });
        return;
      }
      if (args.command === "rebuild") {
        print(ledger.rebuildSnapshot(workId));
        return;
      }
    }

    if (args.group === "adapters") {
      if (args.command === "list") {
        print({ adapters: listAdapterContracts() });
        return;
      }
      if (args.command === "show") {
        if (!args.id || !isAdapterId(args.id)) {
          console.error("Required: --id cursor|claude-code|codex|antigravity");
          process.exit(1);
        }
        print(getAdapterContract(args.id));
        return;
      }
      if (args.command === "drivers") {
        print({
          drivers: listAdapterDrivers().map((d) => d.describe()),
        });
        return;
      }
      if (args.command === "invoke") {
        const paths = requireDataDir(args);
        if (!args.id || !isAdapterId(args.id) || !args["work-id"] || !args["task-id"]) {
          console.error("Required: --data-dir --id --work-id --task-id [--ir] [--provider-mode]");
          process.exit(1);
        }
        const mode = (args["provider-mode"] ?? "mock") as ProviderMode;
        if (mode !== "mock" && mode !== "real") {
          console.error("--provider-mode must be mock|real");
          process.exit(1);
        }
        const result = await getAdapterDriver(args.id).invoke(paths, {
          work_id: args["work-id"],
          task_id: args["task-id"],
          agent_id: args["agent-id"],
          ir_path: args.ir ? resolve(args.ir) : undefined,
          provider_mode: mode,
        });
        print(result);
        if (result.status === "blocked" || result.status === "unsupported") {
          process.exit(2);
        }
        if (result.status === "failed") {
          process.exit(1);
        }
        return;
      }
      if (args.command === "handoff-envelope") {
        const paths = requireDataDir(args);
        if (!args["handoff-id"] || !args["to-adapter"]) {
          console.error("Required: --data-dir --handoff-id --to-adapter");
          process.exit(1);
        }
        print(new AdapterHandoffBridge(paths).buildEnvelope(args["handoff-id"], args["to-adapter"]));
        return;
      }
      if (args.command === "handoff-apply") {
        const paths = requireDataDir(args);
        if (!args["handoff-id"] || !args["to-adapter"]) {
          console.error(
            "Required: --data-dir --handoff-id --to-adapter [--provider-mode mock|real] [--invoke false]",
          );
          process.exit(1);
        }
        print(
          await new AdapterHandoffBridge(paths).applyCrossProvider({
            handoff_id: args["handoff-id"],
            to_adapter: args["to-adapter"],
            provider_mode: (args["provider-mode"] as "mock" | "real") || "mock",
            invoke_target: args.invoke !== "false",
          }),
        );
        return;
      }
      if (args.command === "probe") {
        print({ clis: probeAllHarnessClis(), drivers: listAdapterDrivers().map((d) => d.describe()) });
        return;
      }
      if (args.command === "sessions") {
        const paths = requireDataDir(args);
        if (!args["work-id"]) {
          console.error("Required: --data-dir --work-id");
          process.exit(1);
        }
        print({ sessions: listHarnessSessions(paths, args["work-id"]) });
        return;
      }
      if (args.command === "session-cancel") {
        const paths = requireDataDir(args);
        if (!args["work-id"] || !args["session-id"]) {
          console.error("Required: --data-dir --work-id --session-id");
          process.exit(1);
        }
        print(cancelHarnessSession(paths, args["work-id"], args["session-id"]));
        return;
      }
    }

    if (args.group === "tui") {
      const paths = requireDataDir(args);
      if (args.command === "status") {
        const snap = buildStatusBoard(paths);
        if ((args.format ?? "text") === "json") {
          print(snap);
        } else {
          console.log(renderStatusBoardText(snap));
        }
        return;
      }
      if (args.command === "run") {
        await runInteractiveTui({
          paths,
          workId: args["work-id"],
        });
        return;
      }
    }

    if (args.group === "models") {
      const paths = requireDataDir(args);
      const store = new ModelCatalogStore(paths.modelCatalogDir);
      if (args.command === "seed") {
        print(store.seed(args.force === "true"));
        return;
      }
      if (args.command === "list") {
        let snap = store.load();
        if (snap.models.length === 0) snap = store.seed();
        print(snap);
        return;
      }
      if (args.command === "show") {
        if (!args.id) {
          console.error("Required: --id");
          process.exit(1);
        }
        if (store.load().models.length === 0) store.seed();
        print(store.get(args.id));
        return;
      }
      if (args.command === "enable") {
        if (!args.id || args.enabled === undefined) {
          console.error("Required: --id --enabled true|false");
          process.exit(1);
        }
        if (store.load().models.length === 0) store.seed();
        print(store.enableModel(args.id, args.enabled === "true"));
        return;
      }
    }

    if (args.group === "context") {
      const paths = requireDataDir(args);
      if (args.command === "view") {
        if (!args["work-id"]) {
          console.error("Required: --work-id [--role master|leader|planner|worker|...] [--agent-id]");
          process.exit(1);
        }
        print(
          buildContextView(paths, {
            work_id: args["work-id"],
            role: (args.role ?? "master") as ContextViewRole,
            agent_id: args["agent-id"],
          }),
        );
        return;
      }
      if (args.command === "compact" || args.command === "reinject" || args.command === "savings") {
        if (!args["work-id"]) {
          console.error("Required: --work-id [--role] [--agent-id]");
          process.exit(1);
        }
        const view = buildContextView(paths, {
          work_id: args["work-id"],
          role: (args.role ?? "master") as ContextViewRole,
          agent_id: args["agent-id"],
        });
        if (args.command === "savings") {
          print(
            measureCompactionSavings(view, {
              require_tiktoken: args["require-tiktoken"] === "true",
            }),
          );
          return;
        }
        const compacted = compactContextView(view);
        if (args.command === "compact") {
          print(compacted);
          if (compacted.fidelity_status === "FAIL") process.exit(2);
          return;
        }
        const reinject = reinjectCompactedView(compacted);
        print(reinject);
        if (!reinject.allowed) process.exit(2);
        return;
      }
    }

    if (args.group === "route") {
      if (args.command === "probe-decision") {
        print(await probeDecisionModel());
        return;
      }
      if (args.command === "probe-openrouter") {
        print(probeOpenRouterJev({ consent: args.consent === "true" }));
        return;
      }
      if (args.command === "decide") {
        const paths = requireDataDir(args);
        if (!args["work-id"]) {
          console.error(
            "Required: --work-id [--use-decision-model] [--decision-backend local|openrouter] [--consent true]",
          );
          process.exit(1);
        }
        const decision = await routeResources(paths, {
          work_id: args["work-id"],
          task_id: args["task-id"],
          role_hint: args["role-hint"] as
            | "general"
            | "coding"
            | "decision"
            | "embedding"
            | "review"
            | "other"
            | undefined,
          prefer_local: args["prefer-local"] !== "false",
          require_invokable_adapter: args["require-invokable"] === "true",
          use_decision_model: args["use-decision-model"] === "true",
          decision_backend: args["decision-backend"] === "openrouter" ? "openrouter" : "local",
          remote_consent: args.consent === "true",
        });
        print(decision);
        if (decision.status === "decision_model_unavailable" || decision.status === "no_candidate") {
          process.exit(2);
        }
        return;
      }
    }

    if (args.group === "embeddings") {
      if (args.command === "probe") {
        print(await probeNomicEmbed());
        return;
      }
      if (args.command === "embed") {
        const text = args.text;
        if (!text) {
          console.error("Required: --text \"...\"");
          process.exit(1);
        }
        const result = await embedTexts([text]);
        print({
          ...result,
          vectors: result.vectors?.map((v) => ({ dim: v.length, head: v.slice(0, 8) })),
        });
        if (result.status !== "ok") process.exit(2);
        return;
      }
      if (args.command === "retrieve") {
        const paths = requireDataDir(args);
        if (!args["work-id"] || !args.query) {
          console.error("Required: --data-dir --work-id --query \"...\"");
          process.exit(1);
        }
        print(
          await hybridRetrieve(paths, {
            work_id: args["work-id"],
            query: args.query,
            role: (args.role ?? "master") as ContextViewRole,
            top_k: args["top-k"] ? parseInt(args["top-k"], 10) : 5,
            use_embeddings: args["no-embeddings"] !== "true",
            prefer_durable_index: args["no-durable"] !== "true",
          }),
        );
        return;
      }
      if (args.command === "index-build") {
        const paths = requireDataDir(args);
        if (!args["work-id"]) {
          console.error("Required: --data-dir --work-id [--role]");
          process.exit(1);
        }
        print(
          await new VectorIndexStore(paths).build(paths, args["work-id"], {
            role: (args.role ?? "master") as ContextViewRole,
          }),
        );
        return;
      }
      if (args.command === "index-search") {
        const paths = requireDataDir(args);
        if (!args["work-id"] || !args.query) {
          console.error("Required: --data-dir --work-id --query");
          process.exit(1);
        }
        print(
          await new VectorIndexStore(paths).search(
            args["work-id"],
            args.query,
            args["top-k"] ? parseInt(args["top-k"], 10) : 5,
          ),
        );
        return;
      }
    }

    if (args.group === "budget") {
      const paths = requireDataDir(args);
      const workId = args["work-id"];
      if (!workId) {
        console.error("Required: --work-id");
        process.exit(1);
      }
      if (args.command === "show") {
        print(evaluateBudgets(paths, workId));
        return;
      }
      if (args.command === "hierarchical") {
        print(evaluateHierarchicalBudgets(paths, workId));
        return;
      }
      if (args.command === "stuck") {
        print(detectStuck(paths, workId));
        return;
      }
      if (args.command === "record") {
        if (!args["agent-id"]) {
          console.error("Required: --agent-id and at least one of --tokens --cost-usd --duration-ms");
          process.exit(1);
        }
        const delta = {
          tokens: args.tokens ? parseFloat(args.tokens) : undefined,
          cost_usd: args["cost-usd"] ? parseFloat(args["cost-usd"]) : undefined,
          duration_ms: args["duration-ms"] ? parseFloat(args["duration-ms"]) : undefined,
        };
        if (delta.tokens == null && delta.cost_usd == null && delta.duration_ms == null) {
          console.error("Provide measured --tokens and/or --cost-usd and/or --duration-ms (never invent)");
          process.exit(1);
        }
        recordBudgetConsumption(paths, workId, args["agent-id"], delta);
        print({ recorded: true, agent_id: args["agent-id"], delta, budgets: evaluateBudgets(paths, workId) });
        return;
      }
    }

    if (args.group === "limits") {
      const paths = requireDataDir(args);
      if (args.command === "classify") {
        if (!args.signal) {
          console.error("Required: --signal \"rate limit 429\"");
          process.exit(1);
        }
        print(classifyLimitSignal(args.signal, { preventive: args.preventive === "true" }));
        return;
      }
      if (args.command === "handoff") {
        if (!args["work-id"] || !args["agent-id"] || !args.signal) {
          console.error(
            "Required: --work-id --agent-id --signal [...] [--apply true] [--preventive true]",
          );
          process.exit(1);
        }
        print(
          triggerLimitHandoff(paths, {
            work_id: args["work-id"],
            agent_id: args["agent-id"],
            signal: args.signal,
            preventive: args.preventive === "true",
            apply_handoff: args.apply === "true",
            next_action: args["next-action"],
          }),
        );
        return;
      }
    }

    if (args.group === "lock") {
      const paths = requireDataDir(args);
      const store = new WorkLockStore(paths.locksDir);
      const workId = args["work-id"];
      if (!workId) {
        console.error("Required: --work-id");
        process.exit(1);
      }
      if (args.command === "status") {
        print(store.load(workId));
        return;
      }
      if (args.command === "acquire") {
        if (!args["agent-id"]) {
          console.error("Required: --agent-id [--scope work|task|domain] [--resource-key] [--lease-ms]");
          process.exit(1);
        }
        print(
          store.acquire({
            work_id: workId,
            holder_agent_id: args["agent-id"],
            scope: (args.scope as LockScope) || "work",
            resource_key: args["resource-key"],
            lease_ms: args["lease-ms"] ? parseInt(args["lease-ms"], 10) : undefined,
          }),
        );
        return;
      }
      if (args.command === "renew") {
        if (!args["lock-id"] || !args["agent-id"]) {
          console.error("Required: --lock-id --agent-id");
          process.exit(1);
        }
        print(
          store.renew(
            workId,
            args["lock-id"],
            args["agent-id"],
            args["lease-ms"] ? parseInt(args["lease-ms"], 10) : 60_000,
          ),
        );
        return;
      }
      if (args.command === "release") {
        if (!args["lock-id"] || !args["agent-id"]) {
          console.error("Required: --lock-id --agent-id");
          process.exit(1);
        }
        print(store.release(workId, args["lock-id"], args["agent-id"]));
        return;
      }
      if (args.command === "fence-check") {
        if (!args["agent-id"] || args.token === undefined) {
          console.error("Required: --agent-id --token <fencing_token> [--scope] [--resource-key]");
          process.exit(1);
        }
        print(
          store.checkFencing(
            workId,
            (args.scope as LockScope) || "work",
            args["resource-key"],
            parseInt(args.token, 10),
            args["agent-id"],
          ),
        );
        return;
      }
    }

    if (args.group === "recovery") {
      const paths = requireDataDir(args);
      if (!args["work-id"] || !args["parent-agent-id"]) {
        console.error("Required: --work-id --parent-agent-id [--action orphan|cancel|adopt_under_master|handoff_then_orphan]");
        process.exit(1);
      }
      if (args.command === "plan") {
        print(planSubtreeRecovery(paths, args["work-id"], args["parent-agent-id"]));
        return;
      }
      if (args.command === "apply") {
        print(
          recoverSubtree(paths, {
            work_id: args["work-id"],
            failed_parent_id: args["parent-agent-id"],
            action: args.action as RecoveryAction | undefined,
          }),
        );
        return;
      }
    }

    if (args.group === "worktree") {
      const paths = requireDataDir(args);
      if (!args["work-id"]) {
        console.error("Required: --work-id");
        process.exit(1);
      }
      const repoRoot = args["repo-root"] ? resolve(args["repo-root"]) : process.cwd();
      const mgr = new WorktreeManager(paths, repoRoot);
      if (args.command === "list") {
        print(mgr.load(args["work-id"]));
        return;
      }
      if (args.command === "create") {
        print(
          mgr.create({
            work_id: args["work-id"],
            agent_id: args["agent-id"],
            branch_prefix: args["branch-prefix"],
          }),
        );
        return;
      }
      if (args.command === "remove") {
        if (!args["worktree-id"]) {
          console.error("Required: --worktree-id [--force]");
          process.exit(1);
        }
        print(mgr.remove(args["work-id"], args["worktree-id"], { force: args.force === "true" }));
        return;
      }
    }

    if (args.group === "cancel") {
      const paths = requireDataDir(args);
      if (!args["work-id"] || !args.reason) {
        console.error(
          "Required: --work-id --reason [--agent-id] [--task-id] [--idempotency-key] [--cascade false]",
        );
        process.exit(1);
      }
      if (args.command === "apply") {
        print(
          cancelWorkSlice(paths, {
            work_id: args["work-id"],
            agent_id: args["agent-id"],
            task_id: args["task-id"],
            reason: args.reason,
            cascade_children: args.cascade !== "false",
            idempotency_key: args["idempotency-key"],
          }),
        );
        return;
      }
    }

    if (args.group === "parallel") {
      const paths = requireDataDir(args);
      if (!args["work-id"]) {
        console.error("Required: --work-id");
        process.exit(1);
      }
      if (args.command === "ready") {
        print(listReadyTasks(paths, args["work-id"]));
        return;
      }
      if (args.command === "schedule") {
        print(
          scheduleReadyTasks(paths, args["work-id"], {
            max_in_progress: args["max-in-progress"]
              ? parseInt(args["max-in-progress"], 10)
              : 2,
            max_per_domain: args["max-per-domain"]
              ? parseInt(args["max-per-domain"], 10)
              : undefined,
          }),
        );
        return;
      }
    }

    if (args.group === "battery") {
      const paths = requireDataDir(args);
      if (args.command === "run") {
        if (!args["work-id"]) {
          console.error("Required: --work-id");
          process.exit(1);
        }
        print(runFailureBattery(paths, args["work-id"]));
        return;
      }
      if (args.command === "engineering") {
        const ws = args.workspace
          ? resolve(args.workspace)
          : resolve(paths.root, "eng-failure-ws");
        print(runEngineeringFailureBattery(paths, ws));
        return;
      }
      if (args.command === "eval") {
        const repoRoot = args["repo-root"]
          ? resolve(args["repo-root"])
          : resolve(process.cwd(), "..");
        print(
          runEvaluationBattery({
            repoRoot,
            paths,
            recovery_task_id: args["recovery-task"] ?? "T01",
            keep_workspaces: args["keep-workspaces"] === "true",
          }),
        );
        return;
      }
    }

    if (args.group === "eval") {
      const paths = requireDataDir(args);
      if (args.command === "battery") {
        const repoRoot = args["repo-root"]
          ? resolve(args["repo-root"])
          : resolve(process.cwd(), "..");
        print(
          runEvaluationBattery({
            repoRoot,
            paths,
            recovery_task_id: args["recovery-task"] ?? "T01",
            keep_workspaces: args["keep-workspaces"] === "true",
          }),
        );
        return;
      }
      if (args.command === "live-readiness") {
        print(probeLiveLlmReadiness());
        return;
      }
      if (args.command === "live-suite") {
        const repoRoot = args["repo-root"]
          ? resolve(args["repo-root"])
          : resolve(process.cwd(), "..");
        print(runLiveValidationSuite({ repoRoot, paths }));
        return;
      }
    }

    if (args.group === "engineering") {
      const paths = requireDataDir(args);
      if (args.command === "run") {
        if (!args["work-id"] || !args.workspace) {
          console.error("Required: --data-dir --work-id --workspace [--objective]");
          process.exit(1);
        }
        const svc = new EngineeringLoopService(paths);
        const engResult = svc.run({
          work_id: args["work-id"],
          workspace_root: resolve(args.workspace),
          objective: args.objective,
          goal_contract_id: args["goal-id"],
          domain: args.domain,
          max_replans: args["max-replans"] ? parseInt(args["max-replans"], 10) : undefined,
        });
        try {
          const mp = resolveMeasurementPaths(paths.root);
          const obs = recordEngineeringLoopObservation(mp, engResult);
          print({ ...engResult, measurement_observation: obs });
        } catch {
          print(engResult);
        }
        return;
      }
      if (args.command === "show") {
        if (!args["run-id"]) {
          console.error("Required: --run-id");
          process.exit(1);
        }
        print(new EngineeringLoopService(paths).load(args["run-id"]));
        return;
      }
    }

    if (args.group === "harness") {
      if (args.command === "matrix") {
        print({ kind: "HarnessMatrix", adapters: buildHarnessMatrix() });
        return;
      }
    }

    if (args.group === "telemetry") {
      const repoRoot = resolve(process.env.AGENTS_ROOT ?? process.cwd());
      void repoRoot;
      const result = handleTelemetryCommand(args.command, args);
      print(result.payload);
      process.exit(result.code);
    }

    if (args.group === "benchmark") {
      const repoRoot = resolve(process.env.AGENTS_ROOT ?? resolve(process.cwd(), ".."));
      // When invoked from orchestrator/, parent is repo root; allow override.
      const root = existsSync(resolve(repoRoot, "benchmarks/bench-obs"))
        ? repoRoot
        : resolve(process.cwd(), "..");
      const result = handleBenchmarkCommand(args.command, args, root);
      print(result.payload);
      process.exit(result.code);
    }

    console.error(`Unknown command: evolve ${args.group} ${args.command}`);
    usage();
    process.exit(1);
  } catch (err) {
    console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
    process.exit(1);
  }
}

main();
