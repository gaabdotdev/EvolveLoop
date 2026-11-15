/**
 * Intent ingestion (constitution §4.2, §7.1; TM-V4-D01).
 *
 * Untrusted repo/issue/web/wiki/tool content is marked at the boundary.
 * Marks are DATA about provenance, never CONTROL and never a trust self-label
 * (ADR-V4-0017). Only USER_DIRECT text may become Goal Contract CONTROL fields.
 */

import type { ActorRef, AutonomyLevel, ConstraintKind, IsoTimestamp, VerificationMethodKind } from "../contracts/index.js";

export type IntentSourceKind =
  | "USER_DIRECT"
  | "REPO_FILE"
  | "ISSUE_OR_PR"
  | "WEB_PAGE"
  | "WIKI_PAGE"
  | "TOOL_OUTPUT"
  | "UNKNOWN";

export const UNTRUSTED_INTENT_SOURCES: readonly IntentSourceKind[] = [
  "REPO_FILE",
  "ISSUE_OR_PR",
  "WEB_PAGE",
  "WIKI_PAGE",
  "TOOL_OUTPUT",
  "UNKNOWN",
];

export type IntakeFieldClass = "CONTROL" | "UNTRUSTED_DATA";

export interface MarkedText {
  text: string;
  source: IntentSourceKind;
  field_class: IntakeFieldClass;
}

export function fieldClassForSource(source: IntentSourceKind): IntakeFieldClass {
  return source === "USER_DIRECT" ? "CONTROL" : "UNTRUSTED_DATA";
}

export function markText(text: string, source: IntentSourceKind): MarkedText {
  return { text, source, field_class: fieldClassForSource(source) };
}

export interface IntentConstraintDraft {
  kind: ConstraintKind;
  statement: MarkedText;
  value?: string | number | boolean;
}

export interface IntentCriterionDraft {
  statement: MarkedText;
  mandatory?: boolean;
  verification_methods?: VerificationMethodKind[];
  evidence_required?: string[];
}

/**
 * User (or system) intent before compilation. Conversation text is not stored;
 * only this structured ingest is retained on the Goal Contract / Work events.
 */
export interface IntentIngest {
  objective: MarkedText;
  context?: MarkedText[];
  scope?: MarkedText[];
  out_of_scope?: MarkedText[];
  constraints?: IntentConstraintDraft[];
  acceptance_criteria?: IntentCriterionDraft[];
  budget?: { currency: string; max_amount: number };
  deadline?: IsoTimestamp;
  autonomy?: AutonomyLevel;
  verification?: "INDEPENDENT" | "AUTOMATED_ONLY" | "HUMAN_REQUIRED";
  recovery_enabled?: boolean;
  stop_conditions?: string[];
  risks?: string[];
  dependencies?: string[];
  actor: ActorRef;
}

export function isUntrusted(text: MarkedText): boolean {
  return text.field_class === "UNTRUSTED_DATA";
}
