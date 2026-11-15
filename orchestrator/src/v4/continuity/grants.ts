/**
 * Re-derive effective grant refs at accept (INV-CAP-07, TM-V4-F01).
 *
 * Result ⊆ current policy ALLOW set ∩ capsule.delegable_grants (only narrows).
 * Capsule grant rows are reconstructed from allowlisted fields — never spread
 * as permission material.
 */

import type {
  DelegableGrantRef,
  ExecutorRef,
  IsoTimestamp,
  PolicyDecisionPort,
  PolicyDecisionRequest,
  RiskLevel,
} from "../contracts/index.js";

export interface RederiveInput {
  work_id: string;
  policy_id: string;
  now: IsoTimestamp;
  subject: ExecutorRef;
  environment: string;
  risk: RiskLevel;
  capsule_grants: DelegableGrantRef[];
}

export interface RederiveResult {
  effective_grant_refs: string[];
  policy_ref: { policy_id: string; version: number; epoch: number };
}

function parseScopeItem(item: string, work_id: string): { action: string; resource: string } {
  const trimmed = item.trim();
  const sp = trimmed.indexOf(" ");
  if (sp <= 0) return { action: trimmed, resource: `work/${work_id}` };
  return { action: trimmed.slice(0, sp), resource: trimmed.slice(sp + 1).trim() };
}

/** Copy only grant_ref / scope / expires_at — drop any extra keys a caller smuggled. */
export function refsOnly(grants: readonly DelegableGrantRef[]): DelegableGrantRef[] {
  return grants.map((g) => ({
    grant_ref: g.grant_ref,
    scope: [...g.scope],
    expires_at: g.expires_at,
  }));
}

export async function rederiveGrantRefs(
  policy: PolicyDecisionPort,
  input: RederiveInput,
): Promise<RederiveResult> {
  const epoch = await policy.currentEpoch(input.policy_id);
  const probeReq: PolicyDecisionRequest = {
    work_id: input.work_id,
    subject: input.subject,
    action: "capsule.accept",
    resource: `work/${input.work_id}`,
    environment: input.environment,
    risk: input.risk,
  };
  const probe = await policy.decide(probeReq);
  const policy_ref = {
    policy_id: probe.policy_ref.policy_id,
    version: probe.policy_ref.version,
    epoch: probe.policy_ref.epoch === epoch ? probe.policy_ref.epoch : epoch,
  };

  const seen = new Set<string>();
  const effective: string[] = [];
  for (const grant of refsOnly(input.capsule_grants)) {
    if (seen.has(grant.grant_ref)) continue;
    seen.add(grant.grant_ref);
    if (Date.parse(grant.expires_at) <= Date.parse(input.now)) continue;
    let allowed = grant.scope.length > 0;
    for (const item of grant.scope) {
      const { action, resource } = parseScopeItem(item, input.work_id);
      const decision = await policy.decide({
        work_id: input.work_id,
        subject: input.subject,
        action,
        resource,
        environment: input.environment,
        risk: input.risk,
      });
      if (decision.decision !== "ALLOW") {
        allowed = false;
        break;
      }
    }
    if (allowed) effective.push(grant.grant_ref);
  }

  return { effective_grant_refs: effective, policy_ref };
}
