/**
 * Adaptive Grill-Me: detailed intents skip sequential Qs → single review card;
 * vague intents get 2–3 real questions (no hardcoded EvolveLoop internal jargon).
 */

export type GrillMeInterviewMode = "detailed_review" | "vague_questions";

export interface IntentDetailAssessment {
  mode: GrillMeInterviewMode;
  reasons: string[];
  /** Suggested max questions when mode === vague_questions (2–3). */
  max_questions: number;
}

const ACCEPTANCE_RE =
  /\b(crit[eé]rio|aceit[ae]|acceptance|done when|definition of done|verific[aá]vel|teste[s]?\s+verde|build\s+e\s+test)/i;
const SCOPE_RE =
  /\b(escopo|scope\s*(in|out)?|fora de escopo|out[- ]of[- ]scope|n[aã]o\s+inclui|inclui(?:r)?|restri[cç][aã]o|constraint)/i;
const MULTI_REQ_RE =
  /(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+\S+|(?:\b(?:e também|também|além disso|requirements?|requisitos?)\b)/i;

/**
 * Heuristic: detailed if the user already supplied multi-requirement /
 * acceptance / explicit scope — enough to draft a Goal Contract for review.
 */
export function assessIntentDetail(intent: string): IntentDetailAssessment {
  const text = intent.trim();
  const reasons: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (text.length >= 160) reasons.push("long_intent");
  if (lines.length >= 4) reasons.push("multi_line");
  if (ACCEPTANCE_RE.test(text)) reasons.push("acceptance_criteria");
  if (SCOPE_RE.test(text)) reasons.push("explicit_scope");
  if (MULTI_REQ_RE.test(text)) reasons.push("multi_requirement");
  // Multiple sentence-like clauses with "e" / ";" often means structured ask.
  const clauseHits = (text.match(/[;.]\s+\S+/g) ?? []).length;
  if (clauseHits >= 2 && text.length >= 100) reasons.push("multi_clause");

  const signals = reasons.length;
  if (signals >= 2 || (signals >= 1 && text.length >= 120 && lines.length >= 3)) {
    return { mode: "detailed_review", reasons, max_questions: 0 };
  }
  return {
    mode: "vague_questions",
    reasons: reasons.length ? reasons : ["short_or_underspecified"],
    max_questions: text.length < 40 ? 2 : 3,
  };
}

export function isDetailedIntent(intent: string): boolean {
  return assessIntentDetail(intent).mode === "detailed_review";
}

/** Strip leftover internal EvolveLoop jargon from defaults/answers. */
export function scrubInternalJargon(text: string): string {
  return text
    .replace(/\bBloco\s*3\b/gi, "")
    .replace(/\badapters?\s+E2E\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*;\s*;/g, ";")
    .trim();
}
