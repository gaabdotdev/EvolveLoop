#!/usr/bin/env node
/**
 * EvolveLoop product CLI — workspace = cwd, state = .evolveloop/
 *
 * Default (no args): conversational shell (PT) with status panel + Ctrl+P/Ctrl+C.
 * Subcommands remain available (intent, circuit, goal, …).
 *
 * Installable: repo bin/evolve → orchestrator/dist/cli/evolve.js
 */
import "./silence-experimental-sqlite.js";
import { readFileSync } from "node:fs";
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
import { runIntentFlow } from "../v3/intake/intent-flow.js";
import {
  runEvolveShell,
  detectWorkspaceSession,
  runFirstRunSetup,
} from "../v3/evolve-shell/index.js";
import { runInkEvolveShell, shouldUseInkTui } from "./tui/index.js";
import { hydrateHarnessConsentFromConfig } from "../v3/security/harness-consent.js";
import { defaultStateDbPath, StateDb } from "../v3/state-db/store.js";
import {
  runFireFive,
  runV0Circuit,
  selectV0AgentAdapter,
} from "../v3/circuit/index.js";
import {
  probeV0ModelProviders,
  createV1FreeLLMAPI,
} from "../v3/model-providers/index.js";
import {
  createEvolveDaemon,
  createEvolveDaemonClient,
  defaultRuntimeSockPath,
} from "../v3/daemon/index.js";
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
  enrichArgsWithPositional,
  handleAgentsSurface,
  normalizeAgentsGroup,
} from "./agents-surface.js";
import { handleV35Command } from "./v35-commands.js";
import { handleV36Command, V36_USAGE_GROUPS } from "./v36-commands.js";
import { formatAdvancedHelp, formatJourneyHelp } from "./help-usage.js";
import { handleConfigSurface } from "./config-surface.js";
import { handleHistorySurface } from "./tui/task-history.js";
import { handleDeliverySurface } from "./delivery-surface.js";
import {
  getJourneyPause,
  resumeJourneyTask,
} from "./tui/journey-pause.js";
import {
  handleWorkspaceProductSurface,
  normalizeWorkspaceIntegrationGroup,
  integrationAliasNote,
} from "./workspace-product-surface.js";
import { formatContinuityLimitation } from "../v3/continuity/limitation-ui.js";
import {
  formatConfigWarnings,
  loadEvolveLoopProfileDetailed,
} from "../config/profile.js";
import { validateWorkspaceConfigFile } from "../config/profile.js";
import { workspaceConfigPath } from "../v3/agent-handles/preference.js";

function parseArgs(argv: string[]) {
  const group = argv[2] ?? "help";
  // P2-1: `evolve help advanced` keeps command=advanced; bare --help/-h → journey.
  if (group === "--help" || group === "-h") {
    return { group: "help", command: "help" } as Record<string, string>;
  }
  if (group === "help") {
    const sub =
      argv[3] && !argv[3].startsWith("--") ? argv[3] : "help";
    return { group: "help", command: sub } as Record<string, string>;
  }
  const command = argv[3] && !argv[3].startsWith("--") ? argv[3] : "help";
  const args: Record<string, string> = { group, command };
  const start = argv[3] && !argv[3].startsWith("--") ? 4 : 3;
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

/** P2-1: short journey help by default; full map via `evolve help advanced`. */
function usage(kind: "journey" | "advanced" = "journey") {
  if (kind === "advanced") {
    console.log(formatAdvancedHelp());
    return;
  }
  console.log(formatJourneyHelp());
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
  hydrateHarnessConsentFromConfig();
  const argv = process.argv;
  const first = argv[2];

  // V0-CLI-01/02: default entry → conversational shell on cwd
  if (
    first === undefined ||
    first === "shell" ||
    first === "repl" ||
    first === "--shell"
  ) {
    const workspace = resolve(
      (() => {
        for (let i = 2; i < argv.length; i++) {
          if (argv[i] === "--workspace" && argv[i + 1]) return argv[i + 1]!;
          if (argv[i] === "--cwd" && argv[i + 1]) return argv[i + 1]!;
        }
        return process.cwd();
      })(),
    );
    // V4.2 P0-2: interactive warn on invalid config (não quebra hosts sem flag)
    const profileDetail = loadEvolveLoopProfileDetailed();
    const wsIssues = validateWorkspaceConfigFile(workspaceConfigPath(workspace));
    const warnLines = formatConfigWarnings([
      ...profileDetail.issues,
      ...wsIssues,
    ]);
    for (const line of warnLines) {
      console.error(line);
    }
    if (profileDetail.used_fallback && profileDetail.path) {
      console.error(
        `⚠ config: a usar DEFAULT — valide com: evolve config validate --workspace ${workspace}`,
      );
    }
    const shellOpts = { workspace };
    const result = shouldUseInkTui(shellOpts)
      ? await runInkEvolveShell(shellOpts)
      : await runEvolveShell(shellOpts);
    process.exitCode = result.exit_code;
    return;
  }

  let args = parseArgs(process.argv);
  args.group = normalizeAgentsGroup(args.group);
  const integAlias = normalizeWorkspaceIntegrationGroup(args.group);
  args.group = integAlias.group;
  args = enrichArgsWithPositional(process.argv, args);
  if (args.group === "help") {
    usage(args.command === "advanced" ? "advanced" : "journey");
    return;
  }

  try {
    if (integAlias.aliased_from_integration) {
      console.error(integrationAliasNote());
    }
    // V4.1 P1 — product agents surface (list/inspect/attach/logs) before legacy JSON paths
    if (args.group === "agents") {
      const surface = handleAgentsSurface(args, { printJson: print });
      if (surface.handled) {
        if (surface.exitCode != null) process.exitCode = surface.exitCode;
        return;
      }
    }
    // V4.2 P0 — config prefs / validate
    if (args.group === "config") {
      const surface = handleConfigSurface(args, {
        printJson: print,
        argv: process.argv,
      });
      if (surface.handled) {
        if (surface.exitCode != null) process.exitCode = surface.exitCode;
        return;
      }
    }
    // V4.2 P0-4 — task/contract history
    if (args.group === "history") {
      const surface = handleHistorySurface(args, {
        printJson: print,
        argv: process.argv,
      });
      if (surface.handled) {
        if (surface.exitCode != null) process.exitCode = surface.exitCode;
        return;
      }
    }
    // V4.2 P1-1 — use/switch Workspace produto
    if (args.group === "use" || args.group === "switch") {
      const surface = handleWorkspaceProductSurface(args, {
        printJson: print,
        argv: process.argv,
      });
      if (surface.handled) {
        if (surface.exitCode != null) process.exitCode = surface.exitCode;
        return;
      }
    }
    // V1-PROD-01 — first-run setup / readiness
    if (args.group === "setup") {
      const workspace = resolve(args.workspace ?? args.cwd ?? process.cwd());
      const credentials: Array<{ name: string; value: string }> = [];
      // Accept --set KEY=VALUE without echoing secrets into report beyond names
      for (const [k, v] of Object.entries(args)) {
        if (k.startsWith("set-") && typeof v === "string") {
          credentials.push({ name: k.slice(4).toUpperCase().replace(/-/g, "_"), value: v });
        }
      }
      if (args["openrouter-key"]) {
        credentials.push({ name: "OPENROUTER_API_KEY", value: args["openrouter-key"] });
      }
      if (args["freellmapi-key"]) {
        credentials.push({ name: "FREELLMAPI_API_KEY", value: args["freellmapi-key"] });
      }
      const report = await runFirstRunSetup({
        workspace,
        non_interactive: true,
        credentials: credentials.length ? credentials : undefined,
        limits: {
          max_parallel_tasks: args["max-parallel"]
            ? Number(args["max-parallel"])
            : undefined,
          max_agent_sessions: args["max-sessions"]
            ? Number(args["max-sessions"])
            : undefined,
        },
      });
      print(report);
      process.exitCode = report.ready ? 0 : 1;
      return;
    }

    // V1-PROD-02 — FreeLLMAPI catalog/health
    if (args.group === "freellm") {
      const provider = createV1FreeLLMAPI({
        baseUrl: args["base-url"],
        apiKey: args.key,
      });
      if (args.command === "catalog") {
        print(await provider.discoverCatalog());
        return;
      }
      print(await provider.healthCheck());
      return;
    }

    // V1-ORCH-01 — UDS daemon
    if (args.group === "daemon") {
      const workspace = resolve(args.workspace ?? args.cwd ?? process.cwd());
      const sock = args.sock ? resolve(args.sock) : defaultRuntimeSockPath(workspace);

      if (args.command === "start") {
        const daemon = createEvolveDaemon({ sock_path: sock });
        await daemon.start();
        print({
          kind: "EvolveDaemonStarted",
          server_id: daemon.server_id,
          sock_path: daemon.sock_path,
          message: "listening; Ctrl+C stops daemon; client Ctrl+D does not kill runs",
        });
        const shutdown = async () => {
          await daemon.stop();
          process.exit(0);
        };
        process.on("SIGINT", () => void shutdown());
        process.on("SIGTERM", () => void shutdown());
        await new Promise(() => {
          /* keep alive */
        });
        return;
      }

      if (args.command === "ping" || args.command === "status") {
        const client = createEvolveDaemonClient(sock);
        await client.connect();
        try {
          const msg =
            args.command === "ping"
              ? await client.request({ type: "ping" })
              : await client.request({ type: "status" });
          print(msg);
        } finally {
          await client.disconnect();
        }
        return;
      }

      print({
        usage: "evolve daemon start|ping|status [--sock path] [--workspace path]",
        default_sock: sock,
      });
      return;
    }

    // V4.3 P0-1: evolve resume → same journey pause axis as TUI + session detect
    if (
      args.group === "resume" &&
      (args.command === "help" || args.command === "detect" || !argv[3])
    ) {
      const workspace = resolve(args.workspace ?? args.cwd ?? process.cwd());
      if (argv[3] === "help") {
        console.log(
          [
            "evolve resume — retoma pausa de jornada (StateDb) + session detect",
            "  evolve resume          # limpa journey pause (idempotente) + JSON sessão",
            "  evolve resume detect   # só lê pause + sessão (não altera)",
            "Mesmo eixo que TUI Ctrl+P / /pause. ≠ workflow resume.",
          ].join("\n"),
        );
        return;
      }
      const journey =
        argv[3] === "detect"
          ? getJourneyPause(workspace)
          : resumeJourneyTask(workspace, "cli");
      print({
        ...detectWorkspaceSession(workspace),
        journey_pause: journey,
      });
      return;
    }

    // V4.3 P0-2 — delivery show|validate from evidence
    if (args.group === "delivery") {
      const surface = handleDeliverySurface(args, {
        printJson: print,
        argv: process.argv,
      });
      if (surface.handled) {
        if (surface.exitCode != null) process.exitCode = surface.exitCode;
        return;
      }
    }

    // V3.6 Global Operations Center (ops-dir; does not require --data-dir)
    const v36Groups = new Set(Object.keys(V36_USAGE_GROUPS));
    if (v36Groups.has(args.group)) {
      const handled = await handleV36Command(args);
      if (handled) return;
    }

    // V3.5 operational groups (service/runtime/sandbox/harness/workspace/approvals)
    const v35Groups = new Set([
      "service",
      "runtime",
      "sandbox",
      "approvals",
      "workspace",
    ]);
    if (
      v35Groups.has(args.group) ||
      (args.group === "harness" && args.command !== "matrix") ||
      (args.group === "agents" &&
        args.command === "inspect" &&
        args.format === "json" &&
        Boolean(args["data-dir"]))
    ) {
      const paths = requireDataDir(args);
      const handled = await handleV35Command(args, paths);
      if (handled) return;
    }

    // V0 Bloco 3 — E2E circuit
    if (args.group === "circuit") {
      const workspace = resolve(args.workspace ?? args.cwd ?? process.cwd());
      const stateDb = args["state-db"] ? resolve(args["state-db"]) : defaultStateDbPath(workspace);

      if (args.command === "probe" || args.command === "help") {
        const models = await probeV0ModelProviders();
        const adapter = await selectV0AgentAdapter();
        const adapter_health = await adapter.healthCheck();
        print({
          kind: "V0CircuitProbe",
          rule: "1+1+1",
          local_model: models.local,
          remote_provider: models.remote,
          agent_adapter: adapter_health,
        });
        return;
      }

      if (args.command === "ledger") {
        const db = new StateDb(stateDb);
        try {
          print({
            db_path: db.path,
            journal_mode: db.journalMode(),
            token_ledger: db.listTokenLedger(args["work-id"]),
            circuit_runs: db.listCircuitRuns(args["work-id"]),
          });
        } finally {
          db.close();
        }
        return;
      }

      if (args.command === "run") {
        const task_id = args["task-id"] ?? `task-${Date.now()}`;
        const intent =
          args.intent?.trim() ||
          args.text?.trim() ||
          `Criar marcador de circuito V0 em .evolveloop/circuit-markers/${task_id}.txt`;
        const result = await runV0Circuit({
          workspace,
          state_db_path: stateDb,
          worktree_path: args.worktree ? resolve(args.worktree) : undefined,
          lightweight_validator: args["full-validator"] !== "true",
          task: {
            task_id,
            intent,
            marker_name: args.marker ?? `${task_id}.txt`,
            marker_content: args["marker-content"] ?? task_id,
            offline_apply_marker: args["offline-fixture"] === "true",
            adapter_timeout_ms: args.timeout ? Number(args.timeout) : 300_000,
          },
          confirm_mso: true,
        });
        print(result);
        if (result.status === "TRUE_FULL_PASS") return;
        process.exitCode = result.status === "BLOCKED" ? 2 : 1;
        return;
      }

      if (args.command === "fire-5") {
        const worktree_base = args["worktree-base"]
          ? resolve(args["worktree-base"])
          : undefined;
        const results = await runFireFive({
          workspace,
          state_db_path: stateDb,
          worktree_base,
          use_offline_fixture: args["offline-fixture"] === "true",
          lightweight_validator: args["full-validator"] !== "true",
          adapter_timeout_ms: args.timeout ? Number(args.timeout) : 300_000,
        });
        print({
          kind: "FireFiveSummary",
          count: results.length,
          results: results.map((r) => ({
            run_id: r.run_id,
            task_id: r.task_id,
            status: r.status,
            reason: r.reason,
            goal_contract_id: r.goal_contract_id,
            token_ledger_entry_id: r.token_ledger_entry_id,
          })),
        });
        const db = new StateDb(stateDb);
        try {
          print({
            ledger_tail: db.listTokenLedger().slice(0, 20),
            circuit_runs: db.listCircuitRuns().slice(0, 10),
          });
        } finally {
          db.close();
        }
        return;
      }

      console.error(
        "Usage: evolve circuit probe|run|fire-5|ledger [--workspace .] [--offline-fixture true]",
      );
      process.exit(1);
    }

    // V0 Bloco 2 — intent / trivial ops (SQLite WAL under workspace)
    if (
      args.group === "intent" ||
      args.group === "status" ||
      args.group === "pause" ||
      args.group === "resume"
    ) {
      const workspace = resolve(args.workspace ?? args.cwd ?? process.cwd());
      let intentText = "";
      if (args.group === "intent") {
        intentText = args.text?.trim() || (args.command !== "help" ? args.command.trim() : "");
        if (!intentText || intentText === "help") {
          console.error(
            'Required: evolve intent --text "<intenção>" [--workspace .] [--answers-json path] [--confirm-mso] [--goal-id id]',
          );
          process.exit(1);
        }
      } else {
        intentText = args.group;
      }

      // Non-interactive V0: missing/empty answers → recommended defaults (Enter/ok).
      let answers: Array<string | undefined> | Record<string, string> = [];
      if (args["answers-json"]) {
        answers = JSON.parse(readFileSync(resolve(args["answers-json"]), "utf-8")) as
          | Array<string | undefined>
          | Record<string, string>;
      }

      const result = runIntentFlow({
        workspace,
        intent: intentText,
        answers,
        confirm_mso: args["confirm-mso"] === "true",
        state_db_path: args["state-db"],
        goal_contract_id: args["goal-id"] ?? args.id,
        mirror_goal_contracts_dir: args["mirror-goals-dir"],
        evidence_dir: args["evidence-dir"],
      });

      if (result.kind === "goal_contract" && args.format !== "json") {
        console.error(result.grill_prompts_pt.join("\n---\n"));
        console.error("");
        console.error(result.summary_lines.join("\n"));
        if (result.goal_document_id) {
          console.error(`Goal Document: ${result.goal_document_id}`);
        }
        console.error(
          `Runtime gate: scale=${result.scale} planning=${result.planning.planning_authorized}`,
        );
        if (result.mso_ready) {
          console.error(
            "Orchestrator: confirmado (pronto para execução — não executado neste comando).",
          );
        } else {
          console.error(
            "Orchestrator: pendente — passe --confirm-mso para marcar disparo.",
          );
        }
      } else if ("message_pt" in result) {
        console.error(result.message_pt);
      }
      print(result);
      return;
    }

    if (args.group === "goal-db" || (args.group === "goal" && args.command === "db-show")) {
      const workspace = resolve(args.workspace ?? process.cwd());
      const dbPath = args["state-db"] ? resolve(args["state-db"]) : defaultStateDbPath(workspace);
      const db = new StateDb(dbPath);
      try {
        const id = args.id ?? args["goal-id"];
        if (!id) {
          print({
            db_path: db.path,
            journal_mode: db.journalMode(),
            contracts: db.listValidatedGoalContracts(),
          });
        } else {
          print(db.loadLatestGoalContract(id) ?? { error: "NOT_FOUND", id });
        }
      } finally {
        db.close();
      }
      return;
    }

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
        const applied = engine.applyHandoff(args["handoff-id"], {
          substitute_agent_id: args["substitute-agent-id"],
          create_substitute: args["create-substitute"] !== "false",
        });
        const lim = formatContinuityLimitation({
          kind: "handoff",
          handoff: applied,
        });
        console.log(lim.lines.join("\n"));
        print(applied);
        return;
      }
      if (args.command === "show") {
        if (!args["handoff-id"]) {
          console.error("Required: --handoff-id");
          process.exit(1);
        }
        const pkg = engine.load(args["handoff-id"]);
        // V4.2 P1-4 — 3 linhas humanas (preservado / perdido / próximo)
        const lim = formatContinuityLimitation({ kind: "handoff", handoff: pkg });
        if (args.format === "json") {
          print({ ...pkg, continuity_limitation: lim });
        } else {
          console.log(lim.lines.join("\n"));
          if (args.format !== "human") {
            print(pkg);
          }
        }
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
        const waitRaw = args["wait-ms"];
        const wait_ms =
          waitRaw != null && waitRaw !== "" ? Number(waitRaw) : undefined;
        const result = await getAdapterDriver(args.id).invoke(paths, {
          work_id: args["work-id"],
          task_id: args["task-id"],
          agent_id: args["agent-id"],
          ir_path: args.ir ? resolve(args.ir) : undefined,
          provider_mode: mode,
          workspace_path: args.workspace ? resolve(args.workspace) : undefined,
          note: args.note,
          wait_ms: Number.isFinite(wait_ms) ? wait_ms : undefined,
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
    }

    if (args.group === "engineering") {
      const paths = requireDataDir(args);
      if (args.command === "run") {
        if (!args["work-id"] || !args.workspace) {
          console.error("Required: --data-dir --work-id --workspace [--objective]");
          process.exit(1);
        }
        const svc = new EngineeringLoopService(paths);
        print(
          svc.run({
            work_id: args["work-id"],
            workspace_root: resolve(args.workspace),
            objective: args.objective,
            goal_contract_id: args["goal-id"],
            domain: args.domain,
            max_replans: args["max-replans"] ? parseInt(args["max-replans"], 10) : undefined,
          }),
        );
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

    console.error(`Unknown command: evolve ${args.group} ${args.command}`);
    usage();
    process.exit(1);
  } catch (err) {
    console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
    process.exit(1);
  }
}

main();
