/**
 * Minimal interactive TUI — readline loop over durable Core state.
 * Closing this loop does not stop supervised coordinator ticks.
 */

import * as readline from "node:readline";
import type { V3DataPaths } from "../paths.js";
import { CoordinatorService } from "../coordinator/service.js";
import { WorkLedgerStore } from "../work-ledger/store.js";
import { listAdapterContracts } from "../adapters/catalog.js";
import { listAdapterDrivers } from "../adapters/drivers/registry.js";
import { ModelCatalogStore } from "../model-catalog/store.js";
import { TaskGraphStore } from "../task-graph/store.js";
import { AgentRegistryStore } from "../agent-registry/store.js";
import { CoordinationEventLog } from "../event-log/store.js";
import { GoalContractStore } from "../goal-contract/store.js";
import { buildContextView } from "../context/views.js";
import type { ContextViewRole } from "../context/types.js";
import { compactContextView } from "../context/compaction.js";
import { evaluateBudgets, detectStuck } from "../budget/tracker.js";
import { evaluateHierarchicalBudgets } from "../budget/hierarchical.js";
import { routeResources } from "../routing/router.js";
import { probeNomicEmbed, hybridRetrieve } from "../embeddings/index.js";
import { cancelWorkSlice } from "../cancel/index.js";
import { scheduleReadyTasks } from "../parallel/index.js";
import { planSubtreeRecovery, recoverSubtree } from "../recovery/subtree.js";
import { WorkLockStore } from "../locks/store.js";
import { ContinuityEngine } from "../continuity/engine.js";
import { triggerLimitHandoff } from "../limits/index.js";
import { buildStatusBoard, renderStatusBoardText } from "./status-board.js";

export interface InteractiveTuiOptions {
  paths: V3DataPaths;
  workId?: string;
  /** Injected for tests — when set, no stdin loop. */
  inputLines?: string[];
  output?: (line: string) => void;
}

function helpText(): string {
  return [
    "commands:",
    "  help                      show this help",
    "  status                    status board (all works)",
    "  tick [work-id]            coordinator tick",
    "  work <work-id>            set current work-id",
    "  detail [work-id]          goal/tasks/agents summary",
    "  ledger [work-id]          ledger snapshot + last 5",
    "  events [work-id] [n]      last n coordination events (default 10)",
    "  context [role] [agent-id] Context View (default master)",
    "  compact [role]            compact Context View + fidelity",
    "  stuck [work-id]           stuck detection report",
    "  budgets [work-id]         budget evaluation report",
    "  hier-budgets [work-id]    hierarchical budget rollup",
    "  parallel [work-id]        schedule ready tasks (max 2)",
    "  cancel <agent-id> [reason] cancel agent (+ cascade)",
    "  recovery <parent-id> [plan|apply] subtree recovery",
    "  lock status|acquire <agent-id>",
    "  handoff <agent-id> <signal>  limit→handoff (pending)",
    "  route [--decision-model]  route (decision model fail-closed if unavailable)",
    "  retrieve <query...>       hybrid retrieve (keyword + nomic if up)",
    "  embeddings                probe nomic-embed-text via Ollama",
    "  adapters                  adapter contracts + can_invoke",
    "  models                    model catalog",
    "  quit | exit               leave TUI (supervisor keeps running)",
  ].join("\n");
}

function requireWork(current: string | undefined, arg?: string): string | undefined {
  return arg ?? current;
}

export async function runInteractiveTui(opts: InteractiveTuiOptions): Promise<{ lines: string[] }> {
  const outLines: string[] = [];
  const write = (line: string) => {
    outLines.push(line);
    (opts.output ?? console.log)(line);
  };
  const writeJson = (obj: unknown) => write(JSON.stringify(obj, null, 2));

  let currentWork = opts.workId;
  const paths = opts.paths;
  const coordinator = new CoordinatorService(paths);
  const ledger = new WorkLedgerStore(paths.workLedgerDir);
  const models = new ModelCatalogStore(paths.modelCatalogDir);

  write("EvolveLoop V3 interactive TUI");
  write("Core does not depend on this process for durable work.");
  write(helpText());
  if (currentWork) write(`current work: ${currentWork}`);

  const handle = async (raw: string): Promise<"continue" | "quit"> => {
    const line = raw.trim();
    if (!line) return "continue";
    const parts = line.split(/\s+/);
    const cmd = parts[0]!;
    const arg = parts[1];
    const arg2 = parts[2];

    switch (cmd) {
      case "help":
      case "?":
        write(helpText());
        return "continue";
      case "quit":
      case "exit":
        write("bye — supervised ticks (if any) keep running independently");
        return "quit";
      case "status":
        write(renderStatusBoardText(buildStatusBoard(paths)));
        return "continue";
      case "work":
        if (!arg) {
          write(`current work: ${currentWork ?? "(none)"}`);
          return "continue";
        }
        currentWork = arg;
        write(`current work: ${currentWork}`);
        return "continue";
      case "tick": {
        const wid = requireWork(currentWork, arg);
        if (!wid) {
          write("error: set work <id> or tick <work-id>");
          return "continue";
        }
        try {
          writeJson(coordinator.tick(wid));
        } catch (err) {
          write(`error: ${err instanceof Error ? err.message : err}`);
        }
        return "continue";
      }
      case "detail": {
        const wid = requireWork(currentWork, arg);
        if (!wid) {
          write("error: set work <id> or detail <work-id>");
          return "continue";
        }
        try {
          const graph = new TaskGraphStore(paths.taskGraphsDir).load(wid);
          const goal = new GoalContractStore(paths.goalContractsDir).loadLatest(graph.goal_contract_id);
          const agents = new AgentRegistryStore(paths.agentsDir).load(wid);
          writeJson({
            work_id: wid,
            goal: {
              id: goal.goal_contract_id,
              version: goal.version,
              objective: goal.objective,
              criteria: goal.criteria.map((c) => ({ id: c.id, state: c.state, mandatory: c.mandatory })),
            },
            tasks: graph.tasks.map((t) => ({
              id: t.task_id,
              state: t.state,
              owner: t.owner_agent_id,
              plan_approved: t.plan_approved,
            })),
            agents: agents.agents.map((a) => ({
              id: a.agent_id,
              role: a.role,
              state: a.state,
              task: a.task_id,
            })),
          });
        } catch (err) {
          write(`error: ${err instanceof Error ? err.message : err}`);
        }
        return "continue";
      }
      case "ledger": {
        const wid = requireWork(currentWork, arg);
        if (!wid) {
          write("error: set work <id> or ledger <work-id>");
          return "continue";
        }
        try {
          writeJson({
            snapshot: ledger.snapshot(wid),
            recent: ledger.read(wid).slice(-5),
          });
        } catch (err) {
          write(`error: ${err instanceof Error ? err.message : err}`);
        }
        return "continue";
      }
      case "events": {
        const wid = requireWork(currentWork, arg);
        if (!wid) {
          write("error: set work <id> or events <work-id>");
          return "continue";
        }
        const n = arg2 ? parseInt(arg2, 10) : arg && /^\d+$/.test(arg) ? parseInt(arg, 10) : 10;
        const workId = arg && /^\d+$/.test(arg) ? currentWork : wid;
        if (!workId) {
          write("error: need work-id");
          return "continue";
        }
        const all = new CoordinationEventLog(paths.eventLogDir).read(workId);
        writeJson({ work_id: workId, total: all.length, recent: all.slice(-(Number.isFinite(n) ? n : 10)) });
        return "continue";
      }
      case "context": {
        const wid = currentWork;
        if (!wid) {
          write("error: set work <id> first");
          return "continue";
        }
        const role = (arg ?? "master") as ContextViewRole;
        const agentId = arg2;
        try {
          writeJson(buildContextView(paths, { work_id: wid, role, agent_id: agentId }));
        } catch (err) {
          write(`error: ${err instanceof Error ? err.message : err}`);
        }
        return "continue";
      }
      case "compact": {
        const wid = currentWork;
        if (!wid) {
          write("error: set work <id> first");
          return "continue";
        }
        try {
          const view = buildContextView(paths, {
            work_id: wid,
            role: (arg ?? "master") as ContextViewRole,
          });
          const compacted = compactContextView(view);
          writeJson({
            fidelity_status: compacted.fidelity_status,
            fidelity: compacted.fidelity,
            lines_before: compacted.lines_before,
            lines_after: compacted.lines_after,
            lines_dropped: compacted.lines_dropped,
            reinject_allowed: compacted.reinject_allowed,
            missing_must_keep: compacted.missing_must_keep,
          });
        } catch (err) {
          write(`error: ${err instanceof Error ? err.message : err}`);
        }
        return "continue";
      }
      case "retrieve": {
        const wid = currentWork;
        if (!wid) {
          write("error: set work <id> first");
          return "continue";
        }
        const query = parts.slice(1).join(" ").trim();
        if (!query) {
          write("error: retrieve <query>");
          return "continue";
        }
        try {
          writeJson(await hybridRetrieve(paths, { work_id: wid, query }));
        } catch (err) {
          write(`error: ${err instanceof Error ? err.message : err}`);
        }
        return "continue";
      }
      case "embeddings": {
        writeJson(await probeNomicEmbed());
        return "continue";
      }
      case "stuck": {
        const wid = requireWork(currentWork, arg);
        if (!wid) {
          write("error: set work <id>");
          return "continue";
        }
        try {
          writeJson(detectStuck(paths, wid));
        } catch (err) {
          write(`error: ${err instanceof Error ? err.message : err}`);
        }
        return "continue";
      }
      case "budgets": {
        const wid = requireWork(currentWork, arg);
        if (!wid) {
          write("error: set work <id>");
          return "continue";
        }
        try {
          writeJson(evaluateBudgets(paths, wid));
        } catch (err) {
          write(`error: ${err instanceof Error ? err.message : err}`);
        }
        return "continue";
      }
      case "hier-budgets": {
        const wid = requireWork(currentWork, arg);
        if (!wid) {
          write("error: set work <id>");
          return "continue";
        }
        try {
          writeJson(evaluateHierarchicalBudgets(paths, wid));
        } catch (err) {
          write(`error: ${err instanceof Error ? err.message : err}`);
        }
        return "continue";
      }
      case "parallel": {
        const wid = requireWork(currentWork, arg);
        if (!wid) {
          write("error: set work <id>");
          return "continue";
        }
        writeJson(scheduleReadyTasks(paths, wid, { max_in_progress: 2 }));
        return "continue";
      }
      case "cancel": {
        const wid = currentWork;
        if (!wid || !arg) {
          write("error: set work <id> and cancel <agent-id> [reason]");
          return "continue";
        }
        writeJson(
          cancelWorkSlice(paths, {
            work_id: wid,
            agent_id: arg,
            reason: parts.slice(2).join(" ") || "tui-cancel",
          }),
        );
        return "continue";
      }
      case "recovery": {
        const wid = currentWork;
        if (!wid || !arg) {
          write("error: set work <id> and recovery <parent-agent-id> [plan|apply]");
          return "continue";
        }
        const mode = arg2 === "apply" ? "apply" : "plan";
        writeJson(
          mode === "apply"
            ? recoverSubtree(paths, { work_id: wid, failed_parent_id: arg, action: "orphan" })
            : planSubtreeRecovery(paths, wid, arg),
        );
        return "continue";
      }
      case "lock": {
        const wid = currentWork;
        if (!wid) {
          write("error: set work <id> first");
          return "continue";
        }
        const locks = new WorkLockStore(paths.locksDir);
        if (arg === "status" || !arg) {
          writeJson(locks.load(wid));
          return "continue";
        }
        if (arg === "acquire") {
          if (!arg2) {
            write("error: lock acquire <agent-id>");
            return "continue";
          }
          writeJson(locks.acquire({ work_id: wid, holder_agent_id: arg2 }));
          return "continue";
        }
        write("error: lock status|acquire <agent-id>");
        return "continue";
      }
      case "handoff": {
        const wid = currentWork;
        if (!wid || !arg) {
          write("error: set work <id> and handoff <agent-id> <signal...>");
          return "continue";
        }
        const signal = parts.slice(2).join(" ") || "quota exhausted";
        writeJson(
          triggerLimitHandoff(paths, {
            work_id: wid,
            agent_id: arg,
            signal,
            apply_handoff: false,
          }),
        );
        return "continue";
      }
      case "continuity-show": {
        if (!arg) {
          write("error: continuity-show <handoff-id>");
          return "continue";
        }
        writeJson(new ContinuityEngine(paths).load(arg));
        return "continue";
      }
      case "route": {
        const wid = currentWork;
        if (!wid) {
          write("error: set work <id> first");
          return "continue";
        }
        const useDecision = parts.includes("--decision-model");
        writeJson(
          await routeResources(paths, {
            work_id: wid,
            prefer_local: true,
            require_invokable_adapter: false,
            use_decision_model: useDecision,
          }),
        );
        return "continue";
      }
      case "adapters": {
        const contracts = listAdapterContracts();
        const drivers = listAdapterDrivers();
        writeJson(
          contracts.map((c) => ({
            adapter_id: c.adapter_id,
            execution_bridge: c.execution_bridge,
            certification: c.certification,
            can_invoke: drivers.find((d) => d.adapter_id === c.adapter_id)?.can_invoke ?? false,
          })),
        );
        return "continue";
      }
      case "models": {
        let snap = models.load();
        if (snap.models.length === 0) snap = models.seed();
        writeJson({
          version: snap.version,
          models: snap.models.map((m) => ({
            id: m.model_id,
            enabled: m.enabled,
            locality: m.locality,
            backend: m.backend,
          })),
          limitations: snap.limitations,
        });
        return "continue";
      }
      default:
        write(`unknown command: ${cmd} (try help)`);
        return "continue";
    }
  };

  if (opts.inputLines) {
    for (const line of opts.inputLines) {
      const r = await handle(line);
      if (r === "quit") break;
    }
    return { lines: outLines };
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => {
    rl.question("evolve> ", async (answer) => {
      const r = await handle(answer);
      if (r === "quit") {
        rl.close();
        return;
      }
      prompt();
    });
  };
  prompt();

  await new Promise<void>((resolve) => {
    rl.on("close", () => resolve());
  });
  return { lines: outLines };
}
