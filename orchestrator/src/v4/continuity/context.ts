/**
 * Allowlist-parse + executor-context builder.
 *
 * ADR-V4-0001 "ignore unknown optional fields" is readability, not forwarding.
 * Unknown keys are dropped here and MUST NOT reach executor / Policy / Work State.
 */

import {
  allowlistParseExecutionCapsule,
  canonicalJson,
  FORBIDDEN_CAPSULE_AUTHORITY_FIELDS,
  isRecord,
  type ExecutionCapsule,
} from "../contracts/index.js";
import { CONTINUITY_ERROR, ContinuityError } from "./errors.js";
import { MAX_CAPSULE_BYTES } from "./types.js";

const FORBIDDEN = new Set<string>(FORBIDDEN_CAPSULE_AUTHORITY_FIELDS);

export function capsuleBytes(value: unknown): number {
  return Buffer.byteLength(canonicalJson(value), "utf8");
}

export function assertCapsuleSize(value: unknown): void {
  const n = capsuleBytes(value);
  if (n > MAX_CAPSULE_BYTES) {
    throw new ContinuityError(CONTINUITY_ERROR.ACCEPT_FAILED, "capsule exceeds size limit (D09)", {
      bytes: n,
      max: MAX_CAPSULE_BYTES,
    });
  }
}

/**
 * Fail-closed if grant-shaped material slipped into delegable_grants after parse.
 * Capsule carries references, never permission sets / tokens (INV-CAP-07).
 */
export function assertRefsNotMaterial(parsed: Record<string, unknown>): void {
  const grants = parsed.delegable_grants;
  if (!Array.isArray(grants)) return;
  for (const g of grants) {
    if (!isRecord(g)) {
      throw new ContinuityError(CONTINUITY_ERROR.GRANT_MATERIAL, "delegable_grants entry is not a ref object");
    }
    const keys = Object.keys(g);
    for (const k of keys) {
      if (k !== "grant_ref" && k !== "scope" && k !== "expires_at") {
        throw new ContinuityError(CONTINUITY_ERROR.GRANT_MATERIAL, `delegable_grants forwarded non-ref field "${k}"`);
      }
      if (FORBIDDEN.has(k)) {
        throw new ContinuityError(CONTINUITY_ERROR.GRANT_MATERIAL, `delegable_grants contains forbidden field "${k}"`);
      }
    }
    if (typeof g.grant_ref !== "string") {
      throw new ContinuityError(CONTINUITY_ERROR.GRANT_MATERIAL, "grant_ref must be a string reference");
    }
    if (!Array.isArray(g.scope) || g.scope.some((s) => typeof s !== "string")) {
      throw new ContinuityError(CONTINUITY_ERROR.GRANT_MATERIAL, "grant scope must be string refs, not material");
    }
  }
}

export function parseKnownFields(raw: unknown): Record<string, unknown> {
  const parsed = allowlistParseExecutionCapsule(raw);
  if (!parsed) {
    throw new ContinuityError(CONTINUITY_ERROR.ACCEPT_FAILED, "allowlist-parse produced nothing");
  }
  assertRefsNotMaterial(parsed);
  return parsed;
}

/** Deep clone of allowlisted fields — the only object that may leave toward an executor. */
export function executorContextFromParsed(parsed: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
}

export function asCapsule(parsed: Record<string, unknown>): ExecutionCapsule {
  return parsed as unknown as ExecutionCapsule;
}
