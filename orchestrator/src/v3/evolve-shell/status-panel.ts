/**
 * Minimal status panel for evolve conversational shell (V0-CLI-02).
 * MSO state must be an official state (never unofficial "IDLE").
 */

import { isMsoState } from "../mso/states.js";
import type { WorkspaceSessionSnapshot } from "./workspace-session.js";

export interface StatusPanelModel {
  mso_state: string;
  metas: string;
  active_task: string;
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

  return {
    mso_state: resolvePanelMsoState(session, extras?.mso_state),
    metas: extras?.metas ?? (session.latest_contract?.objective.slice(0, 60) || "—"),
    active_task: extras?.active_task ?? session.latest_mso_session?.work_id ?? "—",
    model_provider: extras?.model_provider ?? "local/determinístico (0 tokens)",
    warnings: extras?.warnings ?? warnings,
  };
}

export function renderStatusPanelPt(panel: StatusPanelModel): string {
  const warn = panel.warnings.length ? panel.warnings.join("; ") : "nenhum";
  return [
    "┌─ EvolveLoop ─────────────────────────────────────────",
    `│ MSO: ${panel.mso_state}`,
    `│ Meta: ${panel.metas}`,
    `│ Tarefa: ${panel.active_task}`,
    `│ Modelo/Provider: ${panel.model_provider}`,
    `│ Avisos: ${warn}`,
    "└──────────────────────────────────────────────────────",
  ].join("\n");
}
