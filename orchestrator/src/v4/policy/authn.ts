/**
 * Operator authentication for L2 approvals (ADR-V4-0016, TM-V4-F02).
 * Tokens are stored hashed. Caller-supplied `actor` strings are not a credential.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AuthenticatedPrincipal } from "./types.js";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export interface OperatorAuthnPort {
  verify(token: string): AuthenticatedPrincipal | undefined;
}

export class InMemoryOperatorAuthn implements OperatorAuthnPort {
  private readonly tokens = new Map<string, { principal_id: string; hash: string }>();

  /** Register a human operator. `id` must not be an executor id. */
  issue(principal_id: string): { token: string; principal: AuthenticatedPrincipal } {
    if (principal_id.startsWith("executor_")) {
      throw new Error("OPERATOR_MUST_NOT_BE_EXECUTOR");
    }
    const token = randomBytes(24).toString("hex");
    const hash = sha256Hex(token);
    this.tokens.set(hash, { principal_id, hash });
    return {
      token,
      principal: {
        kind: "HUMAN",
        id: principal_id,
        authn: { method: "operator-token", credential_ref: hash.slice(0, 16) },
      },
    };
  }

  verify(token: string): AuthenticatedPrincipal | undefined {
    if (typeof token !== "string" || token.length < 16) return undefined;
    const hash = sha256Hex(token);
    const rec = this.tokens.get(hash);
    if (!rec || !hashesEqual(rec.hash, hash)) return undefined;
    return {
      kind: "HUMAN",
      id: rec.principal_id,
      authn: { method: "operator-token", credential_ref: rec.hash.slice(0, 16) },
    };
  }
}

export const POLICY_ENGINE_PRINCIPAL: AuthenticatedPrincipal = {
  kind: "POLICY_ENGINE",
  id: "policy-engine-v4",
  authn: { method: "policy-engine", credential_ref: "pdp" },
};

/** F02: extra fields that must never become the approver identity. */
export const CALLER_ASSERTED_IDENTITY_KEYS = ["actor", "decided_by", "approver", "approver_id"] as const;

export function requestAssertsCallerIdentity(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const rec = raw as Record<string, unknown>;
  return CALLER_ASSERTED_IDENTITY_KEYS.some((k) => k in rec && rec[k] !== undefined);
}
