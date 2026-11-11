/**
 * Best-effort detection of external harness CLIs on PATH.
 * Presence ≠ full control; drivers must still declare limitations.
 */

import { spawnSync } from "node:child_process";

export type HarnessCliId = "claude" | "codex" | "antigravity" | "cursor-agent";

export interface CliProbeResult {
  cli_id: HarnessCliId;
  available: boolean;
  path?: string;
  version_hint?: string;
  error?: string;
}

const CLI_CANDIDATES: Record<HarnessCliId, string[]> = {
  claude: ["claude"],
  codex: ["codex"],
  antigravity: ["antigravity"],
  "cursor-agent": ["agent", "cursor-agent"],
};

export function probeHarnessCli(cliId: HarnessCliId): CliProbeResult {
  const names = CLI_CANDIDATES[cliId];
  for (const name of names) {
    const which = spawnSync("which", [name], { encoding: "utf-8" });
    if (which.status === 0) {
      const bin = which.stdout.trim();
      const ver = spawnSync(bin, ["--version"], { encoding: "utf-8", timeout: 5000 });
      return {
        cli_id: cliId,
        available: true,
        path: bin,
        version_hint: (ver.stdout || ver.stderr || "").trim().split("\n")[0]?.slice(0, 120),
      };
    }
  }
  return { cli_id: cliId, available: false, error: "not_on_path" };
}

export function probeAllHarnessClis(): CliProbeResult[] {
  return (Object.keys(CLI_CANDIDATES) as HarnessCliId[]).map(probeHarnessCli);
}
