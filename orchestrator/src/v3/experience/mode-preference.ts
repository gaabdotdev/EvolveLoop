/**
 * V5-M07 — Simple vs Advanced UX preference (workspace-persisted).
 * Maps to existing help layers: simple → journey; advanced → help advanced.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

export type ExperienceMode = "simple" | "advanced";

export interface ExperienceModePreference {
  kind: "ExperienceModePreference";
  mode: ExperienceMode;
  source: "default" | "workspace" | "env";
  /** Help layer this mode selects. */
  help_layer: "journey" | "advanced";
  path?: string;
}

const ENV_KEY = "EVOLVELOOP_EXPERIENCE_MODE";

export function workspaceConfigPath(workspace: string): string {
  return join(resolve(workspace), ".evolveloop", "config.yaml");
}

/** Documented mapping — Simple = journey help; Advanced = full group map. */
export const EXPERIENCE_HELP_LAYERS = {
  simple: {
    mode: "simple" as const,
    help_layer: "journey" as const,
    cli: "evolve help",
    description: "Jornada cotidiana (Task/Session/Work show|list|status)",
  },
  advanced: {
    mode: "advanced" as const,
    help_layer: "advanced" as const,
    cli: "evolve help advanced",
    description: "Mapa completo L2/legado (circuit, adapters, battery, …)",
  },
} as const;

function readYaml(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const raw = parseYaml(readFileSync(path, "utf-8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
  } catch {
    /* ignore parse errors — caller may validate via config validate */
  }
  return null;
}

function parseMode(raw: unknown): ExperienceMode | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim().toLowerCase();
  if (s === "simple" || s === "journey" || s === "everyday") return "simple";
  if (s === "advanced" || s === "full" || s === "expert") return "advanced";
  return undefined;
}

/**
 * Resolve experience mode. Precedence: env → workspace config → default simple.
 */
export function resolveExperienceMode(opts?: {
  workspace?: string;
}): ExperienceModePreference {
  const env = process.env[ENV_KEY]?.trim();
  if (env) {
    const m = parseMode(env);
    if (m) {
      return {
        kind: "ExperienceModePreference",
        mode: m,
        source: "env",
        help_layer: EXPERIENCE_HELP_LAYERS[m].help_layer,
      };
    }
  }

  if (opts?.workspace) {
    const path = workspaceConfigPath(opts.workspace);
    const cfg = readYaml(path);
    if (cfg) {
      const block = (cfg.experience ?? cfg.ux) as
        | Record<string, unknown>
        | undefined;
      const fromBlock = block ? parseMode(block.mode) : undefined;
      const flat = parseMode(cfg["experience.mode"]);
      const mode = fromBlock ?? flat;
      if (mode) {
        return {
          kind: "ExperienceModePreference",
          mode,
          source: "workspace",
          help_layer: EXPERIENCE_HELP_LAYERS[mode].help_layer,
          path,
        };
      }
    }
  }

  return {
    kind: "ExperienceModePreference",
    mode: "simple",
    source: "default",
    help_layer: "journey",
  };
}

/** Persist workspace override (merges into existing config.yaml). */
export function writeWorkspaceExperienceMode(
  workspace: string,
  mode: ExperienceMode,
): string {
  const path = workspaceConfigPath(workspace);
  mkdirSync(dirname(path), { recursive: true });
  const existing = readYaml(path) ?? {};
  const next = {
    ...existing,
    experience: {
      ...((existing.experience as Record<string, unknown>) ?? {}),
      mode,
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
