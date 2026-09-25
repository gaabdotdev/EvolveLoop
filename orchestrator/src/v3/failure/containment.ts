/**
 * Failure Containment — escalate only when local containment fails (Meta 61 / §243).
 */

import type { OutcomeStatus } from "./types.js";
import {
  CONTAINMENT_ACTIONS,
  CONTAINMENT_DOMAINS,
  type ContainmentAction,
  type ContainmentDomain,
} from "./types.js";

export interface ContainmentDecision {
  action: ContainmentAction;
  domain: ContainmentDomain;
  reason: string;
  /** Suggested SafetyState target when containment implies safety change. */
  safety_hint: "SUSPECT" | "RESTRICTED" | "QUARANTINED" | "unchanged";
}

/**
 * Map domain → default containment action (narrowest safe boundary).
 * Escalation to wider domains is the caller's responsibility when local fails.
 */
const DOMAIN_DEFAULT_ACTION: Readonly<Record<ContainmentDomain, ContainmentAction>> = {
  action: "degrade_autonomy",
  capability: "quarantine_capability",
  provider: "quarantine_capability",
  agent: "pause_agency",
  project: "quarantine_goal",
  workspace: "pause_agency",
  system: "escalate_human",
};

/**
 * Select containment for a failure domain + outcome.
 * FAIL/BLOCKED escalate harder than PARTIAL/DEGRADED/UNCERTAIN.
 * NOT_MEASURED → degrade_autonomy (fail-closed, never treat as success).
 */
export function selectContainment(
  domain: ContainmentDomain,
  outcome: OutcomeStatus,
  options?: { escalate?: boolean },
): ContainmentDecision {
  if (options?.escalate) {
    return escalateContainment(domain, outcome);
  }

  if (outcome === "PASS") {
    return {
      action: "degrade_autonomy",
      domain,
      reason: "PASS does not require containment; no-op degrade hint unused",
      safety_hint: "unchanged",
    };
  }

  if (outcome === "NOT_MEASURED" || outcome === "UNCERTAIN") {
    return {
      action: "degrade_autonomy",
      domain,
      reason: `fail-closed containment for ${outcome}`,
      safety_hint: "SUSPECT",
    };
  }

  if (outcome === "PARTIAL" || outcome === "DEGRADED") {
    return {
      action: "degrade_autonomy",
      domain,
      reason: `degraded/partial result at ${domain}`,
      safety_hint: "RESTRICTED",
    };
  }

  // FAIL | BLOCKED
  const action = DOMAIN_DEFAULT_ACTION[domain];
  const safety_hint =
    action === "escalate_human" || action === "quarantine_goal" || action === "quarantine_capability"
      ? "QUARANTINED"
      : action === "pause_agency"
        ? "RESTRICTED"
        : "SUSPECT";

  return {
    action,
    domain,
    reason: `${outcome} contained at ${domain} via ${action}`,
    safety_hint,
  };
}

/** Escalate one domain wider; system → escalate_human. */
export function escalateContainment(
  domain: ContainmentDomain,
  outcome: OutcomeStatus,
): ContainmentDecision {
  const idx = CONTAINMENT_DOMAINS.indexOf(domain);
  const next =
    idx < 0 || idx >= CONTAINMENT_DOMAINS.length - 1
      ? "system"
      : CONTAINMENT_DOMAINS[idx + 1]!;

  if (next === "system") {
    return {
      action: "escalate_human",
      domain: "system",
      reason: `local containment failed; escalate from ${domain} (${outcome})`,
      safety_hint: "QUARANTINED",
    };
  }

  return selectContainment(next, outcome === "PASS" ? "FAIL" : outcome);
}

export function isContainmentAction(value: string): value is ContainmentAction {
  return (CONTAINMENT_ACTIONS as readonly string[]).includes(value);
}

export function isContainmentDomain(value: string): value is ContainmentDomain {
  return (CONTAINMENT_DOMAINS as readonly string[]).includes(value);
}
