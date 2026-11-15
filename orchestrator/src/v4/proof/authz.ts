/**
 * WorkProof authorization / origin caps (Wave 5 Trust, D13 / RR-W5-02 / RR-W5-05).
 *
 * Frozen `deriveFinalStatus` only caps open effect *states*. This module adds the
 * authorization-ref check: EXTERNAL side effects cannot make a proof PROVEN without
 * verifiable refs from `authorizationFor` and/or ledger `policy.decided`.
 *
 * Fail closed. Never invent grant / decision ids. Empty refs = not authorized.
 * Does not thaw `PolicyDecision` (no `decided_by`) and does not close F02/RR-W5-02.
 */

import {
  isValidId,
  type EffectRecord,
  type EffectState,
  type EventLedgerPort,
  type ProofStatus,
  type ProvenanceQueryPort,
  type RequirementProof,
  type WorkEvent,
} from "../contracts/index.js";

/** States that INV-EFF-02 treats as requiring an authorization *claim* on the record. */
const AUTHORIZED_OR_BEYOND: readonly EffectState[] = [
  "AUTHORIZED",
  "DISPATCHED",
  "COMMITTED",
  "REJECTED",
  "UNKNOWN",
  "PARTIAL",
  "ESCALATED",
  "COMPENSATED",
  "NOT_EXECUTED",
];

const CHAT_MEMORY = /^(chat:|memory:)/i;
const LOCAL_GRANT = /^grn[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/;
const LOCAL_APPROVAL = /^apr[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/;

export const UNAUTHORIZED_EXTERNAL_GAP_PREFIX = "unauthorized_external_effect:";
export const EMPTY_AUTHORIZATION_FOR_GAP_PREFIX = "empty_authorization_for:";
export const GENERATED_BY_EQUALS_SUBJECT_GAP = "generated_by_equals_subject_executor";

export const AUTHZ_STANDING_LIMITATIONS: readonly string[] = [
  "D13: EXTERNAL effects cannot be PROVEN without verifiable authorization refs (empty authorizationFor ≠ authorized; grant ids are never invented)",
  "RR-W5-02 OPEN: PolicyDecision 1.0.0 has no decided_by; HUMAN≠executor is not proven by this engine",
];

export const PROVENANCE_UNWIRED_LIMITATION =
  "provenance QueryPort not wired; authorization/independence are local (isIndependent + ledger policy.decided if present). Empty refs are not treated as authorized";

export type AuthorizationLookup = Pick<ProvenanceQueryPort, "authorizationFor">;
export type EvidenceRequirementLookup = Pick<ProvenanceQueryPort, "evidenceForRequirement">;

export interface AuthzPorts {
  authorization?: AuthorizationLookup;
  ledger?: EventLedgerPort;
}

export interface EffectAuthzVerdict {
  effect_id: string;
  authorized: boolean;
  /** Citeable refs actually observed. Never fabricated. */
  refs: string[];
  reason: string;
}

export interface WorkAuthzAssessment {
  verdicts: EffectAuthzVerdict[];
  unauthorized_effect_ids: string[];
  refs: string[];
  gaps: string[];
  limitations: string[];
}

export function isCiteableAuthzRef(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value !== value.trim()) return false;
  if (CHAT_MEMORY.test(value)) return false;
  if (value.includes("\0") || value.includes("/") || value.includes("\\") || value.includes("..") || value.includes("%")) {
    return false;
  }
  if (isValidId("event", value)) return true;
  if (isValidId("policy_decision", value)) return true;
  if (isValidId("policy", value)) return true;
  if (isValidId("evidence", value)) return true;
  if (isValidId("artifact", value)) return true;
  if (isValidId("proof", value)) return true;
  if (isValidId("execution", value)) return true;
  if (isValidId("effect", value)) return true;
  if (LOCAL_GRANT.test(value) || LOCAL_APPROVAL.test(value)) return true;
  return false;
}

export function collectCiteableRefs(values: readonly unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!isCiteableAuthzRef(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function requiresExternalAuthorization(effect: Pick<EffectRecord, "effect_class" | "state">): boolean {
  return effect.effect_class === "EXTERNAL" && (AUTHORIZED_OR_BEYOND as readonly string[]).includes(effect.state);
}

export function generatedByEqualsSubject(verifier_id: string, subject_executor_id: string | undefined): boolean {
  if (!verifier_id || !subject_executor_id) return false;
  return verifier_id === subject_executor_id;
}

/**
 * Cap PROVEN requirements to PARTIAL so frozen `deriveFinalStatus` cannot emit PROVEN.
 * FAILED is preserved. Extra gaps are always recorded (INV-PROOF-04).
 */
export function applyProofCaps(requirements: RequirementProof[], extraGaps: string[]): RequirementProof[] {
  if (extraGaps.length === 0) return requirements;
  return requirements.map((r) => {
    const gaps = unique([...r.gaps, ...extraGaps]);
    if (r.status === "FAILED") return { ...r, gaps };
    if (r.status === "PROVEN") return { ...r, status: "PARTIAL", gaps };
    return { ...r, gaps };
  });
}

export function capProvenStatus(status: ProofStatus, shouldCap: boolean): ProofStatus {
  if (!shouldCap) return status;
  if (status === "PROVEN") return "PARTIAL";
  return status;
}

export async function assessExternalAuthorization(
  work_id: string,
  effects: readonly EffectRecord[],
  ports: AuthzPorts,
): Promise<WorkAuthzAssessment> {
  const required = effects.filter(requiresExternalAuthorization);
  const limitations: string[] = [];

  if (required.length === 0) {
    return { verdicts: [], unauthorized_effect_ids: [], refs: [], gaps: [], limitations };
  }

  if (!ports.authorization) {
    limitations.push(PROVENANCE_UNWIRED_LIMITATION);
  }

  const verdicts: EffectAuthzVerdict[] = [];
  for (const effect of required) {
    verdicts.push(await verifyOneExternal(work_id, effect, ports));
  }

  const unauthorized = verdicts.filter((v) => !v.authorized);
  const refs = unique(verdicts.flatMap((v) => v.refs));
  const gaps = unauthorized.map((v) =>
    v.reason.startsWith(EMPTY_AUTHORIZATION_FOR_GAP_PREFIX) || v.reason.startsWith(UNAUTHORIZED_EXTERNAL_GAP_PREFIX)
      ? v.reason
      : `${UNAUTHORIZED_EXTERNAL_GAP_PREFIX}${v.effect_id}`,
  );

  return {
    verdicts,
    unauthorized_effect_ids: unauthorized.map((v) => v.effect_id),
    refs,
    gaps,
    limitations,
  };
}

async function verifyOneExternal(
  work_id: string,
  effect: EffectRecord,
  ports: AuthzPorts,
): Promise<EffectAuthzVerdict> {
  const effect_id = effect.effect_id;

  if (ports.authorization) {
    let raw: unknown;
    try {
      raw = await ports.authorization.authorizationFor(effect_id);
    } catch {
      return {
        effect_id,
        authorized: false,
        refs: [],
        reason: `${EMPTY_AUTHORIZATION_FOR_GAP_PREFIX}${effect_id}`,
      };
    }
    const refs = collectCiteableRefs(Array.isArray(raw) ? raw : []);
    if (refs.length === 0) {
      return {
        effect_id,
        authorized: false,
        refs: [],
        reason: `${EMPTY_AUTHORIZATION_FOR_GAP_PREFIX}${effect_id}`,
      };
    }
    return { effect_id, authorized: true, refs, reason: "authorizationFor" };
  }

  const claimed = effect.authorization?.policy_decision_id;
  if (!claimed || !isValidId("policy_decision", claimed)) {
    return {
      effect_id,
      authorized: false,
      refs: [],
      reason: `${UNAUTHORIZED_EXTERNAL_GAP_PREFIX}${effect_id}`,
    };
  }

  if (!ports.ledger) {
    return {
      effect_id,
      authorized: false,
      refs: [],
      reason: `${UNAUTHORIZED_EXTERNAL_GAP_PREFIX}${effect_id}`,
    };
  }

  let events: WorkEvent[] = [];
  try {
    events = await ports.ledger.read(work_id);
  } catch {
    return {
      effect_id,
      authorized: false,
      refs: [],
      reason: `${UNAUTHORIZED_EXTERNAL_GAP_PREFIX}${effect_id}`,
    };
  }

  const ledgerRefs = refsFromLedgerPolicyDecided(events, claimed);
  if (ledgerRefs.length === 0) {
    return {
      effect_id,
      authorized: false,
      refs: [],
      reason: `${UNAUTHORIZED_EXTERNAL_GAP_PREFIX}${effect_id}`,
    };
  }
  return { effect_id, authorized: true, refs: ledgerRefs, reason: "ledger_policy.decided" };
}

/**
 * Cite only ids present on hash-chained events. DENY cannot authorize.
 * REQUIRE_APPROVAL needs an `approval.decided` with extracted state APPROVED.
 * Does **not** check HUMAN ≠ executor (frozen PolicyDecision has no decided_by; RR-W5-02 OPEN).
 */
export function refsFromLedgerPolicyDecided(events: readonly WorkEvent[], policy_decision_id: string): string[] {
  if (!isValidId("policy_decision", policy_decision_id)) return [];

  const decided = events.filter((e) => e.type === "policy.decided" && payloadDecisionId(e) === policy_decision_id);
  if (decided.length === 0) return [];

  let effect: string | undefined;
  for (const event of decided) {
    const d = payloadString(event.payload, "decision");
    if (d) effect = d;
  }
  if (effect === "DENY") return [];
  if (!effect) return [];

  const refs: unknown[] = [policy_decision_id];
  for (const event of decided) {
    refs.push(event.event_id);
    const policyId = nestedPolicyId(event.payload);
    if (policyId) refs.push(policyId);
  }

  if (effect === "REQUIRE_APPROVAL") {
    const approved = events.filter(
      (e) =>
        e.type === "approval.decided" &&
        payloadDecisionId(e) === policy_decision_id &&
        payloadString(e.payload, "state") === "APPROVED",
    );
    if (approved.length === 0) return [];
    for (const event of approved) {
      refs.push(event.event_id);
      const approvalId = payloadString(event.payload, "approval_id");
      const grantId = payloadString(event.payload, "grant_id");
      if (approvalId) refs.push(approvalId);
      if (grantId) refs.push(grantId);
    }
  }

  return collectCiteableRefs(refs);
}

export async function provenanceBackedEvidenceIds(
  lookup: EvidenceRequirementLookup | undefined,
  goal_contract_id: string,
  version: number,
  criterion_id: string,
  local_ids: readonly string[],
): Promise<{ ids: string[]; empty_port: boolean; unwired: boolean }> {
  if (!lookup) {
    return { ids: [...local_ids], empty_port: false, unwired: true };
  }
  let raw: unknown;
  try {
    raw = await lookup.evidenceForRequirement(goal_contract_id, version, criterion_id);
  } catch {
    return { ids: [], empty_port: true, unwired: false };
  }
  const refs = collectCiteableRefs(Array.isArray(raw) ? raw : []);
  if (refs.length === 0) {
    return { ids: [], empty_port: true, unwired: false };
  }
  const allowed = new Set(refs);
  return { ids: local_ids.filter((id) => allowed.has(id)), empty_port: false, unwired: false };
}

function payloadDecisionId(event: WorkEvent): string | undefined {
  return payloadString(event.payload, "decision_id") ?? payloadString(event.payload, "policy_decision_id");
}

function payloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function nestedPolicyId(payload: Record<string, unknown>): string | undefined {
  const ref = payload.policy_ref;
  if (!ref || typeof ref !== "object") return undefined;
  const id = (ref as { policy_id?: unknown }).policy_id;
  return typeof id === "string" ? id : undefined;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}
