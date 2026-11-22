/**
 * Agent Handles preference — default OFF (ADR Q3 / D3).
 * Profile + optional workspace `.evolveloop/config.yaml` override.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  loadEvolveLoopProfile,
  type ConfigIssue,
  type EvolveLoopProfile,
} from "../../config/profile.js";

export interface AgentHandlesPreference {
  enabled: boolean;
  source: "default" | "profile" | "workspace" | "env";
}

const ENV_KEY = "EVOLVELOOP_AGENT_HANDLES";

/** Short consequence copy for prefs / setup (V4.2 P0-1 / P0-3). */
export const HANDLES_CONSEQUENCE_OFF =
  "OFF: sem janelas/sessões auxiliares; jornada TUI completa; attach soft-fail.";
export const HANDLES_CONSEQUENCE_ON =
  "ON: attach/logs podem abrir tmux/Zellij/CLI; Task não falha se backend ausente.";

export function workspaceConfigPath(workspace: string): string {
  return join(resolve(workspace), ".evolveloop", "config.yaml");
}

export interface YamlReadResult {
  data: Record<string, unknown> | null;
  /** Empty when file missing or OK. */
  issues: ConfigIssue[];
}

function readYamlFile(path: string): Record<string, unknown> | null {
  return readYamlFileDetailed(path).data;
}

/** Read workspace/profile YAML with actionable issues (no silent swallow for callers that care). */
export function readYamlFileDetailed(path: string): YamlReadResult {
  if (!existsSync(path)) return { data: null, issues: [] };
  try {
    const raw = parseYaml(readFileSync(path, "utf-8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return { data: raw as Record<string, unknown>, issues: [] };
    }
    return {
      data: null,
      issues: [
        {
          severity: "error",
          file: path,
          key: "(root)",
          message: "YAML não é um objeto (mapa chave→valor).",
          fix: "Use um documento YAML com chaves de topo (ex.: agent_handles.enabled).",
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      data: null,
      issues: [
        {
          severity: "error",
          file: path,
          key: "(parse)",
          message: `YAML inválido: ${msg}`,
          fix: "Corrigir sintaxe YAML no ficheiro indicado (indentação, aspas, :).",
        },
      ],
    };
  }
}

function boolFromUnknown(v: unknown): boolean | undefined {
  if (v === true || v === false) return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "on" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "off" || s === "no") return false;
  }
  return undefined;
}

/**
 * Resolve Handles preference. Precedence: env → workspace config → profile → default false.
 */
export function resolveAgentHandlesPreference(opts?: {
  workspace?: string;
  profile?: EvolveLoopProfile;
}): AgentHandlesPreference {
  const env = process.env[ENV_KEY]?.trim();
  if (env) {
    const b = boolFromUnknown(env);
    if (b !== undefined) return { enabled: b, source: "env" };
  }

  if (opts?.workspace) {
    const cfg = readYamlFile(workspaceConfigPath(opts.workspace));
    if (cfg) {
      const block = (cfg.agent_handles ?? cfg.agentHandles) as
        | Record<string, unknown>
        | undefined;
      const fromBlock = block ? boolFromUnknown(block.enabled) : undefined;
      const flat = boolFromUnknown(cfg["agent_handles.enabled"]);
      const v = fromBlock ?? flat;
      if (v !== undefined) return { enabled: v, source: "workspace" };
    }
  }

  const profile = opts?.profile ?? loadEvolveLoopProfile();
  const pref = profile.preferences?.agent_handles?.enabled;
  if (pref !== undefined) {
    return { enabled: Boolean(pref), source: "profile" };
  }

  return { enabled: false, source: "default" };
}

export function isAgentHandlesEnabled(opts?: {
  workspace?: string;
  profile?: EvolveLoopProfile;
}): boolean {
  return resolveAgentHandlesPreference(opts).enabled;
}

/** Persist workspace override (does not rewrite profile). */
export function writeWorkspaceAgentHandles(
  workspace: string,
  enabled: boolean,
): string {
  const path = workspaceConfigPath(workspace);
  mkdirSync(dirname(path), { recursive: true });
  const existing = readYamlFile(path) ?? {};
  const next = {
    ...existing,
    agent_handles: {
      ...((existing.agent_handles as Record<string, unknown>) ?? {}),
      enabled,
    },
  };
  writeFileSync(path, yamlish(next), { encoding: "utf-8", mode: 0o600 });
  return path;
}

function yamlish(obj: Record<string, unknown>): string {
  const lines: string[] = ["# EvolveLoop workspace config (local)"];
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) {
        lines.push(`  ${ik}: ${formatScalar(iv)}`);
      }
    } else {
      lines.push(`${k}: ${formatScalar(v)}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function formatScalar(v: unknown): string {
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  if (v == null) return "null";
  const s = String(v);
  if (/[:#\n]/.test(s) || s.includes(" ")) return JSON.stringify(s);
  return s;
}
