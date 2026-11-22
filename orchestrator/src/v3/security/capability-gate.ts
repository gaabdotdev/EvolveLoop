/**
 * V0-SEC-05 — Capability Gate: default deny for destructive/sensitive actions → BLOCKED.
 * V2-INT-04 — Optional DelegationRegistry hook for destroy/network/credential categories.
 */

import type { AuthorityContext } from "../../authority/capability-authority.js";
import {
  evaluateCapability,
  narrowProfileByAuthority,
  type SecurityDecision,
} from "./enforcer.js";
import type {
  CapabilityAction,
  CapabilityDecision,
  SandboxProfile,
} from "./types.js";
import { agentWorkspaceProfile } from "./profiles.js";
import {
  ACTION_TO_DELEGATION_CATEGORY,
  type DelegationRegistry,
} from "./delegation.js";

export type CapabilityGateVerdict = "allow" | "BLOCKED";

/** Actions that are destructive or sensitive — fail closed unless explicitly allowed. */
export const DESTRUCTIVE_OR_SENSITIVE_ACTIONS: ReadonlySet<CapabilityAction> = new Set([
  "filesystem.delete",
  "deploy.publish",
  "secrets.read",
  "secrets.inject",
  "sandbox.disable",
  "workspace.outside",
  "git.mutate",
  "package.install",
  "network.egress",
  "mcp.invoke",
]);

export interface CapabilityGateRequest {
  action: CapabilityAction;
  /** Workspace for default profile when none supplied. */
  workspace_root?: string;
  profile?: SandboxProfile;
  authority?: AuthorityContext;
  resource?: string;
  targetPath?: string;
  /** When true, require_approval is treated as allow (caller already approved). */
  approved?: boolean;
  /**
   * V2-INT-04 — When both principal and registry are set, destroy/network/credential
   * actions must also pass DelegationRegistry.isAllowed (never widens profile allow).
   */
  principal?: string;
  delegation_registry?: DelegationRegistry;
}

export interface CapabilityGateResult {
  kind: "CapabilityGateResult";
  verdict: CapabilityGateVerdict;
  /** MSO / circuit state hint when blocked. */
  mso_state: "BLOCKED" | null;
  action: CapabilityAction;
  reason: string;
  underlying: CapabilityDecision;
  profile_id: string;
  checked_at: string;
}

function toBlocked(
  action: CapabilityAction,
  reason: string,
  underlying: CapabilityDecision,
  profile_id: string,
): CapabilityGateResult {
  return {
    kind: "CapabilityGateResult",
    verdict: "BLOCKED",
    mso_state: "BLOCKED",
    action,
    reason,
    underlying,
    profile_id,
    checked_at: new Date().toISOString(),
  };
}

/**
 * V2-INT-04 — Fail-closed delegation check for destroy/network/credential.
 * Does not widen: only consulted after profile would otherwise allow.
 */
export function checkDelegatedAuthority(
  req: CapabilityGateRequest,
  profile_id: string,
): CapabilityGateResult | null {
  const category = ACTION_TO_DELEGATION_CATEGORY[req.action];
  if (!category) return null;
  if (!req.principal || !req.delegation_registry) {
    // No registry context → do not invent allow; caller relies on profile alone.
    return null;
  }
  const path =
    req.targetPath ??
    req.resource ??
    req.workspace_root ??
    req.profile?.filesystem.workspace_rw ??
    "/";
  const d = req.delegation_registry.isAllowed(req.principal, category, path);
  if (d.allowed) return null;
  return toBlocked(
    req.action,
    `delegation_denied:${category}:${d.reason}`,
    "deny",
    profile_id,
  );
}

/**
 * Evaluate a capability. Unknown / deny / unapproved sensitive → BLOCKED.
 * Default profile (agent-workspace) already denies network/secrets and requires
 * approval for delete/mutate/install — gate maps those to BLOCKED unless approved.
 * When principal+DelegationRegistry are supplied, destroy/network/credential
 * must also be covered by an active grant (narrow-only).
 */
export function capabilityGate(req: CapabilityGateRequest): CapabilityGateResult {
  const workspace = req.workspace_root ?? req.profile?.filesystem.workspace_rw ?? "/tmp";
  const base = req.profile ?? agentWorkspaceProfile(workspace);
  const profile = narrowProfileByAuthority(base, req.authority);
  const decision: SecurityDecision = evaluateCapability(profile, req.action, {
    resource: req.resource,
    targetPath: req.targetPath,
  });

  if (decision.decision === "allow") {
    const blocked = checkDelegatedAuthority(req, decision.profile_id);
    if (blocked) return blocked;
    return {
      kind: "CapabilityGateResult",
      verdict: "allow",
      mso_state: null,
      action: req.action,
      reason: decision.reason,
      underlying: "allow",
      profile_id: decision.profile_id,
      checked_at: decision.checked_at,
    };
  }

  if (decision.decision === "require_approval" && req.approved === true) {
    const blocked = checkDelegatedAuthority(req, decision.profile_id);
    if (blocked) return blocked;
    return {
      kind: "CapabilityGateResult",
      verdict: "allow",
      mso_state: null,
      action: req.action,
      reason: `approved:${decision.reason}`,
      underlying: "require_approval",
      profile_id: decision.profile_id,
      checked_at: decision.checked_at,
    };
  }

  // Default deny path — including require_approval without approval.
  const reason =
    decision.decision === "require_approval"
      ? `capability_requires_approval:${req.action}:${decision.reason}`
      : `capability_denied:${req.action}:${decision.reason}`;

  return toBlocked(req.action, reason, decision.decision, decision.profile_id);
}

/**
 * Fail-closed helper: if action is destructive/sensitive and gate blocks → true.
 */
export function isBlockedByCapabilityGate(req: CapabilityGateRequest): boolean {
  return capabilityGate(req).verdict === "BLOCKED";
}

/**
 * Assert allow or throw — used by callers that prefer exceptions.
 */
export function assertCapabilityAllowed(req: CapabilityGateRequest): CapabilityGateResult {
  const result = capabilityGate(req);
  if (result.verdict === "BLOCKED") {
    throw new CapabilityGateError("BLOCKED", result.reason, result);
  }
  return result;
}

export class CapabilityGateError extends Error {
  constructor(
    readonly code: "BLOCKED",
    message: string,
    readonly gate: CapabilityGateResult,
  ) {
    super(message);
    this.name = "CapabilityGateError";
  }
}
