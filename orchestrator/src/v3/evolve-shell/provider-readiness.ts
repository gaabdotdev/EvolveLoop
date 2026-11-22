/**
 * Inline provider readiness before accepting tasks (TTY).
 * Keys go only under ~/.config/evolveloop/ with mode 0600 — never logged.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createV1FreeLLMAPI } from "../model-providers/index.js";

export type ProviderReadinessChoice =
  | "freellm_key"
  | "ollama"
  | "other_key"
  | "skip_non_interactive";

export interface ProviderReadinessSnapshot {
  ollama_up: boolean;
  freellm_reachable: boolean;
  freellm_has_key: boolean;
  freellm_needs_key: boolean;
  /** At least one provider ready for MSO. */
  ready: boolean;
  summary: string;
}

export function evolveloopConfigDir(home = homedir()): string {
  return join(home, ".config", "evolveloop");
}

export function evolveloopSecretsPath(home = homedir()): string {
  return join(evolveloopConfigDir(home), "secrets.env");
}

function httpOk(url: string, timeoutMs = 1500): boolean {
  const r = spawnSync(
    "curl",
    ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--connect-timeout", "1", "--max-time", "2", url],
    { encoding: "utf-8", timeout: timeoutMs + 500 },
  );
  const code = Number((r.stdout ?? "").trim());
  return Number.isFinite(code) && code > 0 && code < 500;
}

export function readFreellmKeyFromSecrets(path = evolveloopSecretsPath()): string | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const raw = readFileSync(path, "utf-8");
    const m = raw.match(/^(?:export\s+)?FREELLMAPI_(?:API_)?KEY\s*=\s*(.+)$/m);
    const v = m?.[1]?.trim().replace(/^["']|["']$/g, "");
    return v || undefined;
  } catch {
    return undefined;
  }
}

/** Persist API key to ~/.config/evolveloop/secrets.env (0600). Never log the value. */
export function writeFreellmKeySecure(
  key: string,
  path = evolveloopSecretsPath(),
): { path: string; name: string } {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("empty API key");
  mkdirSync(dirname(path), { recursive: true });
  const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
  const lines = existing
    .split("\n")
    .filter((l) => l.trim() && !/^(?:export\s+)?FREELLMAPI_(?:API_)?KEY\s*=/.test(l));
  if (!lines[0]?.startsWith("#")) {
    lines.unshift("# EvolveLoop secrets — DO NOT COMMIT; mode 0600");
  }
  lines.push(`FREELLMAPI_API_KEY=${trimmed}`);
  writeFileSync(path, lines.join("\n") + "\n", { encoding: "utf-8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best-effort */
  }
  return { path, name: "FREELLMAPI_API_KEY" };
}

export function probeProviderReadiness(opts?: {
  ollama_url?: string;
  freellm_models_url?: string;
  secrets_path?: string;
}): ProviderReadinessSnapshot {
  const ollamaUrl = opts?.ollama_url ?? "http://127.0.0.1:11434/api/tags";
  const freellmUrl =
    opts?.freellm_models_url ??
    ((process.env.EVOLVELOOP_FREELLMAPI_URL || "http://127.0.0.1:3001/v1").replace(/\/$/, "") +
      "/models");
  const secrets = opts?.secrets_path ?? evolveloopSecretsPath();
  const ollama_up = httpOk(ollamaUrl);
  const freellm_reachable = httpOk(freellmUrl);
  const freellm_has_key = Boolean(readFreellmKeyFromSecrets(secrets) || process.env.FREELLMAPI_API_KEY || process.env.EVOLVELOOP_FREELLMAPI_API_KEY);
  const freellm_needs_key = freellm_reachable && !freellm_has_key;
  const ready = ollama_up || (freellm_reachable && freellm_has_key);
  const parts: string[] = [];
  if (ollama_up) parts.push("Ollama");
  if (freellm_reachable && freellm_has_key) parts.push("FreeLLMAPI");
  else if (freellm_needs_key) parts.push("FreeLLMAPI(needsKey)");
  return {
    ollama_up,
    freellm_reachable,
    freellm_has_key,
    freellm_needs_key,
    ready,
    summary: parts.length ? parts.join(" · ") : "UNAVAILABLE",
  };
}

/** True when FreeLLMAPI(needsKey) and no other ready provider. */
export function needsInlineProviderSetup(snap: ProviderReadinessSnapshot): boolean {
  return snap.freellm_needs_key && !snap.ollama_up && !snap.freellm_has_key;
}

/**
 * Ping FreeLLMAPI with the given key (or env). Returns ok + redacted message.
 */
export async function pingFreellmWithKey(key: string): Promise<{ ok: boolean; message: string }> {
  const provider = createV1FreeLLMAPI({
    apiKey: key,
    env: { ...process.env, FREELLMAPI_API_KEY: key, EVOLVELOOP_FREELLMAPI_API_KEY: key },
  });
  try {
    const catalog = await provider.discoverCatalog();
    if (catalog.state === "needsKey") {
      return { ok: false, message: "FreeLLMAPI rejeitou a chave (needsKey)" };
    }
    if (catalog.state === "unreachable") {
      return { ok: false, message: "FreeLLMAPI inalcançável" };
    }
    return { ok: true, message: `FreeLLMAPI ok (${catalog.models.length} modelos)` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function pingOllamaLocal(url = "http://127.0.0.1:11434/api/tags"): {
  ok: boolean;
  message: string;
} {
  if (httpOk(url)) return { ok: true, message: "Ollama local pronto (localhost:11434)" };
  return { ok: false, message: "Ollama não respondeu em localhost:11434" };
}
