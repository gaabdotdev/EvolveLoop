/**
 * Allowlisted extraction of ids from WorkEvent payloads.
 * Unknown keys, free-text names, and skill/provider labels are ignored (D17).
 */

import { isRecord, isSha256, isValidId, type WorkEvent } from "../contracts/index.js";

const POLICY_EFFECTS = new Set(["ALLOW", "DENY", "REQUIRE_APPROVAL"]);

export interface ExtractedPayload {
  decision_ids: string[];
  policy_ids: string[];
  artifact_ids: string[];
  effect_ids: string[];
  evidence_ids: string[];
  proof_ids: string[];
  grant_ids: string[];
  approval_ids: string[];
  executor_ids: string[];
  /** Pinned package artifacts only — names without an artifact id are dropped (D17). */
  supply_artifact_ids: string[];
  criterion_id?: string;
  goal_contract_id?: string;
  goal_contract_version?: number;
  policy_effect?: "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
  approval_state?: string;
  method_kind?: string;
  evidence_result?: string;
  content_sha256?: string;
  grant_revoked: boolean;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pushValid(target: string[], value: unknown, kind: Parameters<typeof isValidId>[0]): void {
  if (typeof value === "string" && isValidId(kind, value) && !target.includes(value)) {
    target.push(value);
  }
}

function pushLocal(target: string[], value: unknown, prefix: "grn" | "apr"): void {
  if (typeof value !== "string") return;
  if (!value.startsWith(prefix)) return;
  if (value.includes("/") || value.includes("\\") || value.includes("..") || value.includes("%") || value.includes("\0")) {
    return;
  }
  if (!target.includes(value)) target.push(value);
}

function nested(payload: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = payload[key];
  return isRecord(value) ? value : undefined;
}

export function extractPayload(payload: unknown): ExtractedPayload {
  const out: ExtractedPayload = {
    decision_ids: [],
    policy_ids: [],
    artifact_ids: [],
    effect_ids: [],
    evidence_ids: [],
    proof_ids: [],
    grant_ids: [],
    approval_ids: [],
    executor_ids: [],
    supply_artifact_ids: [],
    grant_revoked: false,
  };
  if (!isRecord(payload)) return out;

  pushValid(out.decision_ids, payload.decision_id, "policy_decision");
  pushValid(out.decision_ids, payload.decision_ref, "policy_decision");
  pushValid(out.decision_ids, payload.policy_decision_id, "policy_decision");
  pushValid(out.decision_ids, payload.authorization_policy_decision_id, "policy_decision");

  const authorization = nested(payload, "authorization");
  if (authorization) {
    pushValid(out.decision_ids, authorization.policy_decision_id, "policy_decision");
    pushLocal(out.approval_ids, authorization.approval_id, "apr");
  }

  const policyRef = nested(payload, "policy_ref");
  if (policyRef) pushValid(out.policy_ids, policyRef.policy_id, "policy");
  pushValid(out.policy_ids, payload.policy_id, "policy");

  pushValid(out.artifact_ids, payload.artifact_id, "artifact");
  pushValid(out.effect_ids, payload.effect_id, "effect");
  pushValid(out.evidence_ids, payload.evidence_id, "evidence");
  pushValid(out.proof_ids, payload.proof_id, "proof");
  pushLocal(out.grant_ids, payload.grant_id, "grn");
  pushLocal(out.approval_ids, payload.approval_id, "apr");

  if (Array.isArray(payload.evidence_ids)) {
    for (const id of payload.evidence_ids) pushValid(out.evidence_ids, id, "evidence");
  }

  const origin = nested(payload, "origin");
  const executorRef = origin ? nested(origin, "executor_ref") : nested(payload, "executor_ref");
  if (executorRef) pushValid(out.executor_ids, executorRef.executor_id, "executor");
  pushValid(out.executor_ids, payload.executor_id, "executor");

  // D17: only hash-pinned package artifacts, never a free-text skill/provider name.
  pushValid(out.supply_artifact_ids, payload.skill_artifact_id, "artifact");
  pushValid(out.supply_artifact_ids, payload.provider_artifact_id, "artifact");
  const pin = nested(payload, "origin_pin");
  if (pin) {
    pushValid(out.supply_artifact_ids, pin.artifact_id, "artifact");
    pushValid(out.supply_artifact_ids, pin.skill_artifact_id, "artifact");
  }

  const criterion = asString(payload.criterion_id);
  if (criterion) out.criterion_id = criterion;
  if (typeof payload.goal_contract_id === "string" && isValidId("goal_contract", payload.goal_contract_id)) {
    out.goal_contract_id = payload.goal_contract_id;
  }
  if (typeof payload.goal_contract_version === "number" && Number.isInteger(payload.goal_contract_version) && payload.goal_contract_version >= 1) {
    out.goal_contract_version = payload.goal_contract_version;
  }
  const criterionRef = nested(payload, "criterion_ref");
  if (criterionRef) {
    const cid = asString(criterionRef.criterion_id);
    if (cid) out.criterion_id = cid;
    if (typeof criterionRef.goal_contract_id === "string" && isValidId("goal_contract", criterionRef.goal_contract_id)) {
      out.goal_contract_id = criterionRef.goal_contract_id;
    }
    if (
      typeof criterionRef.goal_contract_version === "number" &&
      Number.isInteger(criterionRef.goal_contract_version) &&
      criterionRef.goal_contract_version >= 1
    ) {
      out.goal_contract_version = criterionRef.goal_contract_version;
    }
  }

  const decision = asString(payload.decision);
  if (decision && POLICY_EFFECTS.has(decision)) {
    out.policy_effect = decision as "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
  }
  const state = asString(payload.state);
  if (state) out.approval_state = state;
  const method = nested(payload, "method");
  out.method_kind = asString(payload.method_kind) ?? (method ? asString(method.kind) : undefined);
  out.evidence_result = asString(payload.result);

  const content = nested(payload, "content");
  if (content && isSha256(content.sha256)) out.content_sha256 = content.sha256;

  return out;
}

export function extractEvent(event: WorkEvent): ExtractedPayload {
  const extracted = extractPayload(event.payload);
  if (event.type === "grant.revoked") extracted.grant_revoked = true;
  if (event.actor.kind === "EXECUTOR" && isValidId("executor", event.actor.id)) {
    if (!extracted.executor_ids.includes(event.actor.id)) extracted.executor_ids.push(event.actor.id);
  }
  return extracted;
}

export function criterionKey(goal_contract_id: string, version: number, criterion_id: string): string {
  return `${goal_contract_id}|${version}|${criterion_id}`;
}
