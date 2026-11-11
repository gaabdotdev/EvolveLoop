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
  const probe = probeHarnessCli("antigravity");
  if (!probe.available) {
    return new BlockedAdapterDriver("antigravity", "antigravity CLI not on PATH");
  }
  return new CliProcessAdapterDriver({
    adapter_id: "antigravity",
    cli_id: "antigravity",
    buildArgs: (promptPath) => ["--prompt-file", promptPath],
    notes: [
      "Antigravity CLI bridge — experimental argv; validate locally",
      "Cancel only for Core-owned spawned PIDs",
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
