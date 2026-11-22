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

/**
 * How many real interview questions the UX may ask (0 = single review card).
 * Distinct from internal default materialization used to draft the contract.
 */
export function grillInterviewBudget(intent: string): number {
  const a = assessIntentDetail(intent);
  return a.mode === "detailed_review" ? 0 : Math.min(3, Math.max(2, a.max_questions));
}

/**
 * Pull distinct IN-scope hints from a structured intent (bullets / "Escopo:").
 * Never returns a verbatim copy of the full objective (anti-echo).
 */
export function deriveScopeFromIntent(intent: string): string[] {
  const text = intent.trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const title = (lines[0] ?? text).replace(/\s+/g, " ");
  const titleNorm = title.toLowerCase();
  const fullNorm = text.replace(/\s+/g, " ").toLowerCase();
  const items: string[] = [];

  for (const line of lines) {
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (bullet?.[1]) {
      items.push(bullet[1].trim());
      continue;
    }
    const escopo = line.match(/^escopo\s*:\s*(.+)$/i);
    if (escopo?.[1]) {
      items.push(escopo[1].trim());
      continue;
    }
  }

  return items.filter((s) => {
    const n = s.replace(/\s+/g, " ").toLowerCase();
    if (!n) return false;
    if (n === titleNorm || n === fullNorm) return false;
    if (n.startsWith("entregar:") && n.slice("entregar:".length).trim() === fullNorm) {
      return false;
    }
    return true;
  });
}

/**
 * Patterns that must never appear in user-facing Grill interview / review copy.
 * Skill names, MSO states, and internal roadmap labels are internal-only.
 */
/** Skill names / machine states / roadmap labels — not user vocabulary. */
export const INTERNAL_JARGON_RE =
  /\b(?:Grill[- ]?Me|MSO|Bloco\s*[0-9]+|adapters?\s+E2E|V0-ORCH|TaskGraph|SilentScan|StateDb)\b/i;

export function containsLeakedInternalJargon(text: string): boolean {
  return INTERNAL_JARGON_RE.test(text);
}

/** Strip leftover internal EvolveLoop jargon from defaults/answers. */
export function scrubInternalJargon(text: string): string {
  return text
    .replace(/\bBloco\s*[0-9]+\b/gi, "")
    .replace(/\badapters?\s+E2E\b/gi, "")
    .replace(/\bGrill[- ]?Me\b/gi, "")
    .replace(/\bMSO\b/g, "")
    .replace(/\bV0-ORCH\b/gi, "")
    .replace(/\bTaskGraph\b/gi, "")
    .replace(/\bSilentScan\b/gi, "")
    .replace(/\bStateDb\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*;\s*;/g, ";")
    .trim();
}
