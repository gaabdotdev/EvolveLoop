/**
 * V1-PROD-01 — Interactive first-run setup for `evolve`.
 * Guided detection, health check, secure credentials (never logged),
 * concurrency/limits, readiness report. Probes are injectable for offline tests.
 */

import { chmodSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export type ProbeStatus = "ok" | "warn" | "missing" | "error";

export interface ProbeResult {
  id: string;
  status: ProbeStatus;
  message: string;
  /** Never include secret values. */
  detail?: Record<string, string | number | boolean | null>;
}

export interface CredentialWriteRequest {
  /** Env var name (e.g. OPENROUTER_API_KEY). */
  name: string;
  /** Secret value — never logged / never echoed into report. */
  value: string;
}

export interface ConcurrencyLimits {
  max_parallel_tasks: number;
  max_agent_sessions: number;
  request_timeout_ms: number;
}

export interface FirstRunSetupInput {
  workspace: string;
  /** Skip interactive prompts; use provided credentials / defaults. */
  non_interactive?: boolean;
  credentials?: CredentialWriteRequest[];
  limits?: Partial<ConcurrencyLimits>;
  /** Injectable probes for unit tests. */
  probes?: () => Promise<ProbeResult[]> | ProbeResult[];
  /** Override credentials file path (tests). */
  credentials_path?: string;
  /** Override limits config path (tests). */
  limits_path?: string;
}

export interface ReadinessReport {
  kind: "EvolveReadinessReport";
  workspace: string;
  ready: boolean;
  checked_at: string;
  probes: ProbeResult[];
  credentials: {
    path: string;
    written: string[];
    /** Always redacted — names only. */
    present_names: string[];
  };
  limits: ConcurrencyLimits;
  message_pt: string;
  limitations: string[];
}

export const DEFAULT_LIMITS: ConcurrencyLimits = {
  max_parallel_tasks: 4,
  max_agent_sessions: 2,
  request_timeout_ms: 300_000,
};

const SECRET_NAME_RE = /key|token|secret|password|credential|auth/i;

/** Redact any string that looks like a secret for log-safe output. */
export function redactSecrets(text: string): string {
  return text
    .replace(/(Bearer\s+)[^\s]+/gi, "$1***")
    .replace(/((?:api[_-]?key|token|secret|password)\s*[=:]\s*)([^\s,;]+)/gi, "$1***")
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, "sk-***");
}

export function credentialsFilePath(workspace: string): string {
  return join(resolve(workspace), ".evolveloop", "credentials.env");
}

export function limitsFilePath(workspace: string): string {
  return join(resolve(workspace), ".evolveloop", "limits.json");
}

function runVersion(cmd: string, args: string[]): ProbeResult {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf-8", timeout: 5000 });
    if (r.error || r.status !== 0) {
      return {
        id: cmd,
        status: "missing",
        message: `${cmd} not available`,
        detail: { exit: r.status ?? -1 },
      };
    }
    const out = redactSecrets((r.stdout || r.stderr || "").trim().split("\n")[0] ?? "");
    return { id: cmd, status: "ok", message: out || `${cmd} ok` };
  } catch (err) {
    return {
      id: cmd,
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Default host probes — safe for offline (failure → missing/warn, never throw). */
export async function defaultFirstRunProbes(workspace: string): Promise<ProbeResult[]> {
  const ws = resolve(workspace);
  const evolveloop = join(ws, ".evolveloop");
  const stateDb = join(evolveloop, "state.db");
  const results: ProbeResult[] = [];

  results.push(runVersion("node", ["-v"]));
  results.push(runVersion("git", ["--version"]));

  results.push({
    id: "workspace",
    status: existsSync(ws) ? "ok" : "missing",
    message: existsSync(ws) ? `workspace=${ws}` : "workspace missing",
    detail: { path: ws },
  });

  results.push({
    id: "evolveloop_dir",
    status: existsSync(evolveloop) ? "ok" : "warn",
    message: existsSync(evolveloop)
      ? ".evolveloop present"
      : ".evolveloop will be created on first write",
  });

  results.push({
    id: "state_db",
    status: existsSync(stateDb) ? "ok" : "warn",
    message: existsSync(stateDb) ? "state.db present" : "state.db not yet created",
  });

  // Health checks that may be down — must not crash setup
  for (const probe of [
    { id: "ollama", url: process.env.EVOLVELOOP_OLLAMA_URL || "http://127.0.0.1:11434/api/tags" },
    {
      id: "freellmapi",
      url: (process.env.EVOLVELOOP_FREELLMAPI_URL || "http://127.0.0.1:3001/v1").replace(/\/$/, "") + "/models",
    },
  ]) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(probe.url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
      results.push({
        id: probe.id,
        status: res.ok ? "ok" : "warn",
        message: res.ok ? `${probe.id} reachable` : `${probe.id} HTTP ${res.status}`,
        detail: { url: probe.url.replace(/\/\/[^/]+@/, "//***@") },
      });
    } catch {
      results.push({
        id: probe.id,
        status: "warn",
        message: `${probe.id} unreachable (optional)`,
        detail: { url: probe.url },
      });
    }
  }

  const credPath = credentialsFilePath(ws);
  const present = listCredentialNames(credPath);
  results.push({
    id: "credentials",
    status: present.length > 0 ? "ok" : "warn",
    message:
      present.length > 0
        ? `credentials file has ${present.length} key(s) (values redacted)`
        : "no credentials.env yet",
    detail: { names: present.join(",") || null },
  });

  return results;
}

export function listCredentialNames(path: string): string[] {
  if (!existsSync(path)) return [];
  const names: string[] = [];
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) names.push(trimmed.slice(0, eq));
  }
  return names;
}

/**
 * Write credentials to a 0600 file. Values never appear in returned report fields
 * beyond the key names.
 */
export function writeCredentialsSecure(
  path: string,
  credentials: CredentialWriteRequest[],
): { path: string; written: string[] } {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
  const map = new Map<string, string>();
  for (const line of existing.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) map.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  const written: string[] = [];
  for (const c of credentials) {
    if (!c.name?.trim() || c.value == null) continue;
    if (!/^[A-Z][A-Z0-9_]*$/i.test(c.name)) {
      throw new Error(`invalid credential name: ${c.name}`);
    }
    map.set(c.name, c.value);
    written.push(c.name);
  }
  const body =
    "# EvolveLoop credentials — DO NOT COMMIT; mode 0600\n" +
    [...map.entries()].map(([k, v]) => `${k}=${v}`).join("\n") +
    "\n";
  writeFileSync(path, body, { encoding: "utf-8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best-effort on platforms without chmod */
  }
  return { path, written };
}

export function writeLimitsConfig(path: string, limits: ConcurrencyLimits): ConcurrencyLimits {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, JSON.stringify(limits, null, 2) + "\n", "utf-8");
  return limits;
}

export function buildReadinessReport(input: {
  workspace: string;
  probes: ProbeResult[];
  credentials: ReadinessReport["credentials"];
  limits: ConcurrencyLimits;
}): ReadinessReport {
  const hardFail = input.probes.some((p) => p.id === "node" && p.status !== "ok");
  const ready = !hardFail && input.probes.some((p) => p.id === "workspace" && p.status === "ok");
  const warnCount = input.probes.filter((p) => p.status === "warn" || p.status === "missing").length;
  return {
    kind: "EvolveReadinessReport",
    workspace: resolve(input.workspace),
    ready,
    checked_at: new Date().toISOString(),
    probes: input.probes.map((p) => ({
      ...p,
      message: redactSecrets(p.message),
    })),
    credentials: input.credentials,
    limits: input.limits,
    message_pt: ready
      ? warnCount > 0
        ? `Pronto com avisos (${warnCount}). Credenciais nunca aparecem em logs.`
        : "Pronto. Setup concluído."
      : "Não pronto — Node/workspace em falta.",
    limitations: [
      "Optional backends (Ollama/FreeLLMAPI) may be down without blocking setup",
      "Credential values never appear in readiness report or probe messages",
      SECRET_NAME_RE.source.includes("key")
        ? "Secrets matched by name heuristics are redacted in probe text"
        : "redaction active",
    ],
  };
}

export async function runFirstRunSetup(input: FirstRunSetupInput): Promise<ReadinessReport> {
  const workspace = resolve(input.workspace);
  mkdirSync(join(workspace, ".evolveloop"), { recursive: true });

  const probes = await Promise.resolve(
    input.probes ? input.probes() : defaultFirstRunProbes(workspace),
  );

  const credPath = input.credentials_path ?? credentialsFilePath(workspace);
  let written: string[] = [];
  if (input.credentials?.length) {
    const r = writeCredentialsSecure(credPath, input.credentials);
    written = r.written;
  }
  const present_names = listCredentialNames(credPath);

  const limits: ConcurrencyLimits = {
    ...DEFAULT_LIMITS,
    ...input.limits,
  };
  const limPath = input.limits_path ?? limitsFilePath(workspace);
  writeLimitsConfig(limPath, limits);

  return buildReadinessReport({
    workspace,
    probes,
    credentials: {
      path: credPath,
      written,
      present_names,
    },
    limits,
  });
}
