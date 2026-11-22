/**
 * ExecutionRunner — single choke point for external process spawn (V0-SEC-01).
 */

import type { CapabilityAction, SandboxProfile } from "../security/types.js";
import type { AuthorityContext } from "../../authority/capability-authority.js";

export interface ExecutionRunnerRequest {
  /** Absolute or workspace-relative argv[0]; resolved via realpath when existing. */
  argv: string[];
  cwd: string;
  /** Workspace root for symlink/realpath confinement. */
  workspace_root: string;
  timeout_ms?: number;
  /** Extra env keys beyond STRICT_ENV_ALLOWLIST (still scrubbed — never full process.env). */
  env_extra_allowlist?: string[];
  /** Optional explicit env values for allowlisted keys only. */
  env?: Record<string, string>;
  /** Max bytes kept from stdout/stderr after filter + redaction. */
  max_output_bytes?: number;
  /** Redact lines matching these regexes from captured stdout/stderr. */
  stdout_deny_patterns?: RegExp[];
  /**
   * Optional capability to check before spawn (V0-SEC-05).
   * When set, Capability Gate default-denies destructive/sensitive → blocked.
   */
  capability?: CapabilityAction;
  profile?: SandboxProfile;
  authority?: AuthorityContext;
  /** Caller already obtained approval for require_approval capabilities. */
  capability_approved?: boolean;
  /** Grace period before SIGKILL after SIGTERM (default 2000). */
  kill_grace_ms?: number;
  /**
   * When true, inherit real HOME (still only if "HOME" is allowlisted via env_extra).
   * Default false → ephemeral HOME (V0-SEC-03).
   */
  inherit_home?: boolean;
  /**
   * V1-SEC-01 — wrap spawn in bubblewrap (workspace RW, system RO, isolate /home+ssh).
   * Fail-closed: any truthy value (true | "require") blocks when bwrap is unavailable.
   * Silent host fallback is forbidden (AUD-STUB-01).
   */
  os_sandbox?: boolean | "require";
  /** V1-SEC-03 — force --unshare-net inside os_sandbox wrap. */
  unshare_net?: boolean;
}

export interface ExecutionRunnerResult {
  kind: "ExecutionRunnerResult";
  status: "ok" | "timeout" | "failed" | "cancelled" | "blocked";
  code: string;
  exit_code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
  pid?: number;
  pgid?: number;
  argv: string[];
  cwd: string;
  ephemeral_home?: string;
  /** Present when os_sandbox wrap was planned/applied. */
  os_sandbox?: {
    used: boolean;
    backend: "bubblewrap" | "none";
    isolates_home?: boolean;
    isolates_ssh?: boolean;
    gaps?: string[];
  };
  limitations: string[];
}

export interface ExecutionHandle {
  pid: number;
  pgid: number;
  starttime?: string;
  cancel(signal?: NodeJS.Signals): { signalled: boolean; reason: string };
}

/**
 * V0-SEC-01 — single ExecutionRunner interface/port.
 * All external execution must go through an implementation of this contract.
 * (Named *Port so it does not clash with the `ExecutionRunner` class value.)
 */
export interface ExecutionRunnerPort {
  run(req: ExecutionRunnerRequest): Promise<ExecutionRunnerResult>;
  /** Short deterministic ops (git status/diff) — same path/env/gate pipeline. */
  runSync(req: ExecutionRunnerRequest): ExecutionRunnerResult;
  cancel(pid: number, signal?: NodeJS.Signals): { signalled: boolean; reason: string };
}

/** Canonical interface name from V0 metas (== ExecutionRunnerPort). */
export type ExecutionRunner = ExecutionRunnerPort;
