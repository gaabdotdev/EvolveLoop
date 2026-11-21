/**
 * ExecutionRunner — single choke point for external process spawn (V0 Bloco 3).
 */

export interface ExecutionRunnerRequest {
  /** Absolute or workspace-relative argv[0]; resolved via realpath when existing. */
  argv: string[];
  cwd: string;
  /** Workspace root for symlink/realpath confinement. */
  workspace_root: string;
  timeout_ms?: number;
  /** Extra env keys beyond DEFAULT_ENV_ALLOWLIST (still scrubbed — never full process.env). */
  env_extra_allowlist?: string[];
  /** Optional explicit env values for allowlisted keys only. */
  env?: Record<string, string>;
  /** Max bytes kept from stdout/stderr after filter. */
  max_output_bytes?: number;
  /** Redact lines matching these regexes from captured stdout/stderr. */
  stdout_deny_patterns?: RegExp[];
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
  limitations: string[];
}

export interface ExecutionHandle {
  pid: number;
  pgid: number;
  starttime?: string;
  cancel(signal?: NodeJS.Signals): { signalled: boolean; reason: string };
}
