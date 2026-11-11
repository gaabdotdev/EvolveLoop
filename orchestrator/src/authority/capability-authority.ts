/**
 * CapabilityAuthority — allow | deny | confirm for operational capabilities.
 * Distinct from PolicyEngine (retries, gates, provider strategy).
 * ADR-V3-0002: fail-closed unknowns; symlink-aware workspace confinement.
 */

import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

export type AuthorityDecision = "allow" | "deny" | "confirm";

export interface AuthorityContext {
  confirmed?: boolean;
  allowShell?: boolean;
  allowWrite?: boolean;
  allowNetwork?: boolean;
  allowHostInspect?: boolean;
  workspaceRoot?: string;
}

/**
 * Policy grants are the ceiling. A request may narrow them.
 * It cannot add shell, write, network, host inspect, or confirmation.
 */
export function effectiveAuthority(
  policy: AuthorityContext,
  requested?: AuthorityContext,
): AuthorityContext {
  const keep = (granted: boolean | undefined, requestedFlag: boolean | undefined): boolean =>
    granted === true && requestedFlag !== false;
  return {
    workspaceRoot: policy.workspaceRoot,
    allowShell: keep(policy.allowShell, requested?.allowShell),
    allowWrite: keep(policy.allowWrite, requested?.allowWrite),
    allowNetwork: keep(policy.allowNetwork, requested?.allowNetwork),
    allowHostInspect: keep(policy.allowHostInspect, requested?.allowHostInspect),
    confirmed: policy.confirmed === true && requested?.confirmed !== false,
  };
}

export interface AuthorityRequest {
  capability: string;
  permissions?: {
    filesystem?: "none" | "read" | "write";
    network?: boolean;
    shell?: boolean;
  };
  side_effects?: boolean;
  deterministic?: boolean;
  requires_confirmation?: boolean;
  targetPath?: string;
  context?: AuthorityContext;
}

export interface AuthorityResult {
  decision: AuthorityDecision;
  reason: string;
  checked_at: string;
  evidence: {
    type: "authority";
    capability: string;
    decision: AuthorityDecision;
    reason: string;
    permissions?: AuthorityRequest["permissions"];
    context_flags: {
      confirmed: boolean;
      allowShell: boolean;
      allowWrite: boolean;
      allowNetwork: boolean;
      allowHostInspect: boolean;
    };
  };
}

/** Deterministic inspect/read capabilities that are baseline-allow without write/shell grants. */
export const READ_ONLY_CAPABILITY_ALLOWLIST = new Set<string>([
  "filesystem.read",
  "filesystem.list",
  "filesystem.search",
  "git.status",
  "git.diff",
  "git.log",
  "git.inspect",
  "repository.inspect",
  "project.inspect",
]);

function safeRealpath(path: string): string | undefined {
  try {
    if (!existsSync(path)) return undefined;
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

function isInside(child: string, root: string): boolean {
  return child === root || child.startsWith(root + sep);
}

/**
 * Returns true when the path escapes the workspace (or cannot be verified).
 * Symlink-aware: existing paths are compared via realpath.
 * Missing workspaceRoot while targetPath is set → escape (fail-closed).
 */
export function pathEscapesWorkspace(
  targetPath: string | undefined,
  workspaceRoot: string | undefined,
): boolean {
  if (!targetPath) return false;
  if (!workspaceRoot) return true;

  const rootResolved = resolve(workspaceRoot);
  const rootReal = safeRealpath(rootResolved) ?? rootResolved;
  const abs = resolve(rootReal, targetPath);

  // Lexical guard first (handles non-existent workspace roots used in unit tests).
  if (!isInside(abs, rootReal) && !isInside(abs, rootResolved)) return true;

  // Walk up only while remaining under the workspace root.
  let existing = abs;
  while (!existsSync(existing)) {
    if (existing === rootReal || existing === rootResolved) break;
    const parent = dirname(existing);
    if (parent === existing) break;
    if (!isInside(parent, rootReal) && !isInside(parent, rootResolved)) break;
    existing = parent;
  }

  if (existsSync(existing)) {
    const existingReal = safeRealpath(existing);
    if (!existingReal || (!isInside(existingReal, rootReal) && !isInside(existingReal, rootResolved))) {
      return true;
    }
  }

  if (existsSync(abs)) {
    const absReal = safeRealpath(abs);
    if (!absReal || (!isInside(absReal, rootReal) && !isInside(absReal, rootResolved))) {
      return true;
    }
  }

  return false;
}

function isShell(req: AuthorityRequest): boolean {
  return req.capability === "shell.execute" || !!req.permissions?.shell;
}

function isWrite(req: AuthorityRequest): boolean {
  return (
    req.capability === "filesystem.write" ||
    req.permissions?.filesystem === "write" ||
    req.capability.endsWith(".write")
  );
}

function isNetwork(req: AuthorityRequest): boolean {
  if (req.capability.startsWith("knowledge.")) return false;
  return !!req.permissions?.network || req.capability.startsWith("browser.");
}

function isHostInspect(req: AuthorityRequest): boolean {
  return req.capability.startsWith("system.") || req.capability.startsWith("knowledge.");
}

function isReadOnlyShape(req: AuthorityRequest): boolean {
  if (isShell(req) || isWrite(req) || isNetwork(req)) return false;
  if (req.side_effects) return false;
  const fs = req.permissions?.filesystem ?? "read";
  return fs === "none" || fs === "read";
}

export function authorize(request: AuthorityRequest): AuthorityResult {
  const ctx = request.context ?? {};
  const flags = {
    confirmed: ctx.confirmed === true,
    allowShell: ctx.allowShell === true,
    allowWrite: ctx.allowWrite === true,
    allowNetwork: ctx.allowNetwork === true,
    allowHostInspect: ctx.allowHostInspect === true,
  };
  const checked_at = new Date().toISOString();

  const build = (decision: AuthorityDecision, reason: string): AuthorityResult => ({
    decision,
    reason,
    checked_at,
    evidence: {
      type: "authority",
      capability: request.capability,
      decision,
      reason,
      permissions: request.permissions,
      context_flags: flags,
    },
  });

  if (request.targetPath && !ctx.workspaceRoot) {
    return build("deny", "workspace_root_required");
  }

  if (pathEscapesWorkspace(request.targetPath, ctx.workspaceRoot)) {
    return build("deny", "path_escape_denied");
  }

  if (request.requires_confirmation && !flags.confirmed && !isShell(request) && !isWrite(request)) {
    return build("confirm", "requires_confirmation");
  }

  if (isShell(request)) {
    if (!flags.allowShell) return build("deny", "shell_denied_by_context");
    return build("allow", "shell_allowed_by_context");
  }

  if (isWrite(request)) {
    if (!flags.allowWrite) return build("deny", "write_denied_by_context");
    return build("allow", "write_allowed_by_context");
  }

  if (isNetwork(request)) {
    if (!flags.allowNetwork) return build("deny", "network_denied_by_context");
    return build("allow", "network_allowed_by_context");
  }

  if (isHostInspect(request)) {
    if (!flags.allowHostInspect) return build("deny", "host_inspect_denied");
    return build("allow", "host_inspect_allowed_by_context");
  }

  if (READ_ONLY_CAPABILITY_ALLOWLIST.has(request.capability) && isReadOnlyShape(request)) {
    return build("allow", "deterministic_read_only");
  }

  if (request.side_effects) {
    if (!flags.allowWrite) return build("deny", "side_effects_denied");
    return build("allow", "side_effects_allowed_by_context");
  }

  return build("deny", "unknown_capability_denied");
}

export class CapabilityAuthority {
  authorize(request: AuthorityRequest): AuthorityResult {
    return authorize(request);
  }
}

export function createCapabilityAuthority(): CapabilityAuthority {
  return new CapabilityAuthority();
}
