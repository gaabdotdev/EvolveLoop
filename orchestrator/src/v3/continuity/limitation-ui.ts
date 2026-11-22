/**
 * V4.2 P1-4 — Continuity UI: 3 linhas explícitas após REPLACED / handoff.
 * Não inventa recuperação — só o que o HandoffPackage / Agent record garantem.
 */

import type { AgentRecord } from "../agent-registry/types.js";
import type { HandoffPackage } from "./types.js";

export interface ContinuityLimitationView {
  kind: "replaced" | "handoff";
  preserved: string;
  lost: string;
  next_step: string;
  lines: string[];
}

/**
 * Three human lines: what survived / what did not / what to do next.
 */
export function formatContinuityLimitation(
  input:
    | { kind: "replaced"; agent: AgentRecord; handoff?: HandoffPackage }
    | { kind: "handoff"; handoff: HandoffPackage },
): ContinuityLimitationView {
  if (input.kind === "handoff") {
    const h = input.handoff;
    const evidence =
      h.verified_progress.evidence_ids.length > 0
        ? `evidências ${h.verified_progress.evidence_ids.length}`
        : "sem evidências listadas";
    const preserved = `Preservado: task ${h.task_id} no estado verificado ${h.verified_task_state}; contrato ${h.goal_contract_id}; ${evidence}; decisões/handoff package.`;
    const lost =
      "Perdido: transcript privado do modelo, contexto efémero da sessão do Agent anterior, ProcessSession do substituído (se existia).";
    const next =
      h.status === "applied" && h.to_agent_id
        ? `Próximo: continuar com Agent ${h.to_agent_id} — ${h.verified_progress.next_action}`
        : h.status === "paused_no_substitute"
          ? `Próximo: sem substituto — ${h.pause_reason ?? "pausado"}; criar/escolher Agent e evolve continuity apply`
          : `Próximo: ${h.verified_progress.next_action}`;
    return {
      kind: "handoff",
      preserved,
      lost,
      next_step: next,
      lines: [preserved, lost, next],
    };
  }

  const a = input.agent;
  const h = input.handoff;
  const preserved = h
    ? `Preservado: task ${h.task_id} estado ${h.verified_task_state}; evidências/contrato no handoff; Agent substituto ${h.to_agent_id ?? a.replaced_by ?? "(pendente)"}.`
    : `Preservado: registo Agent histórico (${a.agent_id}); task_id=${a.task_id ?? "—"}; replaced_by=${a.replaced_by ?? "—"}; estado Task/contrato no Workspace (não o transcript).`;
  const lost =
    "Perdido: transcript privado, contexto em memória do Agent REPLACED, sessão de terminal associada ao Handle antigo.";
  const next = h?.verified_progress.next_action
    ? `Próximo: ${h.verified_progress.next_action}`
    : a.replaced_by
      ? `Próximo: inspecionar substituto ${a.replaced_by} (evolve agents inspect ${a.replaced_by}) e continuar a Task no mesmo Workspace`
      : "Próximo: evolve continuity show --handoff-id … ou /agents no mesmo Workspace — retomada pode ser parcial";

  return {
    kind: "replaced",
    preserved,
    lost,
    next_step: next,
    lines: [preserved, lost, next],
  };
}
