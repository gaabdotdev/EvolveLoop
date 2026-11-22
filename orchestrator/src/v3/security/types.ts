/**
 * V3.5 security model — capabilities, sandbox profiles, and approval triggers.
 * Complements CapabilityAuthority (allow|deny|confirm) with OS-level profiles.
 * Fail-closed: unknown capabilities and missing sandbox backends block execution.
 */

export type CapabilityAction =
  | "filesystem.read"
  | "filesystem.write"
  | "filesystem.delete"
  | "shell.execute"
  | "process.spawn"
  | "network.egress"
  | "package.install"
  | "mcp.invoke"
  | "secrets.read"
  | "secrets.inject"
  | "git.read"
  | "git.mutate"
  | "deploy.publish"
  | "workspace.outside"
  | "sandbox.disable";

export type CapabilityDecision = "allow" | "deny" | "require_approval";

export interface CapabilityGrant {
  action: CapabilityAction;
  decision: CapabilityDecision;
  /** Optional path/prefix/host scope; empty = action-wide under profile. */
  scope?: string;
  reason?: string;
}

export type NetworkMode = "deny" | "allowlist" | "unrestricted";

export interface NetworkPolicy {
  mode: NetworkMode;
  /** Hosts/CIDRs allowed when mode=allowlist. Empty allowlist ≡ deny. */
  allowlist: string[];
}

export interface FilesystemPolicy {
  workspace_rw: string;
  read_only_paths: string[];
  denied_paths: string[];
  /** Protect primary checkout when agent runs in isolated workspace. */
  protect_primary_checkout?: string;
  allow_special_files: boolean;
}

export interface ProcessLimits {
  timeout_ms: number;
  max_output_bytes: number;
  cpu_seconds?: number;
  memory_bytes?: number;
  max_pids?: number;
}

export interface SecretsPolicy {
  /** Never inherit full process.env. */
  inherit_full_env: false;
  env_allowlist: string[];
  /** Secret keys injectable only when approved/scoped. */
  injectable_secret_keys: string[];
  redact_patterns: string[];
}

export interface SandboxProfile {
  kind: "SandboxProfile";
  profile_id: string;
  display_name: string;
  /** When true, missing OS sandbox backend blocks execution (no silent host fallback). */
  require_os_sandbox: boolean;
  filesystem: FilesystemPolicy;
  network: NetworkPolicy;
  process: ProcessLimits;
  secrets: SecretsPolicy;
  capabilities: CapabilityGrant[];
  /** Binaries allowed inside sandbox (empty = use default /usr/bin:/bin PATH only). */
  allowed_binaries?: string[];
  notes: string[];
}

export interface SecurityDecision {
  decision: CapabilityDecision;
  action: CapabilityAction;
  reason: string;
  profile_id: string;
  requires_sandbox: boolean;
  checked_at: string;
}

export const DEFAULT_DENIED_PATHS: string[] = [
  "/home",
  "/root",
  "/etc/shadow",
  "/etc/ssh",
  "/var/run/docker.sock",
  "/run/docker.sock",
];

/**
 * V0-SEC-03 strict allowlist for ExecutionRunner scrubbing.
 * HOME is NOT inherited — runner injects an ephemeral HOME directory.
 * Callers may extend via env_extra_allowlist (still never full process.env).
 */
export const STRICT_ENV_ALLOWLIST: string[] = ["PATH", "LANG", "TERM"];

/** @deprecated Use STRICT_ENV_ALLOWLIST — kept as alias for V0-SEC-03. */
export const DEFAULT_ENV_ALLOWLIST: string[] = [...STRICT_ENV_ALLOWLIST];
