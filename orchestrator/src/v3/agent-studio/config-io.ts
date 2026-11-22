/**
 * V5-M09 — load/save/import/export AgentConfig without secrets.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  AGENT_STUDIO_SCHEMA_VERSION,
  SECRET_FIELD_NAMES,
  type AgentConfig,
} from "./schema.js";

export class AgentStudioError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AgentStudioError";
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** Recursively strip secret-like keys; returns { cleaned, stripped_keys }. */
export function stripSecrets(value: unknown): {
  cleaned: unknown;
  stripped_keys: string[];
} {
  const stripped_keys: string[] = [];
  const secretSet = new Set(
    SECRET_FIELD_NAMES.map((s) => s.toLowerCase()),
  );

  function walk(v: unknown, path: string): unknown {
    if (Array.isArray(v)) {
      return v.map((item, i) => walk(item, `${path}[${i}]`));
    }
    if (!isPlainObject(v)) return v;
    const out: Record<string, unknown> = {};
    for (const [k, child] of Object.entries(v)) {
      const lower = k.toLowerCase();
      if (
        secretSet.has(lower) ||
        lower.endsWith("_secret") ||
        lower.endsWith("_password") ||
        lower.endsWith("_token") ||
        lower.endsWith("_api_key")
      ) {
        stripped_keys.push(path ? `${path}.${k}` : k);
        continue;
      }
      out[k] = walk(child, path ? `${path}.${k}` : k);
    }
    return out;
  }

  return { cleaned: walk(value, ""), stripped_keys };
}

export function parseAgentConfig(raw: unknown): AgentConfig {
  if (!isPlainObject(raw)) {
    throw new AgentStudioError("INVALID", "AgentConfig must be an object");
  }
  const { cleaned, stripped_keys } = stripSecrets(raw);
  const o = cleaned as Record<string, unknown>;
  const name = String(o.name ?? "").trim();
  const adapter = String(o.adapter ?? "").trim();
  if (!name) throw new AgentStudioError("INVALID", "name required");
  if (!adapter) throw new AgentStudioError("INVALID", "adapter required");

  const tools = o.tools_allowlist ?? o.toolsAllowlist ?? [];
  if (!Array.isArray(tools)) {
    throw new AgentStudioError("INVALID", "tools_allowlist must be array");
  }

  const caps = o.capabilities_claimed ?? o.capabilitiesClaimed;
  const config: AgentConfig = {
    kind: "AgentConfig",
    schema_version: String(o.schema_version ?? AGENT_STUDIO_SCHEMA_VERSION),
    name,
    adapter,
    model_ref:
      typeof o.model_ref === "string"
        ? o.model_ref
        : typeof o.modelRef === "string"
          ? o.modelRef
          : undefined,
    tools_allowlist: tools.map((t) => String(t)),
    limits: isPlainObject(o.limits)
      ? (o.limits as AgentConfig["limits"])
      : undefined,
    capabilities_claimed: isPlainObject(caps)
      ? (caps as AgentConfig["capabilities_claimed"])
      : undefined,
    role: typeof o.role === "string" ? o.role : undefined,
    notes: [
      ...(Array.isArray(o.notes) ? o.notes.map(String) : []),
      ...(stripped_keys.length
        ? [`stripped_secret_fields:${stripped_keys.join(",")}`]
        : []),
    ],
  };
  return config;
}

export function loadAgentConfig(filePath: string): AgentConfig {
  const path = resolve(filePath);
  if (!existsSync(path)) {
    throw new AgentStudioError("NOT_FOUND", path);
  }
  const text = readFileSync(path, "utf-8");
  const ext = extname(path).toLowerCase();
  let raw: unknown;
  if (ext === ".yaml" || ext === ".yml") {
    raw = parseYaml(text);
  } else {
    raw = JSON.parse(text);
  }
  return parseAgentConfig(raw);
}

export function saveAgentConfig(
  filePath: string,
  config: AgentConfig,
): { path: string; stripped_keys: string[] } {
  const path = resolve(filePath);
  mkdirSync(dirname(path), { recursive: true });
  const { cleaned, stripped_keys } = stripSecrets(config);
  const body =
    extname(path).toLowerCase() === ".json"
      ? JSON.stringify(cleaned, null, 2) + "\n"
      : stringifyYaml(cleaned);
  writeFileSync(path, body, { encoding: "utf-8", mode: 0o600 });
  return { path, stripped_keys };
}

/** Import from arbitrary JSON/YAML text — secrets stripped. */
export function importAgentConfig(text: string, format: "json" | "yaml"): AgentConfig {
  const raw = format === "json" ? JSON.parse(text) : parseYaml(text);
  return parseAgentConfig(raw);
}

/** Export sanitized JSON (never includes secrets). */
export function exportAgentConfig(
  config: AgentConfig,
  format: "json" | "yaml" = "json",
): string {
  const { cleaned } = stripSecrets(config);
  if (format === "yaml") return stringifyYaml(cleaned);
  return JSON.stringify(cleaned, null, 2) + "\n";
}

export function agentConfigPath(studioDir: string, name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return join(studioDir, "agents", `${safe}.yaml`);
}
