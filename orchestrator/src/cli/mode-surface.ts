/**
 * V5-M07 — `evolve mode simple|advanced|show` preference surface.
 */

import { resolve } from "node:path";
import {
  EXPERIENCE_HELP_LAYERS,
  resolveExperienceMode,
  writeWorkspaceExperienceMode,
  type ExperienceMode,
} from "../v3/experience/index.js";
import {
  formatAdvancedHelp,
  formatJourneyHelp,
} from "./help-usage.js";

function parseModeArg(raw: string | undefined): ExperienceMode | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "simple" || s === "journey" || s === "everyday") return "simple";
  if (s === "advanced" || s === "full" || s === "expert") return "advanced";
  return null;
}

/**
 * Handle `evolve mode …`. Returns handled=false for other groups.
 */
export function handleModeSurface(
  args: Record<string, string>,
  opts?: { printJson?: (obj: unknown) => void; argv?: string[] },
): { handled: boolean; exitCode?: number } {
  if (args.group !== "mode") return { handled: false };

  const argv = opts?.argv ?? process.argv;
  const idx = argv.findIndex((a) => a === "mode");
  const positionals: string[] = [];
  if (idx >= 0) {
    for (let i = idx + 1; i < argv.length; i++) {
      const t = argv[i]!;
      if (t.startsWith("--")) {
        if (argv[i + 1] && !argv[i + 1]!.startsWith("--")) i++;
        continue;
      }
      positionals.push(t);
    }
  }

  const cmd = (positionals[0] ?? args.command ?? "show").toLowerCase();
  const workspace = resolve(args.workspace ?? args.cwd ?? process.cwd());
  const print =
    opts?.printJson ??
    ((obj: unknown) => console.log(JSON.stringify(obj, null, 2)));

  if (cmd === "help") {
    console.log(
      [
        "evolve mode — Simple vs Advanced preference (V5-M07)",
        "",
        "  evolve mode show              # current preference",
        "  evolve mode simple            # persist simple (journey help)",
        "  evolve mode advanced          # persist advanced (full map)",
        "",
        "Layers (also without preference):",
        `  Simple:   ${EXPERIENCE_HELP_LAYERS.simple.cli}`,
        `  Advanced: ${EXPERIENCE_HELP_LAYERS.advanced.cli}`,
        "Env override: EVOLVELOOP_EXPERIENCE_MODE=simple|advanced",
      ].join("\n"),
    );
    return { handled: true, exitCode: 0 };
  }

  if (cmd === "show" || cmd === "prefs" || cmd === "get") {
    const pref = resolveExperienceMode({ workspace });
    const layer = EXPERIENCE_HELP_LAYERS[pref.mode];
    if (args.format === "json") {
      print({ ...pref, layer });
    } else {
      console.log(
        [
          `Experience mode: ${pref.mode} (source: ${pref.source})`,
          `  help layer: ${pref.help_layer} → ${layer.cli}`,
          `  ${layer.description}`,
          pref.path ? `  persisted: ${pref.path}` : "  default / env (not workspace-persisted)",
        ].join("\n"),
      );
    }
    return { handled: true, exitCode: 0 };
  }

  const mode = parseModeArg(cmd) ?? parseModeArg(args.mode);
  if (!mode) {
    console.error(
      "Uso: evolve mode simple|advanced|show\n  ou: evolve mode help",
    );
    return { handled: true, exitCode: 1 };
  }

  const path = writeWorkspaceExperienceMode(workspace, mode);
  const pref = resolveExperienceMode({ workspace });
  const layer = EXPERIENCE_HELP_LAYERS[mode];
  if (args.format === "json") {
    print({ mode, path, preference: pref, layer });
  } else {
    console.log(
      [
        `Experience mode → ${mode}`,
        `Persistido: ${path}`,
        `Help: ${layer.cli}`,
        `  ${layer.description}`,
      ].join("\n"),
    );
  }
  return { handled: true, exitCode: 0 };
}

/** Help text selected by experience mode (for tests / programmatic use). */
export function helpForExperienceMode(mode: ExperienceMode): string {
  return mode === "advanced" ? formatAdvancedHelp() : formatJourneyHelp();
}
