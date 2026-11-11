/**
 * Zero-dependency status board — printable snapshot for CLI/TUI reconnect.
 * Not a full interactive TUI; Core does not depend on this module for execution.
 */

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CoordinatorService } from "../coordinator/service.js";
import { TaskGraphStore } from "../task-graph/store.js";
import { AgentRegistryStore } from "../agent-registry/store.js";
import { WorkLedgerStore } from "../work-ledger/store.js";
import { listAdapterContracts } from "../adapters/catalog.js";
import type { V3DataPaths } from "../paths.js";

export interface StatusBoardSnapshot {
  kind: "StatusBoardSnapshot";
  generated_at: string;
  coordinator_process: string;
  works: Array<{
    work_id: string;
    work_state: string;
    goal_contract_id: string;
    tasks: { total: number; by_state: Record<string, number> };
    agents: { total: number; by_state: Record<string, number> };
    ledger?: { latest_version: number; entry_count: number; work_state: string };
  }>;
  adapters_summary: Array<{
    adapter_id: string;
    execution_bridge: string;
    certification: string;
  }>;
  limitation: string;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function buildStatusBoard(paths: V3DataPaths): StatusBoardSnapshot {
  const coordinator = new CoordinatorService(paths);
  const status = coordinator.status();
  const tasks = new TaskGraphStore(paths.taskGraphsDir);
  const agents = new AgentRegistryStore(paths.agentsDir);
  const ledger = new WorkLedgerStore(paths.workLedgerDir);

  const works = status.coordinator.works.map((w) => {
    let taskSummary = { total: 0, by_state: {} as Record<string, number> };
    let agentSummary = { total: 0, by_state: {} as Record<string, number> };
    let ledgerSnap: StatusBoardSnapshot["works"][0]["ledger"];

    try {
      const graph = tasks.load(w.work_id);
      taskSummary = {
        total: graph.tasks.length,
        by_state: countBy(graph.tasks, (t) => t.state),
      };
    } catch {
      /* graph may be absent */
    }

    try {
      const snap = agents.load(w.work_id);
      agentSummary = {
        total: snap.agents.length,
        by_state: countBy(snap.agents, (a) => a.state),
      };
    } catch {
      /* registry may be absent */
    }

    try {
      const meta = ledger.snapshot(w.work_id);
      ledgerSnap = {
        latest_version: meta.latest_version,
        entry_count: meta.entry_count,
        work_state: meta.work_state,
      };
    } catch {
      ledgerSnap = undefined;
    }

    return {
      work_id: w.work_id,
      work_state: w.work_state,
      goal_contract_id: w.goal_contract_id,
      tasks: taskSummary,
      agents: agentSummary,
      ledger: ledgerSnap,
    };
  });

  return {
    kind: "StatusBoardSnapshot",
    generated_at: new Date().toISOString(),
    coordinator_process: status.coordinator.process_state,
    works,
    adapters_summary: listAdapterContracts().map((a) => ({
      adapter_id: a.adapter_id,
      execution_bridge: a.execution_bridge,
      certification: a.certification,
    })),
    limitation: status.limitation,
  };
}

/** Plain-text board for terminals without JSON consumers. */
export function renderStatusBoardText(snap: StatusBoardSnapshot): string {
  const lines: string[] = [];
  lines.push("EvolveLoop V3 — Status Board (read-only)");
  lines.push(`generated: ${snap.generated_at}`);
  lines.push(`coordinator: ${snap.coordinator_process}`);
  lines.push("");
  if (snap.works.length === 0) {
    lines.push("(no works registered)");
  }
  for (const w of snap.works) {
    lines.push(`work ${w.work_id}  state=${w.work_state}  goal=${w.goal_contract_id}`);
    lines.push(
      `  tasks=${w.tasks.total} ${JSON.stringify(w.tasks.by_state)}  agents=${w.agents.total} ${JSON.stringify(w.agents.by_state)}`,
    );
    if (w.ledger) {
      lines.push(
        `  ledger v${w.ledger.latest_version} entries=${w.ledger.entry_count} state=${w.ledger.work_state}`,
      );
    }
  }
  lines.push("");
  lines.push("adapters:");
  for (const a of snap.adapters_summary) {
    lines.push(`  ${a.adapter_id}  bridge=${a.execution_bridge}  cert=${a.certification}`);
  }
  lines.push("");
  lines.push(`limitation: ${snap.limitation}`);
  return lines.join("\n");
}

/** List work ids that have ledger files (for orphan detection helpers). */
export function listLedgerWorkIds(paths: V3DataPaths): string[] {
  if (!existsSync(paths.workLedgerDir)) return [];
  return readdirSync(paths.workLedgerDir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => f.replace(/\.jsonl$/, ""));
}

export function listHandoffIds(paths: V3DataPaths): string[] {
  if (!existsSync(paths.handoffsDir)) return [];
  return readdirSync(paths.handoffsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

export function handoffPath(paths: V3DataPaths, handoffId: string): string {
  return join(paths.handoffsDir, `${handoffId}.json`);
}
