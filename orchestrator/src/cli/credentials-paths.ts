/**
 * V4.2 P2-4 — canonical credential paths + precedence (doc surface).
 * Setup writes workspace credentials.env; Provider TUI writes user secrets.env.
 */

import { join } from "node:path";
import { evolveloopSecretsPath } from "../v3/evolve-shell/provider-readiness.js";
import { credentialsFilePath } from "../v3/evolve-shell/first-run-setup.js";

export interface CredentialsCanonicalPaths {
  /** Workspace-scoped setup file (0600). */
  setup_credentials_env: string;
  /** User-scoped Provider TUI / FreeLLM secrets (0600). */
  provider_secrets_env: string;
  /** Human lines for help / readiness. */
  lines: string[];
}

/** Resolve canonical paths for a workspace (and optional home override in tests). */
export function resolveCredentialsCanonicalPaths(
  workspace: string,
  home?: string,
): CredentialsCanonicalPaths {
  const setup_credentials_env = credentialsFilePath(workspace);
  const provider_secrets_env = evolveloopSecretsPath(home);
  return {
    setup_credentials_env,
    provider_secrets_env,
    lines: formatCredentialsCanonicalLines({
      setup_credentials_env,
      provider_secrets_env,
    }),
  };
}

export function formatCredentialsCanonicalLines(paths?: {
  setup_credentials_env?: string;
  provider_secrets_env?: string;
}): string[] {
  const setup =
    paths?.setup_credentials_env ??
    join("<workspace>", ".evolveloop", "credentials.env");
  const secrets =
    paths?.provider_secrets_env ?? "~/.config/evolveloop/secrets.env";
  return [
    `Setup canónico (evolve setup): ${setup} (0600)`,
    `Provider TUI / FreeLLM: ${secrets} (0600)`,
    "Precedência FreeLLM key: env FREELLMAPI_API_KEY | EVOLVELOOP_FREELLMAPI_API_KEY > secrets.env",
    "Não unificar ficheiros nesta fatia — precedência explícita; valores nunca em logs",
  ];
}
