/**
 * EvolveLoop profile — configuration / personalization boundary (not a runtime).
 * Profile configures core; core must not import personal paths.
 *
 * Legacy aliases: MegaBrain* names remain exported for compatibility.
 * V4.2: validate + detailed load report actionable file/key/fix (P0-2).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { KnowledgeBackendId } from "../knowledge/backend/types.js";

export interface EvolveLoopProfileKnowledge {
  /** Default: wiki */
  backend: KnowledgeBackendId | string;
}

export interface EvolveLoopProfileMemory {
  enabled: boolean;
  /** Episodic provider id — wiki-mem today */
  provider?: string;
}

/** V4.1 Agent Handles — optional; default off (ADR Q3 / D3). */
export interface EvolveLoopProfileAgentHandles {
  enabled: boolean;
}

export interface EvolveLoopProfilePreferences {
  agent_handles?: EvolveLoopProfileAgentHandles;
}

export interface EvolveLoopProfile {
  id: string;
  version: string;
  knowledge: EvolveLoopProfileKnowledge;
  memory: EvolveLoopProfileMemory;
  preferences?: EvolveLoopProfilePreferences;
}

/** Actionable config issue (V4.2 P0-2). */
export interface ConfigIssue {
  severity: "error" | "warn";
  file: string;
  key: string;
  message: string;
  fix: string;
}

export interface ProfileLoadDetailed {
  profile: EvolveLoopProfile;
  path: string | null;
  issues: ConfigIssue[];
  used_fallback: boolean;
}

/** @deprecated Use EvolveLoopProfileKnowledge */
export type MegaBrainProfileKnowledge = EvolveLoopProfileKnowledge;
/** @deprecated Use EvolveLoopProfileMemory */
export type MegaBrainProfileMemory = EvolveLoopProfileMemory;
/** @deprecated Use EvolveLoopProfile */
export type MegaBrainProfile = EvolveLoopProfile;

export const DEFAULT_PROFILE: EvolveLoopProfile = {
  id: "default",
  version: "1.0.0",
  knowledge: { backend: "wiki" },
  memory: { enabled: false, provider: "wiki-mem" },
  preferences: { agent_handles: { enabled: false } },
};

function agentsRoot(): string {
  return (
    process.env.AGENTS_ROOT ??
    process.env.EVOLVELOOP_ROOT ??
    process.env.MEGABRAIN_ROOT ??
    ""
  );
}

/**
 * Resolve profile file path.
 * Canonical: $AGENTS_ROOT/profiles/default.yaml
 * Override: EVOLVELOOP_PROFILE_PATH (or legacy MEGABRAIN_PROFILE_PATH)
 */
export function resolveProfilePath(): string | null {
  const override =
    process.env.EVOLVELOOP_PROFILE_PATH ?? process.env.MEGABRAIN_PROFILE_PATH;
  if (override) {
    return override;
  }
  const root = agentsRoot();
  if (!root) return null;
  const p = join(root, "profiles", "default.yaml");
  return existsSync(p) ? p : null;
}

function cloneDefaultProfile(): EvolveLoopProfile {
  return {
    ...DEFAULT_PROFILE,
    knowledge: { ...DEFAULT_PROFILE.knowledge },
    memory: { ...DEFAULT_PROFILE.memory },
    preferences: {
      agent_handles: { ...DEFAULT_PROFILE.preferences!.agent_handles! },
    },
  };
}

function coerceBool(
  v: unknown,
  key: string,
  file: string,
  issues: ConfigIssue[],
): boolean | undefined {
  if (v === undefined) return undefined;
  if (v === true || v === false) return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "on", "yes"].includes(s)) return true;
    if (["false", "0", "off", "no"].includes(s)) return false;
  }
  if (typeof v === "number" && (v === 0 || v === 1)) return v === 1;
  issues.push({
    severity: "error",
    file,
    key,
    message: `Valor inválido para booleano: ${JSON.stringify(v)}`,
    fix: `Defina ${key}: true|false (YAML).`,
  });
  return undefined;
}

function parseProfileObject(
  raw: Record<string, unknown>,
  file: string,
): { profile: EvolveLoopProfile; issues: ConfigIssue[] } {
  const issues: ConfigIssue[] = [];
  if (Array.isArray(raw)) {
    issues.push({
      severity: "error",
      file,
      key: "(root)",
      message: "Profile YAML é uma lista; esperado mapa.",
      fix: "Use chaves de topo: id, version, knowledge, memory, preferences.",
    });
    return { profile: cloneDefaultProfile(), issues };
  }

  const knowledge = (raw.knowledge ?? {}) as Record<string, unknown>;
  const memory = (raw.memory ?? {}) as Record<string, unknown>;
  const preferences = (raw.preferences ?? {}) as Record<string, unknown>;
  const agentHandles = (preferences.agent_handles ?? {}) as Record<string, unknown>;

  if (raw.knowledge !== undefined && (typeof raw.knowledge !== "object" || Array.isArray(raw.knowledge))) {
    issues.push({
      severity: "error",
      file,
      key: "knowledge",
      message: "knowledge deve ser um objeto.",
      fix: "Exemplo:\nknowledge:\n  backend: wiki",
    });
  }
  if (raw.memory !== undefined && (typeof raw.memory !== "object" || Array.isArray(raw.memory))) {
    issues.push({
      severity: "error",
      file,
      key: "memory",
      message: "memory deve ser um objeto.",
      fix: "Exemplo:\nmemory:\n  enabled: false",
    });
  }

  const memEnabled = coerceBool(memory.enabled, "memory.enabled", file, issues);
  const handlesEnabled = coerceBool(
    agentHandles.enabled,
    "preferences.agent_handles.enabled",
    file,
    issues,
  );

  const backend = knowledge.backend !== undefined
    ? String(knowledge.backend)
    : DEFAULT_PROFILE.knowledge.backend;
  if (knowledge.backend !== undefined && String(knowledge.backend).trim() === "") {
    issues.push({
      severity: "error",
      file,
      key: "knowledge.backend",
      message: "knowledge.backend está vazio.",
      fix: "Defina knowledge.backend: wiki (ou outro backend suportado).",
    });
  }

  const profile: EvolveLoopProfile = {
    id: String(raw.id ?? DEFAULT_PROFILE.id),
    version: String(raw.version ?? DEFAULT_PROFILE.version),
    knowledge: { backend },
    memory: {
      enabled:
        memEnabled === undefined ? DEFAULT_PROFILE.memory.enabled : memEnabled,
      provider: memory.provider
        ? String(memory.provider)
        : DEFAULT_PROFILE.memory.provider,
    },
    preferences: {
      agent_handles: {
        enabled:
          handlesEnabled === undefined
            ? Boolean(DEFAULT_PROFILE.preferences?.agent_handles?.enabled)
            : handlesEnabled,
      },
    },
  };
  return { profile, issues };
}

/**
 * Detailed profile load with issues. On parse failure → DEFAULT + used_fallback.
 * Does not throw — hosts that need silent default keep working; interactive/CLI warn.
 */
export function loadEvolveLoopProfileDetailed(opts?: {
  path?: string | null;
}): ProfileLoadDetailed {
  const path =
    opts?.path !== undefined ? opts.path : resolveProfilePath();
  if (!path) {
    return {
      profile: cloneDefaultProfile(),
      path: null,
      issues: [],
      used_fallback: false,
    };
  }
  if (!existsSync(path)) {
    return {
      profile: cloneDefaultProfile(),
      path,
      issues: [
        {
          severity: "warn",
          file: path,
          key: "(file)",
          message: "Ficheiro de profile não encontrado.",
          fix: "Criar profiles/default.yaml ou definir EVOLVELOOP_PROFILE_PATH.",
        },
      ],
      used_fallback: true,
    };
  }
  try {
    const parsed = parseYaml(readFileSync(path, "utf-8"));
    if (!parsed || typeof parsed !== "object") {
      return {
        profile: cloneDefaultProfile(),
        path,
        issues: [
          {
            severity: "error",
            file: path,
            key: "(root)",
            message: "Profile YAML não é um objeto.",
            fix: "Corrigir o documento para um mapa YAML com id/knowledge/memory.",
          },
        ],
        used_fallback: true,
      };
    }
    const { profile, issues } = parseProfileObject(
      parsed as Record<string, unknown>,
      path,
    );
    // Field-level errors keep best-effort profile; only total parse miss → fallback.
    return {
      profile,
      path,
      issues,
      used_fallback: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      profile: cloneDefaultProfile(),
      path,
      issues: [
        {
          severity: "error",
          file: path,
          key: "(parse)",
          message: `YAML inválido: ${msg}`,
          fix: "Corrigir sintaxe YAML (indentação, aspas, :) e reexecutar evolve config validate.",
        },
      ],
      used_fallback: true,
    };
  }
}

/**
 * Compat loader — still returns DEFAULT on failure (hosts).
 * Set EVOLVELOOP_CONFIG_WARN=1 to print issues to stderr.
 */
export function loadEvolveLoopProfile(): EvolveLoopProfile {
  const detailed = loadEvolveLoopProfileDetailed();
  if (
    process.env.EVOLVELOOP_CONFIG_WARN === "1" ||
    process.env.EVOLVELOOP_CONFIG_WARN === "true"
  ) {
    for (const issue of detailed.issues) {
      console.error(
        `[evolve config] ${issue.severity}: ${issue.file} · ${issue.key}: ${issue.message} → ${issue.fix}`,
      );
    }
  }
  return detailed.profile;
}

/** Validate workspace `.evolveloop/config.yaml` when present. */
export function validateWorkspaceConfigFile(path: string): ConfigIssue[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = parseYaml(readFileSync(path, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [
        {
          severity: "error",
          file: path,
          key: "(root)",
          message: "config.yaml do workspace não é um objeto.",
          fix: "Exemplo:\nagent_handles:\n  enabled: false",
        },
      ];
    }
    const raw = parsed as Record<string, unknown>;
    const issues: ConfigIssue[] = [];
    const block = (raw.agent_handles ?? raw.agentHandles) as
      | Record<string, unknown>
      | undefined;
    if (block && typeof block === "object") {
      coerceBool(block.enabled, "agent_handles.enabled", path, issues);
    } else if (raw["agent_handles.enabled"] !== undefined) {
      coerceBool(
        raw["agent_handles.enabled"],
        "agent_handles.enabled",
        path,
        issues,
      );
    }
    return issues;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return [
      {
        severity: "error",
        file: path,
        key: "(parse)",
        message: `YAML inválido: ${msg}`,
        fix: "Corrigir sintaxe em .evolveloop/config.yaml ou: evolve config set agent-handles off",
      },
    ];
  }
}

/** Format issues for interactive warn (non-strict hosts). */
export function formatConfigWarnings(issues: ConfigIssue[]): string[] {
  return issues.map(
    (i) =>
      `⚠ config ${i.severity}: ${i.file} · ${i.key}: ${i.message} — ${i.fix}`,
  );
}

/** @deprecated Use loadEvolveLoopProfile */
export const loadMegaBrainProfile = loadEvolveLoopProfile;

/** Effective knowledge backend id: env wins over profile, default wiki. */
export function resolveKnowledgeBackendId(profile?: EvolveLoopProfile): string {
  if (process.env.KNOWLEDGE_BACKEND?.trim()) {
    return process.env.KNOWLEDGE_BACKEND.trim().toLowerCase();
  }
  const p = profile ?? loadEvolveLoopProfile();
  return String(p.knowledge.backend ?? "wiki").toLowerCase();
}
