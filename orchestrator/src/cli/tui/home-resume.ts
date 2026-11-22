/**
 * Home de retomada — view-model puro (V4.1 P0-1).
 * Workspace + Tasks curtas + CTA; sem métricas.
 */

import type { WorkspaceSessionSnapshot } from "../../v3/evolve-shell/workspace-session.js";
import { shortObjectiveTitle } from "./goal-display.js";

export type HomeTaskKind = "needs_intervention" | "in_progress" | "ready";

export interface HomeTaskSummary {
  id: string;
  title: string;
  kind: HomeTaskKind;
  detail: string;
}

export interface HomeResumeView {
  workspace_display: string;
  initialized: boolean;
  tasks: HomeTaskSummary[];
  cta_primary: string;
  cta_secondary: string;
  lines: string[];
}

const MAX_TASKS = 5;

function shortenPath(abs: string, home?: string): string {
  const h = home ?? process.env.HOME ?? "";
  if (h && (abs === h || abs.startsWith(h + "/"))) {
    return "~" + abs.slice(h.length);
  }
  return abs;
}

/**
 * Build a short resume list from the workspace session snapshot.
 * Prefers Goal Contract + MSO session as Task facade (ADR Q2).
 */
export function buildHomeResumeView(
  session: WorkspaceSessionSnapshot,
  opts?: { home?: string; max_tasks?: number },
): HomeResumeView {
  const max = opts?.max_tasks ?? MAX_TASKS;
  const workspace_display = shortenPath(session.workspace, opts?.home);
  const tasks: HomeTaskSummary[] = [];

  const mso = session.latest_mso_session;
  const contract = session.latest_contract;

  if (mso && mso.state === "BLOCKED") {
    tasks.push({
      id: mso.session_id,
      title: contract
        ? shortObjectiveTitle(contract.objective)
        : `Session ${mso.session_id.slice(0, 12)}`,
      kind: "needs_intervention",
      detail: `Session bloqueada · ${mso.state}`,
    });
  } else if (
    mso &&
    mso.state !== "INIT" &&
    mso.state !== "TRUE-FULL-PASS"
  ) {
    tasks.push({
      id: mso.session_id,
      title: contract
        ? shortObjectiveTitle(contract.objective)
        : `Session ${mso.session_id.slice(0, 12)}`,
      kind: "in_progress",
      detail: `Session: ${mso.state}`,
    });
  }

  if (
    contract &&
    !tasks.some((t) => t.id === contract.goal_contract_id)
  ) {
    const needsConfirm = !contract.mso_confirmed;
    tasks.push({
      id: contract.goal_contract_id,
      title: shortObjectiveTitle(contract.objective),
      kind: needsConfirm ? "needs_intervention" : "ready",
      detail: needsConfirm
        ? "Plan aguarda confirmação"
        : `Task · contrato v${contract.version}`,
    });
  }

  const trimmed = tasks.slice(0, max);
  const hasIntervention = trimmed.some((t) => t.kind === "needs_intervention");
  const hasInProgress = trimmed.some((t) => t.kind === "in_progress");

  let cta_primary = "Descreva uma Task para iniciar";
  if (hasIntervention) cta_primary = "Retomar Task que exige intervenção";
  else if (hasInProgress) cta_primary = "Acompanhar Task em andamento";

  const cta_secondary = "Ou descreva uma nova Task abaixo";

  const lines: string[] = [
    `Workspace: ${workspace_display}`,
    "(cwd / estado .evolveloop/ — ≠ evolve workspace = integration/worktree)",
    session.initialized
      ? "Estado: retomável"
      : "Estado: Aguardando entrada — execute evolve setup se ainda não inicializou",
  ];
  if (trimmed.length === 0) {
    lines.push("Tasks: nenhuma em andamento");
    lines.push("Histórico: /history  ·  evolve history list");
  } else {
    lines.push("Tasks:");
    for (const t of trimmed) {
      const mark =
        t.kind === "needs_intervention"
          ? "!"
          : t.kind === "in_progress"
            ? "→"
            : "·";
      lines.push(`  ${mark} ${t.title} — ${t.detail}`);
    }
    lines.push("Histórico: /history  ·  evolve history list");
  }
  lines.push(cta_primary);
  if (trimmed.length > 0) lines.push(cta_secondary);

  return {
    workspace_display,
    initialized: session.initialized,
    tasks: trimmed,
    cta_primary,
    cta_secondary,
    lines,
  };
}
