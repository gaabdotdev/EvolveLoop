/**
 * Allowlist of ids that provenance answers may return.
 * Anything else (free text, skill names, chat memory) is dropped.
 */

import { isValidId } from "../contracts/index.js";

/** M10-local grant/approval ids as they appear in ledger payloads (freeze R8 — not catalog kinds). */
const LOCAL_GRANT = /^grn[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/;
const LOCAL_APPROVAL = /^apr[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/;

export function isVerifiableRef(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.includes("\0") || value.includes("/") || value.includes("\\") || value.includes("..") || value.includes("%")) {
    return false;
  }
  if (isValidId("event", value)) return true;
  if (isValidId("artifact", value)) return true;
  if (isValidId("evidence", value)) return true;
  if (isValidId("policy_decision", value)) return true;
  if (isValidId("policy", value)) return true;
  if (isValidId("proof", value)) return true;
  if (isValidId("executor", value)) return true;
  if (isValidId("execution", value)) return true;
  if (LOCAL_GRANT.test(value) || LOCAL_APPROVAL.test(value)) return true;
  return false;
}

/** Stable unique list. Never inserts a non-allowlisted string. */
export function collectRefs(values: readonly unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!isVerifiableRef(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  out.sort();
  return out;
}

export function emptyAnswer(
  closed: import("./types.js").FailClosedReason,
): import("./types.js").ProvenanceAnswer {
  return { refs: [], closed };
}

export function okAnswer(values: readonly unknown[]): import("./types.js").ProvenanceAnswer {
  const refs = collectRefs(values);
  if (refs.length === 0) return { refs: [], closed: "missing_ref" };
  return { refs, closed: null };
}
