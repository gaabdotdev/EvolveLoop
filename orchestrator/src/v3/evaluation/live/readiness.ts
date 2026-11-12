/**
 * Live LLM readiness — honest probe; never invents credentials or sets consent.
 */

import { spawnSync } from "node:child_process";
import { probeHarnessCli } from "../../adapters/drivers/cli-probe.js";

export type LiveReadinessState = "READY" | "BLOCKED" | "PARTIAL";

export interface LiveReadinessReport {
  kind: "LiveLlmReadiness";
  state: LiveReadinessState;
  consent: boolean;
  providers: Array<{
    id: string;
    available: boolean;
    auth: "logged_in" | "api_key_env" | "none" | "unknown";
    detail: string;
  }>;
  blockers: string[];
  notes: string[];
}

function envKeyPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

function claudeAuthLoggedIn(): { loggedIn: boolean; detail: string } {
  try {
    const r = spawnSync("claude", ["auth", "status"], {
      encoding: "utf-8",
      timeout: 15_000,
      env: process.env,
    });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    if (/loggedIn"\s*:\s*true/.test(out) || /"loggedIn": true/.test(out)) {
      return { loggedIn: true, detail: "claude auth status loggedIn=true" };
    }
    return { loggedIn: false, detail: "claude auth status loggedIn=false or unparseable" };
  } catch (e) {
    return { loggedIn: false, detail: `claude auth probe failed: ${String(e)}` };
  }
}

export function probeLiveLlmReadiness(): LiveReadinessReport {
  const consent = process.env.EVOLVELOOP_HARNESS_CONSENT === "true";
  const blockers: string[] = [];
  const notes: string[] = [
    "Does not set EVOLVELOOP_HARNESS_CONSENT",
    "Does not invent tokens or API keys",
    "Deterministic solvers remain the CI regression path",
  ];

  const claudeProbe = probeHarnessCli("claude");
  const claudeAuth = claudeProbe.available ? claudeAuthLoggedIn() : { loggedIn: false, detail: "cli absent" };
  const anthropicKey = envKeyPresent("ANTHROPIC_API_KEY");
  const openAiKey = envKeyPresent("OPENAI_API_KEY");
  const openRouterKey = envKeyPresent("OPENROUTER_API_KEY");

  const providers: LiveReadinessReport["providers"] = [
    {
      id: "claude-code",
      available: Boolean(claudeProbe.available),
      auth: claudeAuth.loggedIn ? "logged_in" : anthropicKey ? "api_key_env" : "none",
      detail: claudeAuth.detail,
    },
    {
      id: "openai",
      available: openAiKey,
      auth: openAiKey ? "api_key_env" : "none",
      detail: openAiKey ? "OPENAI_API_KEY present" : "OPENAI_API_KEY unset",
    },
    {
      id: "openrouter",
      available: openRouterKey,
      auth: openRouterKey ? "api_key_env" : "none",
      detail: openRouterKey ? "OPENROUTER_API_KEY present" : "OPENROUTER_API_KEY unset",
    },
    {
      id: "cursor",
      available: true,
      auth: "unknown",
      detail: "ExecutionBridge/jobs path — not a full live LLM chat API",
    },
  ];

  if (!consent) blockers.push("EVOLVELOOP_HARNESS_CONSENT!=true");

  const liveProvider =
    (claudeProbe.available && (claudeAuth.loggedIn || anthropicKey)) || openAiKey || openRouterKey;
  if (!liveProvider) blockers.push("no_authenticated_live_llm_provider");

  let state: LiveReadinessState = "BLOCKED";
  if (consent && liveProvider) state = "READY";
  else if (liveProvider && !consent) state = "PARTIAL";
  else state = "BLOCKED";

  return {
    kind: "LiveLlmReadiness",
    state,
    consent,
    providers,
    blockers,
    notes,
  };
}
