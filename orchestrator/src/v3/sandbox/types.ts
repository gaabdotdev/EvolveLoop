/**
 * Sandbox backend contracts — OS isolation, not git worktree.
 */

import type { SandboxProfile } from "../security/types.js";

export type SandboxBackendId = "bubblewrap" | "unavailable";

export type SandboxAvailability =
  | { available: true; backend_id: SandboxBackendId; version_hint?: string; notes: string[] }
  | { available: false; backend_id: SandboxBackendId; reason: string; notes: string[] };

export interface SandboxExecRequest {
  argv: string[];
  cwd?: string;
  env?: Record<string, string>;
  profile: SandboxProfile;
  /** Injected secrets (never logged). */
  secrets?: Record<string, string>;
  stdin?: string;
  /**
   * Optional approval grant for actions that evaluate to require_approval.
   * Without a matching grant, SandboxManager fail-closes (ISSUE-SEC-C01).
   */
  approval_id?: string;
  work_id?: string;
  /** Capability being authorized when approval_id is supplied (default process.spawn). */
  approval_operation?: string;
  approval_resource?: string;
  /** Abort mid-flight execution (SIGTERM then SIGKILL after graceful_ms). */
  signal?: AbortSignal;
  /** Grace period before escalating cancel to SIGKILL (default 2000). */
  cancel_grace_ms?: number;
}

export interface SandboxExecResult {
  kind: "SandboxExecResult";
  backend_id: SandboxBackendId;
  exit_code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
  /** True when aborted via request.signal (distinct from profile timeout). */
  cancelled?: boolean;
  duration_ms: number;
  pid?: number;
  pgid?: number;
  starttime?: string;
  blocked?: boolean;
  block_reason?: string;
  limitations: string[];
}

export interface SandboxBackend {
  readonly backend_id: SandboxBackendId;
  probe(): SandboxAvailability;
  exec(request: SandboxExecRequest): Promise<SandboxExecResult>;
}
