/**
 * Policy enforcer — evaluates capabilities against a SandboxProfile.
 * Fail-closed for unknown actions. Integrates with AuthorityContext flags.
 */

import type { AuthorityContext } from "../../authority/capability-authority.js";
import {
  pathEscapesWorkspace,
} from "../../authority/capability-authority.js";
import type {
  CapabilityAction,
  CapabilityDecision,
  CapabilityGrant,
  SandboxProfile,
  SecurityDecision,
} from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function grantFor(
  profile: SandboxProfile,
  action: CapabilityAction,
  resource?: string,
): CapabilityGrant | undefined {
  const matches = profile.capabilities.filter((g) => g.action === action);
  if (matches.length === 0) return undefined;
  if (!resource) {
    return matches.find((g) => !g.scope) ?? matches[0];
  }
  const scoped = matches.find((g) => g.scope && resource.startsWith(g.scope));
  if (scoped) return scoped;
  return matches.find((g) => !g.scope);
}

/**
 * Map legacy AuthorityContext onto profile ceilings (cannot widen).
 */
export function narrowProfileByAuthority(
  profile: SandboxProfile,
  auth?: AuthorityContext,
): SandboxProfile {
  if (!auth) return profile;
  const caps = profile.capabilities.map((g) => {
    let decision = g.decision;
    if (g.action === "shell.execute" || g.action === "process.spawn") {
      if (auth.allowShell !== true && decision === "allow") decision = "deny";
    }
    if (g.action === "filesystem.write" || g.action === "filesystem.delete") {
      if (auth.allowWrite !== true && decision === "allow") decision = "deny";
    }
    if (g.action === "network.egress" || g.action === "package.install") {
      if (auth.allowNetwork !== true && decision === "allow") {
        decision = "deny";
      }
    }
    if (g.action === "workspace.outside" || g.action === "secrets.read") {
      if (auth.allowHostInspect !== true && decision === "allow") decision = "deny";
    }
    return { ...g, decision };
  });
  return { ...profile, capabilities: caps };
}

export function evaluateCapability(
  profile: SandboxProfile,
  action: CapabilityAction,
  opts?: { resource?: string; targetPath?: string },
): SecurityDecision {
  const grant = grantFor(profile, action, opts?.resource);
  let decision: CapabilityDecision = grant?.decision ?? "deny";
  let reason =
    grant?.reason ??
    (grant ? `grant:${grant.decision}` : `unknown_action_fail_closed:${action}`);

  // Hard deny: disabling sandbox is never allow without explicit grant (still fail-closed default).
  if (action === "sandbox.disable" && decision === "allow") {
    decision = "require_approval";
    reason = "sandbox.disable cannot be silently allowed";
  }

  // Path escape → deny for filesystem actions.
  if (
    (action === "filesystem.read" ||
      action === "filesystem.write" ||
      action === "filesystem.delete") &&
    opts?.targetPath
  ) {
    if (pathEscapesWorkspace(opts.targetPath, profile.filesystem.workspace_rw)) {
      decision = "deny";
      reason = "path_escapes_workspace";
    }
    for (const denied of profile.filesystem.denied_paths) {
      const abs = opts.targetPath;
      if (abs === denied || abs.startsWith(denied.endsWith("/") ? denied : denied + "/")) {
        decision = "deny";
        reason = `denied_path:${denied}`;
        break;
      }
    }
  }

  // Network deny mode.
  if (action === "network.egress" && profile.network.mode === "deny") {
    decision = "deny";
    reason = "network_mode_deny";
  }

  return {
    decision,
    action,
    reason,
    profile_id: profile.profile_id,
    requires_sandbox: profile.require_os_sandbox,
    checked_at: nowIso(),
  };
}

export function assertAllowed(
  profile: SandboxProfile,
  action: CapabilityAction,
  opts?: { resource?: string; targetPath?: string },
): SecurityDecision {
  const d = evaluateCapability(profile, action, opts);
  if (d.decision === "deny") {
    throw new SecurityPolicyError("DENIED", `${action}: ${d.reason}`);
  }
  // Fail-closed: require_approval is not silent allow (ISSUE-SEC-C01).
  if (d.decision === "require_approval") {
    throw new SecurityPolicyError(
      "REQUIRES_APPROVAL",
      `${action}: ${d.reason} — obtain grant via ApprovalBroker before proceeding`,
    );
  }
  return d;
}

export class SecurityPolicyError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SecurityPolicyError";
  }
}
