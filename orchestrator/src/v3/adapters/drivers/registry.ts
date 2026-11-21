import type { AdapterId } from "../types.js";
import { BlockedAdapterDriver } from "./blocked.js";
import { CursorJobsAdapterDriver } from "./cursor-jobs.js";
import { CliProcessAdapterDriver } from "./cli-process.js";
import { probeHarnessCli } from "./cli-probe.js";
import type { AgentAdapterDriver } from "./types.js";

function claudeDriver(): AgentAdapterDriver {
  const probe = probeHarnessCli("claude");
  if (!probe.available) {
    return new BlockedAdapterDriver(
      "claude-code",
      "claude CLI not on PATH — install Claude Code or use dry-path after install",
    );
  }
  return new CliProcessAdapterDriver({
    adapter_id: "claude-code",
    cli_id: "claude",
    buildArgs: (promptPath) => [
      "-p",
      "--output-format",
      "text",
      `Read the EvolveLoop handoff prompt at ${promptPath} and continue the assigned task without redoing verified TRUE_PASS work.`,
    ],
    notes: [
      "Claude Code CLI bridge (print mode)",
      "Does not claim IDE session injection or full permission mediation",
      "Cancel only for Core-owned spawned PIDs (process-sessions)",
    ],
  });
}

function codexDriver(): AgentAdapterDriver {
  const probe = probeHarnessCli("codex");
  if (!probe.available) {
    return new BlockedAdapterDriver("codex", "codex CLI not on PATH");
  }
  return new CliProcessAdapterDriver({
    adapter_id: "codex",
    cli_id: "codex",
    buildArgs: (promptPath) => [
      "exec",
      `Continue EvolveLoop task using prompt file ${promptPath}`,
    ],
    notes: [
      "Codex CLI bridge — args are best-effort; validate against installed Codex version",
      "Cancel only for Core-owned spawned PIDs",
    ],
  });
}

function antigravityDriver(): AgentAdapterDriver {
  // Prefer cursor-agent (`agent`) when present — prior argv `--prompt-file` was invalid for it.
  const cursorProbe = probeHarnessCli("cursor-agent");
  const probe = cursorProbe.available ? cursorProbe : probeHarnessCli("antigravity");
  if (!probe.available) {
    return new BlockedAdapterDriver("antigravity", "antigravity/cursor-agent CLI not on PATH");
  }
  const isCursorAgent =
    probe.cli_id === "cursor-agent" ||
    (probe.path?.endsWith("/agent") ?? false) ||
    (probe.path?.endsWith("/cursor-agent") ?? false);
  return new CliProcessAdapterDriver({
    adapter_id: "antigravity",
    cli_id: isCursorAgent ? "cursor-agent" : "antigravity",
    buildArgs: (promptPath, request) => {
      if (isCursorAgent) {
        const workspace = request.workspace_path;
        const args = [
          "-p",
          "--output-format",
          "text",
          // Workspace trust for non-interactive disposable fixtures — NOT authentication.
          // Auth is session-based (`agent login` / `agent status`) or CURSOR_API_KEY.
          "--trust",
        ];
        if (request.cli_mode === "ask" || request.cli_mode === "plan") {
          args.push("--mode", request.cli_mode);
        }
        // Tool permission for consented live engineering (npm/git). Not auth.
        if (request.force_tools !== false && request.cli_mode !== "ask" && request.cli_mode !== "plan") {
          args.push("--force");
        }
        if (workspace) {
          args.push("--workspace", workspace);
        }
        args.push(
          `Read the EvolveLoop handoff prompt at ${promptPath} and complete the assigned task. Stay strictly inside the workspace. Do not modify files outside it.`,
        );
        return args;
      }
      return ["--prompt-file", promptPath];
    },
    notes: [
      isCursorAgent
        ? "cursor-agent bridge via antigravity adapter_id (print mode + workspace trust)"
        : "Antigravity CLI bridge — experimental argv; validate locally",
      "Cancel only for Core-owned spawned PIDs",
      "--trust scopes workspace trust after session auth; it is not an auth substitute",
    ],
  });
}

let cached: Record<AdapterId, AgentAdapterDriver> | null = null;

function drivers(): Record<AdapterId, AgentAdapterDriver> {
  if (!cached) {
    cached = {
      cursor: new CursorJobsAdapterDriver(),
      "claude-code": claudeDriver(),
      codex: codexDriver(),
      antigravity: antigravityDriver(),
    };
  }
  return cached;
}

export function getAdapterDriver(adapterId: AdapterId): AgentAdapterDriver {
  return drivers()[adapterId];
}

export function listAdapterDrivers(): AgentAdapterDriver[] {
  return Object.values(drivers());
}
