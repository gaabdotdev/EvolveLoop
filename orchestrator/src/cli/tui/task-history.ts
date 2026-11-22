/**
 * V4.2 P0-4 / P1-3 — Histórico: listar + show humano (estado/evidências/limitações).
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  defaultStateDbPath,
  StateDb,
} from "../../v3/state-db/store.js";
import { defaultWorkspaceV3DataDir } from "../../v3/agent-handles/list-view.js";
import { shortObjectiveTitle } from "./goal-display.js";
import { deriveDeliveryFromWorkspace } from "./delivery-verify.js";

export interface HistoryEntry {
  id: string;
  kind: "contract" | "mso_session";
  title: string;
  state: string;
  updated_at: string;
  /** True when a partial resume path exists (TUI/resume) — never invents perfect resume. */
  resumable: boolean;
  limitation?: string;
  work_id?: string;
  goal_contract_id?: string;
}

export interface HistoryShowDetail {
  found: boolean;
  lines: string[];
  entry?: HistoryEntry;
  evidence_ids?: string[];
  evidence_count?: number;
  evidence_path_hint?: string;
  approvals_path_hint?: string;
  limitations: string[];
}

export interface TaskHistoryView {
  workspace: string;
  state_db_path: string;
  entries: HistoryEntry[];
  lines: string[];
  limitations: string[];
}

const DEFAULT_LIMIT = 10;

function resumeHint(entry: HistoryEntry): string {
  if (!entry.resumable) {
    return entry.limitation ?? "não retomável integralmente";
  }
  if (entry.kind === "mso_session") {
    return "retomável via TUI (evolve) ou evolve resume — estado parcial possível";
  }
  return "retomável: abra a TUI ou evolve intent no mesmo Workspace";
}

/**
 * Build a short history list from StateDb (contracts + MSO sessions).
 */
export function buildTaskHistoryView(
  workspaceRoot: string,
  opts?: { limit?: number; home?: string },
): TaskHistoryView {
  const workspace = resolve(workspaceRoot);
  const state_db_path = defaultStateDbPath(workspace);
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const limitations: string[] = [
    "Histórico = contratos/sessões deste Workspace (cwd/.evolveloop/); não é continuity handoff.",
    "Isolamento: state.db scoped a este path — contexto não vaza para outros Workspaces.",
    "Retomada pode ser parcial — limitações por entrada abaixo.",
  ];

  if (!existsSync(state_db_path)) {
    return {
      workspace,
      state_db_path,
      entries: [],
      lines: [
        "Histórico",
        `Workspace: ${workspace}`,
        "(sem state.db — execute evolve setup ou inicie uma Task)",
        ...limitations.map((l) => `Limitação: ${l}`),
      ],
      limitations,
    };
  }

  const db = new StateDb(state_db_path);
  const entries: HistoryEntry[] = [];
  try {
    const contracts = db.listValidatedGoalContracts().slice(0, limit);
    for (const c of contracts) {
      const needsConfirm = !c.mso_confirmed;
      entries.push({
        id: c.goal_contract_id,
        kind: "contract",
        title: shortObjectiveTitle(c.objective),
        state: needsConfirm ? "awaiting_confirm" : "validated",
        updated_at: c.updated_at,
        resumable: true,
        limitation: needsConfirm
          ? "Plan aguarda confirmação — retomada = rever Plan, não execução automática"
          : undefined,
        work_id: c.work_id,
        goal_contract_id: c.goal_contract_id,
      });
    }

    const sessions = db.listMsoSessionsForWorkspace(workspace, limit);
    for (const s of sessions) {
      if (entries.some((e) => e.id === s.session_id)) continue;
      const terminal = s.state === "TRUE-FULL-PASS";
      const blocked = s.state === "BLOCKED";
      entries.push({
        id: s.session_id,
        kind: "mso_session",
        title: s.goal_contract_id
          ? `Session → ${s.goal_contract_id.slice(0, 12)}`
          : `Session ${s.session_id.slice(0, 12)}`,
        state: s.state,
        updated_at: s.updated_at,
        resumable: !terminal,
        limitation: terminal
          ? "Session concluída (verificada) — inspeção apenas; não há retomada de execução"
          : blocked
            ? "Session bloqueada — retomar exige intervenção; estado pode estar incompleto"
            : "Retomada usa estado persistido; contexto de Agent REPLACED pode estar incompleto",
        work_id: s.work_id,
        goal_contract_id: s.goal_contract_id,
      });
    }
  } finally {
    db.close();
  }

  entries.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  const trimmed = entries.slice(0, limit);

  const lines: string[] = [
    "Histórico",
    `Workspace: ${workspace}`,
    trimmed.length === 0
      ? "(vazio — nenhuma Task/contrato ainda)"
      : `Entradas (${trimmed.length}):`,
  ];
  trimmed.forEach((e, i) => {
    const mark = e.resumable ? "→" : "·";
    lines.push(
      `  ${i + 1}. ${mark} [${e.kind}] ${e.title} · ${e.state}`,
    );
    lines.push(`     id=${e.id} · ${resumeHint(e)}`);
  });
  lines.push("");
  lines.push("Selecionar: evolve history show <id>");
  lines.push("Retomar:    evolve                  # TUI no mesmo Workspace");
  lines.push("            evolve resume");
  for (const l of limitations) {
    lines.push(`Limitação: ${l}`);
  }

  return {
    workspace,
    state_db_path,
    entries: trimmed,
    lines,
    limitations,
  };
}

/**
 * Human show: estado + evidências (ids) + paths + limitações.
 */
export function showHistoryEntry(
  workspaceRoot: string,
  id: string,
): HistoryShowDetail {
  const workspace = resolve(workspaceRoot);
  const view = buildTaskHistoryView(workspace, { limit: 50 });
  const entry = view.entries.find(
    (e) => e.id === id || e.id.startsWith(id) || id.startsWith(e.id),
  );
  if (!entry) {
    return {
      found: false,
      limitations: view.limitations,
      lines: [
        `Histórico: id '${id}' não encontrado neste Workspace.`,
        "Use: evolve history list",
        ...view.limitations.map((l) => `Limitação: ${l}`),
      ],
    };
  }

  const v3root = defaultWorkspaceV3DataDir(workspace);
  const evidence_path_hint = join(v3root, "evidence");
  const approvals_path_hint = join(v3root, "approvals");
  const limitations = [
    ...view.limitations,
    ...(entry.limitation ? [entry.limitation] : []),
    "Evidências listadas vêm do state.db deste Workspace; ficheiros em evidence/ podem estar incompletos.",
    "≠ continuity (handoff Agent) — use evolve continuity show para substituição.",
  ];

  let evidence_ids: string[] = [];
  if (entry.work_id && existsSync(view.state_db_path)) {
    const db = new StateDb(view.state_db_path);
    try {
      evidence_ids = db.listEvidence(entry.work_id).map((e) => e.evidence_id);
    } catch {
      evidence_ids = [];
    } finally {
      db.close();
    }
  }

  // V4.3 P0-2 — Delivery re-derivado de evidências (não inventar PASS).
  let deliveryLine = "Delivery: — (sem re-derivação)";
  try {
    const derived = deriveDeliveryFromWorkspace(workspace, {
      work_id: entry.work_id,
      kick_started: true,
    });
    deliveryLine = derived.from_evidence
      ? `Delivery: ${derived.status} (evidência ${derived.evidence_id})`
      : `Delivery: ${derived.status} (sem verification anexada → não PASS)`;
  } catch {
    deliveryLine = "Delivery: — (state.db indisponível)";
  }

  const lines: string[] = [
    `Histórico · ${entry.kind}`,
    `id: ${entry.id}`,
    `título: ${entry.title}`,
    `estado: ${entry.state}`,
    `atualizado: ${entry.updated_at}`,
    `retomável: ${entry.resumable ? "parcial/sim" : "não"}`,
    entry.work_id ? `work_id: ${entry.work_id}` : "work_id: —",
    entry.goal_contract_id
      ? `goal_contract_id: ${entry.goal_contract_id}`
      : "goal_contract_id: —",
    deliveryLine,
    "",
    "Evidências:",
    evidence_ids.length === 0
      ? "  (nenhuma no state.db para este work_id — LIMITATION se a Task ainda não gerou)"
      : `  ${evidence_ids.length} registo(s): ${evidence_ids.slice(0, 8).join(", ")}${evidence_ids.length > 8 ? "…" : ""}`,
    `  path (V3): ${evidence_path_hint}${existsSync(evidence_path_hint) ? "" : " (dir ausente)"}`,
    `Approvals: ${approvals_path_hint}${existsSync(approvals_path_hint) ? "" : " (dir ausente)"}`,
    "",
    entry.limitation ? `limitação: ${entry.limitation}` : "limitação: (nenhuma extra por entrada)",
    "Próximo: evolve (TUI) no mesmo Workspace, ou evolve resume",
    "Validar entrega: evolve delivery validate --command \"…\" --exit-code N",
  ];
  for (const l of limitations.slice(0, 4)) {
    lines.push(`Limitação: ${l}`);
  }

  return {
    found: true,
    entry,
    evidence_ids,
    evidence_count: evidence_ids.length,
    evidence_path_hint,
    approvals_path_hint,
    limitations,
    lines,
  };
}

/**
 * Handle `evolve history …`.
 */
export function handleHistorySurface(
  args: Record<string, string>,
  opts?: { printJson?: (obj: unknown) => void; argv?: string[] },
): { handled: boolean; exitCode?: number } {
  if (args.group !== "history") return { handled: false };

  const workspace = resolve(args.workspace ?? args.cwd ?? process.cwd());
  const print =
    opts?.printJson ??
    ((obj: unknown) => console.log(JSON.stringify(obj, null, 2)));
  const argv = opts?.argv ?? process.argv;
  const idx = argv.findIndex((a) => a === "history");
  const positionals: string[] = [];
  if (idx >= 0) {
    for (let i = idx + 1; i < argv.length; i++) {
      const t = argv[i]!;
      if (t.startsWith("--")) {
        if (argv[i + 1] && !argv[i + 1]!.startsWith("--")) i++;
        continue;
      }
      positionals.push(t);
    }
  }
  const cmd = (positionals[0] ?? args.command ?? "list").toLowerCase();

  if (cmd === "help") {
    console.log(
      [
        "evolve history — Tasks/contratos recentes deste Workspace (V4.2)",
        "",
        "  evolve history list             # lista curta",
        "  evolve history show <id>        # estado + evidências + limitações",
        "  evolve history                  # alias de list",
        "",
        "≠ continuity (handoff Agent). Retomada pode ser parcial.",
        "Isolamento: state.db por Workspace path.",
        "Flags: --workspace <path>  --format json",
      ].join("\n"),
    );
    return { handled: true, exitCode: 0 };
  }

  if (cmd === "show") {
    const id = positionals[1] ?? args.id ?? args["entry-id"];
    if (!id) {
      console.error("Uso: evolve history show <id>");
      return { handled: true, exitCode: 1 };
    }
    const shown = showHistoryEntry(workspace, id);
    if (args.format === "json") print(shown);
    else console.log(shown.lines.join("\n"));
    return { handled: true, exitCode: shown.found ? 0 : 1 };
  }

  // list (default)
  const view = buildTaskHistoryView(workspace, {
    limit: args.limit ? Number(args.limit) : undefined,
  });
  if (args.format === "json") print(view);
  else console.log(view.lines.join("\n"));
  return { handled: true, exitCode: 0 };
}
