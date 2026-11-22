/**
 * V1-SEC-01 — Landlock probe + policy interface.
 *
 * Node has no first-party Landlock binding. We expose a portable policy builder
 * and host capability probe. Enforcement on Linux today is via bubblewrap
 * namespaces; Landlock rules are carried for future/native backends.
 *
 * GAP: applying Landlock ABI from JS requires a native addon or seccomp helper
 * not shipped in this tree — probe reports `enforceable: false` until then.
 */

import { existsSync, readFileSync } from "node:fs";

export interface LandlockPathRule {
  path: string;
  access: "ro" | "rw" | "deny";
}

export interface LandlockPolicy {
  kind: "LandlockPolicy";
  /** ABI version requested (Landlock v1+). */
  abi: number;
  rules: LandlockPathRule[];
  notes: string[];
}

export interface LandlockProbeResult {
  kind: "LandlockProbe";
  kernel_supported: boolean;
  headers_present: boolean;
  enforceable: boolean;
  reason: string;
  gaps: string[];
}

/** Default V1-SEC-01 policy: workspace RW, system RO, isolate home/ssh. */
export function buildDefaultLandlockPolicy(workspaceRw: string): LandlockPolicy {
  return {
    kind: "LandlockPolicy",
    abi: 3,
    rules: [
      { path: workspaceRw, access: "rw" },
      { path: "/usr", access: "ro" },
      { path: "/bin", access: "ro" },
      { path: "/lib", access: "ro" },
      { path: "/lib64", access: "ro" },
      { path: "/etc", access: "ro" },
      { path: "/home", access: "deny" },
      { path: `${process.env.HOME ?? "/home"}/.ssh`, access: "deny" },
      { path: "/root", access: "deny" },
    ],
    notes: [
      "Policy intended for Landlock filesystem rules",
      "Current runtime enforces equivalent isolation via bwrap binds (no /home, no ~/.ssh)",
    ],
  };
}

export function probeLandlock(): LandlockProbeResult {
  const gaps: string[] = [];
  let kernel_supported = false;
  try {
    const lsm = readFileSync("/sys/kernel/security/lsm", "utf-8");
    kernel_supported = /\blandlock\b/i.test(lsm);
    if (!kernel_supported) gaps.push("landlock_not_in_lsm_list");
  } catch {
    gaps.push("cannot_read_sys_kernel_security_lsm");
  }

  const headers_present = existsSync("/usr/include/linux/landlock.h");
  if (!headers_present) gaps.push("landlock_headers_missing");

  // No native enforce path in this package.
  gaps.push("no_nodejs_landlock_binding");

  return {
    kind: "LandlockProbe",
    kernel_supported,
    headers_present,
    enforceable: false,
    reason: "landlock_policy_available_enforcement_via_bwrap_only",
    gaps,
  };
}
