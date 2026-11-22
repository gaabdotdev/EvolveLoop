/**
 * Built-in sandbox profiles for V3.5.
 */

import {
  DEFAULT_DENIED_PATHS,
  DEFAULT_ENV_ALLOWLIST,
  type SandboxProfile,
} from "./types.js";

export function agentWorkspaceProfile(workspaceRw: string, primaryCheckout?: string): SandboxProfile {
  return {
    kind: "SandboxProfile",
    profile_id: "agent-workspace",
    display_name: "Agent isolated workspace (no network)",
    require_os_sandbox: true,
    filesystem: {
      workspace_rw: workspaceRw,
      read_only_paths: ["/usr", "/bin", "/lib", "/lib64", "/etc/ssl", "/etc/passwd", "/etc/nsswitch.conf"],
      denied_paths: [...DEFAULT_DENIED_PATHS, ...(primaryCheckout ? [primaryCheckout] : [])],
      protect_primary_checkout: primaryCheckout,
      allow_special_files: false,
    },
    network: { mode: "deny", allowlist: [] },
    process: {
      timeout_ms: 300_000,
      max_output_bytes: 2_000_000,
      memory_bytes: 512 * 1024 * 1024,
      max_pids: 64,
    },
    secrets: {
      inherit_full_env: false,
      env_allowlist: [...DEFAULT_ENV_ALLOWLIST],
      injectable_secret_keys: [],
      redact_patterns: ["(?i)(api[_-]?key|token|secret|password)\\s*[=:]\\s*\\S+"],
    },
    capabilities: [
      { action: "filesystem.read", decision: "allow" },
      { action: "filesystem.write", decision: "allow" },
      { action: "shell.execute", decision: "allow", reason: "tests/build inside sandbox" },
      { action: "process.spawn", decision: "allow" },
      { action: "git.read", decision: "allow" },
      { action: "network.egress", decision: "deny" },
      { action: "package.install", decision: "require_approval" },
      { action: "secrets.read", decision: "deny" },
      { action: "secrets.inject", decision: "require_approval" },
      { action: "git.mutate", decision: "require_approval" },
      { action: "deploy.publish", decision: "require_approval" },
      { action: "workspace.outside", decision: "deny" },
      { action: "mcp.invoke", decision: "require_approval" },
      { action: "sandbox.disable", decision: "deny" },
      { action: "filesystem.delete", decision: "require_approval" },
    ],
    notes: [
      "OS sandbox required — no silent host fallback",
      "Network denied by default",
      "Primary checkout protected when provided",
    ],
  };
}

export function harnessProviderProfile(workspaceRw: string): SandboxProfile {
  return {
    kind: "SandboxProfile",
    profile_id: "harness-provider",
    display_name: "Harness/provider process (network for API)",
    require_os_sandbox: true,
    filesystem: {
      workspace_rw: workspaceRw,
      read_only_paths: ["/usr", "/bin", "/lib", "/lib64", "/etc/ssl", "/etc/passwd", "/etc/nsswitch.conf", "/etc/resolv.conf"],
      denied_paths: [...DEFAULT_DENIED_PATHS],
      allow_special_files: false,
    },
    network: { mode: "allowlist", allowlist: ["*"] },
    process: {
      timeout_ms: 600_000,
      max_output_bytes: 4_000_000,
      memory_bytes: 1024 * 1024 * 1024,
      max_pids: 128,
    },
    secrets: {
      inherit_full_env: false,
      env_allowlist: [...DEFAULT_ENV_ALLOWLIST, "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"],
      injectable_secret_keys: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "CURSOR_API_KEY"],
      redact_patterns: ["(?i)(api[_-]?key|token|secret|password)\\s*[=:]\\s*\\S+"],
    },
    capabilities: [
      { action: "filesystem.read", decision: "allow" },
      { action: "filesystem.write", decision: "allow" },
      { action: "shell.execute", decision: "allow" },
      { action: "process.spawn", decision: "allow" },
      { action: "network.egress", decision: "allow", reason: "provider API" },
      { action: "secrets.inject", decision: "require_approval" },
      { action: "package.install", decision: "require_approval" },
      { action: "deploy.publish", decision: "deny" },
      { action: "workspace.outside", decision: "deny" },
      { action: "sandbox.disable", decision: "deny" },
      { action: "git.read", decision: "allow" },
      { action: "git.mutate", decision: "require_approval" },
      { action: "filesystem.delete", decision: "require_approval" },
      { action: "mcp.invoke", decision: "require_approval" },
      { action: "secrets.read", decision: "deny" },
    ],
    notes: [
      "Separates harness network from task subprocess network",
      "Secrets still require scoped approval/injection",
    ],
  };
}

export function listBuiltinProfiles(): Array<{ profile_id: string; display_name: string; require_os_sandbox: boolean }> {
  const a = agentWorkspaceProfile("/tmp/workspace-placeholder");
  const h = harnessProviderProfile("/tmp/workspace-placeholder");
  return [
    { profile_id: a.profile_id, display_name: a.display_name, require_os_sandbox: a.require_os_sandbox },
    { profile_id: h.profile_id, display_name: h.display_name, require_os_sandbox: h.require_os_sandbox },
  ];
}
