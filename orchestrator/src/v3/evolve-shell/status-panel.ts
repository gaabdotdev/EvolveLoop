/**
 * Minimal status panel for evolve conversational shell (V0-CLI-02).
 * MSO state must be an official state (never unofficial "IDLE").
 */

import { isMsoState } from "../mso/states.js";
import type { WorkspaceSessionSnapshot } from "./workspace-session.js";

export interface StatusPanelModel {
  mso_state: string;
  metas: string;
  /** Product Task label (objective / contract) — never bare work_id as "Tarefa". */
  active_task: string;
  /** Internal work id when present (verbose / L5). */
  work_id?: string;
  session_id?: string;
  model_provider: string;
  warnings: string[];
}

/** Map unofficial labels to INIT; prefer live StateDb session state. */
export function resolvePanelMsoState(
  session: WorkspaceSessionSnapshot,
  override?: string,
): string {
  const raw = override ?? session.latest_mso_session?.state ?? "INIT";
  if (!raw || raw === "IDLE") return "INIT";
  if (isMsoState(raw)) return raw;
  return "INIT";
}

export function buildStatusPanel(
  session: WorkspaceSessionSnapshot,
  extras?: Partial<StatusPanelModel>,
): StatusPanelModel {
  const warnings: string[] = [];
  if (!session.initialized) warnings.push("workspace_não_inicializado");
  if (session.latest_contract && !session.latest_contract.mso_confirmed) {
    warnings.push("mso_não_confirmado");
  }
  if (session.latest_document && !session.latest_document.validated) {
    warnings.push("goal_document_não_validado");
  }

  const contract = session.latest_contract;
  const taskLabel =
    extras?.active_task ??
    (contract
      ? `${contract.objective.slice(0, 48)}${contract.objective.length > 48 ? "…" : ""}`
      : "—");
  const workId =
    extras?.work_id ?? session.latest_mso_session?.work_id ?? contract?.work_id;
  const sessionId =
    extras?.session_id ?? session.latest_mso_session?.session_id;

  return {
    mso_state: resolvePanelMsoState(session, extras?.mso_state),
    metas: extras?.metas ?? (contract?.objective.slice(0, 60) || "—"),
    active_task: taskLabel,
    work_id: workId,
    session_id: sessionId,
    model_provider: extras?.model_provider ?? "local/determinístico (0 tokens)",
    warnings: extras?.warnings ?? warnings,
  };
}

export function renderStatusPanelPt(panel: StatusPanelModel): string {
  const warn = panel.warnings.length ? panel.warnings.join("; ") : "nenhum";
  const lines = [
    "┌─ EvolveLoop ─────────────────────────────────────────",
    `│ Session: ${panel.mso_state}${panel.session_id ? ` (${panel.session_id})` : ""}`,
    `│ Task: ${panel.active_task}`,
  ];
  if (panel.work_id) {
    lines.push(`│ Work (interno): ${panel.work_id}`);
  }
  lines.push(
    `│ Modelo/Provider: ${panel.model_provider}`,
    `│ Avisos: ${warn}`,
    "└──────────────────────────────────────────────────────",
  );
  return lines.join("\n");
}
