/**
 * Live HUD probes — fill honest telemetry extras (never invent tokens as 0).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isBwrapAvailable } from "../sandbox/bwrap-wrapper.js";
import type { SandboxFooterStatus } from "./footer.js";
import type { BuildBannerExtras } from "./hud.js";
import type { BuildFooterExtras } from "./footer.js";

export interface HudProbeResult {
  sandbox: SandboxFooterStatus;
  git_branch: string;
  providers: string;
  banner: BuildBannerExtras;
  footer: BuildFooterExtras;
}

function probeGitBranch(workspace: string): string {
  const r = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: workspace,
    encoding: "utf-8",
    timeout: 2000,
  });
  if (r.status !== 0) return "UNAVAILABLE";
  const b = (r.stdout ?? "").trim();
  return b || "UNAVAILABLE";
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

function freellmConfigured(): boolean {
  const secrets = join(homedir(), ".config", "evolveloop", "secrets.env");
  if (!existsSync(secrets)) return false;
  try {
    const raw = readFileSync(secrets, "utf-8");
    return /^(?:export\s+)?FREELLMAPI_(?:API_)?KEY\s*=\s*\S+/m.test(raw);
  } catch {
    return false;
  }
}

function probeProviders(): string {
  const parts: string[] = [];
  const ollamaUp = httpOk("http://127.0.0.1:11434/api/tags");
  if (ollamaUp) parts.push("Ollama");

  const freellmReachable = httpOk("http://127.0.0.1:3001/v1/models");
  if (freellmReachable && freellmConfigured()) {
    parts.push("FreeLLMAPI");
  } else if (freellmReachable && !freellmConfigured()) {
    parts.push("FreeLLMAPI(needsKey)");
  }

  if (parts.length === 0) return "UNAVAILABLE";
  return parts.join(" · ");
}

/** Probe host tools/providers for shell banner/footer. */
export function probeHudEnvironment(workspace: string): HudProbeResult {
  const sandbox: SandboxFooterStatus = isBwrapAvailable() ? "ON" : "UNAVAILABLE";
  const git_branch = probeGitBranch(workspace);
  const providers = probeProviders();

  return {
    sandbox,
    git_branch,
    providers,
    banner: {
      sandbox,
      providers,
    },
    footer: {
      sandbox,
      git_branch,
      // Model/ctx/tok stay UNAVAILABLE until a live MSO session reports them.
    },
  };
}
