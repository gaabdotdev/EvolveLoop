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
}

export interface SandboxExecResult {
  kind: "SandboxExecResult";
  backend_id: SandboxBackendId;
  exit_code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
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
