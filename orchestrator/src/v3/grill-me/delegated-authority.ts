/**
 * V2-INT-04 — Minimal Grill-Me ↔ DelegationRegistry integration (pure / testable).
 * Contracts may attach grant_ids and query allowance without I/O side effects
 * beyond the in-memory registry they are given.
 */

import type { GrillMeResult } from "./types.js";
import {
  DelegationError,
  type DelegationAllowDecision,
  type DelegationCategory,
  type DelegationGrant,
  type DelegationRegistry,
  type IssueGrantInput,
} from "../security/delegation.js";

/** Attachment recorded on a Grill-Me session / contract artefact. */
export interface GrillMeDelegationAttachment {
  kind: "GrillMeDelegationAttachment";
  /** Stable id for the grill session or goal-contract id. */
  contract_ref: string;
  grant_ids: string[];
  attached_at: string;
}

export interface AttachGrantInput extends IssueGrantInput {
  contract_ref: string;
}

export interface AttachGrantResult {
  grant: DelegationGrant;
  attachment: GrillMeDelegationAttachment;
}

/**
 * Issue a grant via the registry and attach its id to a Grill-Me contract ref.
 * Pure relative to the provided registry + attachment map.
 */
export function attachDelegationGrant(
  registry: DelegationRegistry,
  attachments: Map<string, GrillMeDelegationAttachment>,
  input: AttachGrantInput,
  attachedAt?: string,
): AttachGrantResult {
  const { contract_ref, ...issueInput } = input;
  if (!contract_ref.trim()) {
    throw new DelegationError("INVALID_CONTRACT_REF", "contract_ref required");
  }
  const grant = registry.issue(issueInput);
  const at = attachedAt ?? new Date().toISOString();
  const existing = attachments.get(contract_ref);
  const grant_ids = existing
    ? [...new Set([...existing.grant_ids, grant.grant_id])]
    : [grant.grant_id];
  const attachment: GrillMeDelegationAttachment = {
    kind: "GrillMeDelegationAttachment",
    contract_ref,
    grant_ids,
    attached_at: existing?.attached_at ?? at,
  };
  attachments.set(contract_ref, attachment);
  return { grant, attachment };
}

/** List grants attached to a Grill-Me contract (resolved from registry). */
export function listAttachedGrants(
  registry: DelegationRegistry,
  attachments: Map<string, GrillMeDelegationAttachment>,
  contract_ref: string,
): DelegationGrant[] {
  const att = attachments.get(contract_ref);
  if (!att) return [];
  return att.grant_ids
    .map((id) => registry.getGrant(id))
    .filter((g): g is DelegationGrant => Boolean(g));
}

/** Query whether a principal may perform category@path under attached grants. */
export function queryGrillDelegation(
  registry: DelegationRegistry,
  principal: string,
  category: DelegationCategory,
  path: string,
): DelegationAllowDecision {
  return registry.isAllowed(principal, category, path);
}

/**
 * Validate that a GrillMeResult may carry optional delegation metadata
 * without inventing grants — attachment must reference real registry ids.
 */
export function validateGrillDelegationRefs(
  registry: DelegationRegistry,
  attachment: GrillMeDelegationAttachment | undefined,
  _result?: GrillMeResult,
): { ok: boolean; reasons: string[] } {
  if (!attachment) return { ok: true, reasons: [] };
  if (attachment.kind !== "GrillMeDelegationAttachment") {
    return { ok: false, reasons: ["invalid_attachment_kind"] };
  }
  const reasons: string[] = [];
  for (const id of attachment.grant_ids) {
    if (!registry.getGrant(id)) reasons.push(`missing_grant:${id}`);
  }
  return { ok: reasons.length === 0, reasons };
}
