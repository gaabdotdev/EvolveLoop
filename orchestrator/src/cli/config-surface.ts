/**
 * V4.2 P0 — `evolve config` product surface: prefs + validate.
 * Persist Handles via writeWorkspaceAgentHandles (no manual YAML edit).
 */

import { resolve } from "node:path";
import {
  HANDLES_CONSEQUENCE_OFF,
  HANDLES_CONSEQUENCE_ON,
  resolveAgentHandlesPreference,
  writeWorkspaceAgentHandles,
  workspaceConfigPath,
} from "../v3/agent-handles/preference.js";
import {
  loadEvolveLoopProfileDetailed,
  resolveProfilePath,
  validateWorkspaceConfigFile,
  type ConfigIssue,
} from "../config/profile.js";

export interface ConfigPrefsView {
  workspace: string;
  agent_handles: {
    enabled: boolean;
    source: string;
    path?: string;
  };
  consequence: string;
  lines: string[];
  hint_cli: string;
}

export function buildConfigPrefsView(workspace: string): ConfigPrefsView {
  const ws = resolve(workspace);
  const pref = resolveAgentHandlesPreference({ workspace: ws });
  const consequence = pref.enabled
    ? HANDLES_CONSEQUENCE_ON
    : HANDLES_CONSEQUENCE_OFF;
  const cfgPath = workspaceConfigPath(ws);
  const lines = [
    "Preferências (workspace)",
    `Workspace: ${ws}`,
    `Agent Handles: ${pref.enabled ? "ON" : "OFF"} (fonte: ${pref.source})`,
    `  → ${consequence}`,
    pref.source === "workspace"
      ? `Persistido em: ${cfgPath}`
      : `Override: ${cfgPath}`,
    "",
    "Alterar: evolve config set agent-handles on|off",
    "         /config handles on|off   (TUI)",
  ];
  return {
    workspace: ws,
    agent_handles: {
      enabled: pref.enabled,
      source: pref.source,
      path: pref.source === "workspace" ? cfgPath : undefined,
    },
    consequence,
    lines,
    hint_cli: "evolve config set agent-handles on|off",
  };
}

export function setAgentHandlesPref(
  workspace: string,
  enabled: boolean,
): { path: string; enabled: boolean; consequence: string; lines: string[] } {
  const path = writeWorkspaceAgentHandles(workspace, enabled);
  const consequence = enabled
    ? HANDLES_CONSEQUENCE_ON
    : HANDLES_CONSEQUENCE_OFF;
  return {
    path,
    enabled,
    consequence,
    lines: [
      `Agent Handles → ${enabled ? "ON" : "OFF"}`,
      `Persistido: ${path}`,
      `Consequência: ${consequence}`,
    ],
  };
}

export function parseHandlesToggle(raw: string | undefined): boolean | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (["on", "true", "1", "yes", "enable", "enabled"].includes(s)) return true;
  if (["off", "false", "0", "no", "disable", "disabled"].includes(s))
    return false;
  return null;
}

export interface ConfigValidateResult {
  ok: boolean;
  issues: ConfigIssue[];
  lines: string[];
  profile_path: string | null;
  workspace_config_path: string;
}

export function validateEvolveConfig(opts: {
  workspace: string;
  profile_path?: string | null;
}): ConfigValidateResult {
  const ws = resolve(opts.workspace);
  const detailed = loadEvolveLoopProfileDetailed({
    path: opts.profile_path ?? undefined,
  });
  const wsIssues = validateWorkspaceConfigFile(workspaceConfigPath(ws));
  const issues = [...detailed.issues, ...wsIssues];
  const ok = !issues.some((i) => i.severity === "error");
  const lines: string[] = [
    ok ? "config validate: OK" : "config validate: FALHOU",
    `profile: ${detailed.path ?? "(default embutido)"}`,
    `workspace config: ${workspaceConfigPath(ws)}`,
  ];
  if (detailed.used_fallback) {
    lines.push(
      "aviso: profile em fallback para DEFAULT — ver issues abaixo",
    );
  }
  for (const issue of issues) {
    lines.push(formatConfigIssue(issue));
  }
  if (issues.length === 0) {
    lines.push("(sem issues)");
  }
  return {
    ok,
    issues,
    lines,
    profile_path: detailed.path ?? resolveProfilePath(),
    workspace_config_path: workspaceConfigPath(ws),
  };
}

export function formatConfigIssue(issue: ConfigIssue): string {
  const tag = issue.severity === "error" ? "ERRO" : "AVISO";
  return `[${tag}] ${issue.file} · chave=${issue.key}\n  ${issue.message}\n  Correção: ${issue.fix}`;
}

/** Collect non-flag tokens after `evolve config`. */
export function configPositionals(argv: string[]): string[] {
  const idx = argv.findIndex((a) => a === "config");
  if (idx < 0) return [];
  const out: string[] = [];
  for (let i = idx + 1; i < argv.length; i++) {
    const t = argv[i]!;
    if (t.startsWith("--")) {
      if (argv[i + 1] && !argv[i + 1]!.startsWith("--")) i++;
      continue;
    }
    out.push(t);
  }
  return out;
}

/**
 * Handle `evolve config …`. Returns handled=true when group is config.
 */
export function handleConfigSurface(
  args: Record<string, string>,
  opts?: { printJson?: (obj: unknown) => void; argv?: string[] },
): { handled: boolean; exitCode?: number } {
  if (args.group !== "config") return { handled: false };

  const workspace = resolve(args.workspace ?? args.cwd ?? process.cwd());
  const print =
    opts?.printJson ??
    ((obj: unknown) => console.log(JSON.stringify(obj, null, 2)));
  const positionals = configPositionals(opts?.argv ?? process.argv);
  const cmd = (positionals[0] ?? args.command ?? "help").toLowerCase();

  if (cmd === "help" || cmd === "true") {
    console.log(
      [
        "evolve config — preferências e validação (V4.2)",
        "",
        "  evolve config prefs              # mostrar Handles + consequência",
        "  evolve config show               # alias de prefs",
        "  evolve config set agent-handles on|off",
        "  evolve config validate           # ficheiro/chave/correção",
        "",
        "Flags: --workspace <path>",
        "TUI:   /config  ·  /config handles on|off  ·  /config prefs",
      ].join("\n"),
    );
    return { handled: true, exitCode: 0 };
  }

  if (cmd === "prefs" || cmd === "show") {
    const view = buildConfigPrefsView(workspace);
    if (args.format === "json") print(view);
    else console.log(view.lines.join("\n"));
    return { handled: true, exitCode: 0 };
  }

  if (cmd === "validate") {
    const result = validateEvolveConfig({
      workspace,
      profile_path: args.profile ?? args["profile-path"],
    });
    if (args.format === "json") print(result);
    else console.log(result.lines.join("\n"));
    return { handled: true, exitCode: result.ok ? 0 : 1 };
  }

  if (cmd === "set") {
    const rest = positionals.slice(1);
    let enabled: boolean | null = null;
    if (args["agent-handles"] !== undefined) {
      enabled = parseHandlesToggle(args["agent-handles"]);
    } else if (
      rest[0]?.toLowerCase() === "agent-handles" ||
      rest[0]?.toLowerCase() === "handles"
    ) {
      enabled = parseHandlesToggle(rest[1]);
    } else if (rest[0]) {
      enabled = parseHandlesToggle(rest[0]);
    }

    if (enabled === null) {
      console.error(
        "Uso: evolve config set agent-handles on|off\n" +
          "  ou: evolve config set --agent-handles on|off",
      );
      return { handled: true, exitCode: 1 };
    }

    const result = setAgentHandlesPref(workspace, enabled);
    if (args.format === "json") print(result);
    else console.log(result.lines.join("\n"));
    return { handled: true, exitCode: 0 };
  }

  console.error(`Unknown config command: ${cmd}. Try: evolve config help`);
  return { handled: true, exitCode: 1 };
}
