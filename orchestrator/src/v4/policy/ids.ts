/**
 * M10-local identifiers. Catalog grammar (ADR-V4-0015) has no grant/approval
 * prefixes (freeze R5/R8). These ids are opaque Map keys, never filesystem
 * path components.
 */

import { randomBytes } from "node:crypto";
import { ID_PREFIX, isValidId } from "../contracts/index.js";

/** Hex body long enough for ID_SUFFIX (6–128). */
function hexBody(bytes = 8): string {
  return randomBytes(bytes).toString("hex");
}

export function newPolicyDecisionId(): string {
  const id = `${ID_PREFIX.policy_decision}${hexBody(8)}`;
  if (!isValidId("policy_decision", id)) {
    throw new Error("POLICY_DECISION_ID_GENERATION_FAILED");
  }
  return id;
}

/**
 * Local grant id. Prefix `grn` is *not* a catalog kind (R8) and contains no
 * `.` `/` `..` `%` so it cannot be a path-traversal component (R5).
 */
export function newGrantId(): string {
  return `grn${hexBody(12)}`;
}

/** Local approval id. Same constraints as {@link newGrantId}. */
export function newApprovalId(): string {
  return `apr${hexBody(12)}`;
}

export function isLocalGrantId(value: string): boolean {
  return /^grn[0-9a-f]{24}$/.test(value);
}

export function isLocalApprovalId(value: string): boolean {
  return /^apr[0-9a-f]{24}$/.test(value);
}
