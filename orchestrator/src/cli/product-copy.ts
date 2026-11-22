/**
 * V4.3 P1 — Product copy map (UI L0–L3).
 * Runtime IDs / store fields (mso_*, goal_contract_*, tokens_workers) stay unchanged.
 * Literals MSO / TRUE-FULL-PASS belong in L5 / verbose / JSON only.
 */

/** UI label for the orchestration engine (glossary: Orchestrator). */
export const UI_ORCHESTRATOR = "Orchestrator";

/** UI label for MSO session axis. */
export const UI_SESSION = "Session";

/** UI label for Goal Contract review surface. */
export const UI_PLAN = "Plan";

/** UI label for worker/agent token aggregate. */
export const UI_AGENTS = "Agents";

/** Product status default axis (journey). */
export const UI_TASK = "Task";

/**
 * Documented 1:1 map — product UI ↔ runtime (P1-3 / E4).
 * Keep in sync with docs/v4/V4.3/identity-copy-map.md
 */
export const PRODUCT_RUNTIME_MAP = {
  Orchestrator: "MSO (runtime lease / state machine)",
  Session: "mso_sessions.state (incl. TRUE-FULL-PASS terminal)",
  Plan: "Goal Contract (goal_contract_id; IDs intact)",
  Task: "work / journey unit (facade over contract+session)",
  Agents: "workers / tokens_workers / agent registry",
  Delivery: "delivery-status + verification evidence (≠ MSO alone)",
  "Session concluída (verificada)": "TRUE-FULL-PASS",
  "Session: validando": "VALIDATING",
} as const;

const SESSION_PHASE_PT: Record<string, string> = {
  INIT: "início",
  LOADING_GOALS: "carregando",
  ANALYZING: "analisando",
  DECOMPOSING: "decompondo",
  DELEGATING: "delegando",
  WAITING_AGENTS: "aguardando agents",
  VALIDATING: "validando",
  BLOCKED: "bloqueada",
  RECOVERING: "recuperando",
  "TRUE-FULL-PASS": "concluída (verificada)",
};

/** Product line for Session phase (no MSO / TRUE-FULL-PASS literals). */
export function formatSessionPhaseUi(raw?: string | null): string {
  if (!raw) return `${UI_SESSION}: —`;
  const pt = SESSION_PHASE_PT[raw];
  if (pt) return `${UI_SESSION}: ${pt}`;
  return `${UI_SESSION}: ${raw}`;
}

/** Transition progress line for shell kickoff (L3 — no "MSO →"). */
export function formatSessionTransitionUi(rawState: string): string {
  const pt = SESSION_PHASE_PT[rawState];
  return pt
    ? `${UI_SESSION} → ${pt}`
    : `${UI_SESSION} → ${rawState}`;
}

/** Token HUD fragment: Orchestrator spend. */
export function formatOrchestratorTokLabel(body: string): string {
  return `tok ${UI_ORCHESTRATOR} ${body}`;
}

/** Combined tokens line used by slash/delivery. */
export function formatTokensProductLine(mso: string, agents: string): string {
  return `Tokens: ${UI_ORCHESTRATOR} ${mso} · ${UI_AGENTS} ${agents}`;
}
