/**
 * Goal Contract display helpers — short objective + scope without prompt echo.
 */

export interface GoalDisplayFields {
  objective_title: string;
  scope_items: string[];
  criteria: string;
  risks: string;
  version: string;
}

const MAX_TITLE = 72;

/** First sentence / line, truncated — never the full multi-paragraph prompt. */
export function shortObjectiveTitle(objective: string): string {
  const raw = objective.trim().replace(/\s+/g, " ");
  if (!raw) return "—";
  const sentence = raw.split(/(?<=[.!?])\s+/)[0] ?? raw;
  const line = sentence.split("\n")[0] ?? sentence;
  if (line.length <= MAX_TITLE) return line;
  return `${line.slice(0, MAX_TITLE - 1)}…`;
}

/**
 * Scope bullets excluding verbatim copies of the objective (echo fix).
 * Falls back to a single dash when nothing distinct remains.
 */
export function distinctScopeItems(objective: string, scope: string[]): string[] {
  const objNorm = objective.trim().toLowerCase();
  const titleNorm = shortObjectiveTitle(objective).toLowerCase();
  const items = scope
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      const n = s.toLowerCase();
      return n !== objNorm && n !== titleNorm;
    });
  return items.length > 0 ? items : [];
}

export function buildGoalDisplay(input: {
  objective: string;
  scope: string[];
  criteria: string;
  risks?: string;
  version?: string;
}): GoalDisplayFields {
  return {
    objective_title: shortObjectiveTitle(input.objective),
    scope_items: distinctScopeItems(input.objective, input.scope),
    criteria: input.criteria.trim() || "—",
    risks: (input.risks ?? "—").trim() || "—",
    version: input.version ?? "v1",
  };
}

/** Plain-text card lines for Static / classic consumers (no raw markdown). */
export function formatGoalDisplayLines(fields: GoalDisplayFields): string[] {
  const scope =
    fields.scope_items.length > 0
      ? fields.scope_items.map((s) => `· ${s}`).join(" ")
      : "—";
  return [
    `Objetivo: ${fields.objective_title}`,
    `Escopo: ${scope}`,
    `Critérios: ${fields.criteria}`,
    `Riscos: ${fields.risks}`,
    `Versão: ${fields.version}`,
  ];
}
