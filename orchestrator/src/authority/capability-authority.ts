/**
 * CapabilityAuthority — allow | deny | confirm for operational capabilities.
 * Distinct from PolicyEngine (retries, gates, provider strategy).
 */

import { resolve, dirname, basename, sep } from "node:path";
import * as fs from "node:fs";

export type AuthorityDecision = "allow" | "deny" | "confirm";

export interface AuthorityContext {
  confirmed?: boolean;
  allowShell?: boolean;
  allowWrite?: boolean;
  allowNetwork?: boolean;
  workspaceRoot?: string;
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
  targetPath?: string | string[];
  targetPaths?: string[];
  cwd?: string;
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
    };
  };
}

export function realpathDeepSafe(p: string): string {
  const abs = resolve(p);
  let current = abs;
  const parts: string[] = [];

  while (current && !fs.existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    parts.unshift(basename(current));
    current = parent;
  }

  try {
    if (fs.existsSync(current)) {
      const realCurrent = fs.realpathSync(current);
      return parts.length > 0 ? resolve(realCurrent, ...parts) : realCurrent;
    }
  } catch {
    // fallback
  }

  return abs;
}

export function pathEscapesWorkspace(
  targetPath: string | string[] | undefined,
  workspaceRoot: string | undefined,
): boolean {
  if (!targetPath || !workspaceRoot) return false;
  const pathsToCheck = Array.isArray(targetPath) ? targetPath : [targetPath];
  const realRoot = realpathDeepSafe(workspaceRoot);
  const rootPrefix = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;

  for (const p of pathsToCheck) {
    if (!p) continue;
    // Lexical check first
    const lexicalTarget = resolve(resolve(workspaceRoot), p);
    const lexicalRoot = resolve(workspaceRoot);
    const lexicalPrefix = lexicalRoot.endsWith(sep) ? lexicalRoot : `${lexicalRoot}${sep}`;
    if (lexicalTarget !== lexicalRoot && !lexicalTarget.startsWith(lexicalPrefix)) {
      return true;
    }

    // Physical symlink check
    const realTarget = realpathDeepSafe(lexicalTarget);
    if (realTarget !== realRoot && !realTarget.startsWith(rootPrefix)) {
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

function isReadOnly(req: AuthorityRequest): boolean {
  if (isShell(req) || isWrite(req) || isNetwork(req)) return false;
  if (req.side_effects) return false;
  const fs = req.permissions?.filesystem ?? "read";
  return fs === "none" || fs === "read";
}

export function authorize(request: AuthorityRequest): AuthorityResult {
  const ctx = request.context ?? {};
  const flags = {
    confirmed: !!ctx.confirmed,
    allowShell: !!ctx.allowShell,
    allowWrite: !!ctx.allowWrite,
    allowNetwork: !!ctx.allowNetwork,
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

  const candidatePaths: string[] = [];
  if (Array.isArray(request.targetPaths)) {
    for (const p of request.targetPaths) if (typeof p === "string" && p) candidatePaths.push(p);
  }
  if (Array.isArray(request.targetPath)) {
    for (const p of request.targetPath) if (typeof p === "string" && p) candidatePaths.push(p);
  } else if (typeof request.targetPath === "string" && request.targetPath) {
    candidatePaths.push(request.targetPath);
  }
  if (typeof request.cwd === "string" && request.cwd) {
    candidatePaths.push(request.cwd);
  }

  if (candidatePaths.length > 0 && pathEscapesWorkspace(candidatePaths, ctx.workspaceRoot)) {
    return build("deny", "path_escape_denied");
  }

  if (request.requires_confirmation && !flags.confirmed && !isShell(request) && !isWrite(request)) {
    return build("confirm", "requires_confirmation");
  }

  if (isShell(request)) {
    if (ctx.allowShell === false && !flags.confirmed) {
      return build("deny", "shell_denied_by_context");
    }
    if (flags.allowShell || flags.confirmed) {
      return build("allow", "shell_allowed_by_context");
    }
    return build("confirm", "shell_requires_confirmation");
  }

  if (isWrite(request)) {
    if (ctx.allowWrite === false && !flags.confirmed) {
      return build("deny", "write_denied_by_context");
    }
    if (flags.allowWrite || flags.confirmed) {
      return build("allow", "write_allowed_by_context");
    }
    return build("confirm", "write_requires_confirmation");
  }

  if (isNetwork(request)) {
    if (ctx.allowNetwork === false && !flags.confirmed) {
      return build("deny", "network_denied_by_context");
    }
    if (flags.allowNetwork || flags.confirmed) {
      return build("allow", "network_allowed_by_context");
    }
    return build("confirm", "network_requires_confirmation");
  }

  if (isReadOnly(request)) {
    return build("allow", "deterministic_read_only");
  }

  if (request.side_effects && !flags.confirmed && !flags.allowWrite) {
    return build("confirm", "side_effects_require_confirmation");
  }

  return build("allow", "default_allow");
}

export class CapabilityAuthority {
  authorize(request: AuthorityRequest): AuthorityResult {
    return authorize(request);
  }
}

export function createCapabilityAuthority(): CapabilityAuthority {
  return new CapabilityAuthority();
}
