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

function normalizeScopeCandidate(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^entregar:\s*/i, "")
    .replace(/^escopo:\s*/i, "")
    .replace(/\s+/g, " ");
}

function isEchoOfObjective(candidate: string, objNorm: string, titleNorm: string): boolean {
  const n = normalizeScopeCandidate(candidate);
  if (!n) return true;
  if (n === objNorm || n === titleNorm) return true;
  // Near-copy: scope embeds the full objective / title (or vice-versa at high overlap).
  if (objNorm.length >= 24 && (n.includes(objNorm) || objNorm.includes(n))) {
    const shorter = Math.min(n.length, objNorm.length);
    const longer = Math.max(n.length, objNorm.length);
    if (shorter / longer >= 0.85) return true;
  }
  if (titleNorm.length >= 16 && (n === titleNorm || n.includes(titleNorm) && n.length <= titleNorm.length + 12)) {
    return true;
  }
  return false;
}

/**
 * Scope bullets excluding verbatim / near copies of the objective (echo fix).
 * Falls back to empty (display as —) when nothing distinct remains.
 */
export function distinctScopeItems(objective: string, scope: string[]): string[] {
  const objNorm = normalizeScopeCandidate(objective);
  const titleNorm = normalizeScopeCandidate(shortObjectiveTitle(objective));
  const items = scope
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !isEchoOfObjective(s, objNorm, titleNorm));
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
