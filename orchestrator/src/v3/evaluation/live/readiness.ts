/**
 * Live LLM readiness — honest probe; never invents credentials or sets consent.
 * READY requires consent + authenticated harness + (optional) can-start verification.
 */

import { spawnSync } from "node:child_process";
import { probeHarnessCli } from "../../adapters/drivers/cli-probe.js";
import {
  cursorAgentLoggedIn,
  smokeCursorAgentCanStart,
  type LiveHarnessId,
} from "./harness.js";

export type LiveReadinessState = "READY" | "BLOCKED" | "PARTIAL";

export interface LiveReadinessReport {
  kind: "LiveLlmReadiness";
  state: LiveReadinessState;
  consent: boolean;
  /** Consent + authenticated harness selected — may execute live invokes. */
  executable: boolean;
  selected_harness: LiveHarnessId | null;
  providers: Array<{
    id: string;
    available: boolean;
    auth: "logged_in" | "api_key_env" | "none" | "unknown";
    detail: string;
  }>;
  blockers: string[];
  notes: string[];
  checks?: Record<string, { ok: boolean; detail: string }>;
}

export interface LiveReadinessOptions {
  /** When true, run a short can-start smoke (network). Default false for unit tests. */
  verifyCanStart?: boolean;
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
    if (/loggedIn"\s*:\s*true/.test(out) || /"loggedIn":\s*true/.test(out)) {
      return { loggedIn: true, detail: "claude auth status loggedIn=true" };
    }
    return { loggedIn: false, detail: "claude auth status loggedIn=false or unparseable" };
  } catch (e) {
    return { loggedIn: false, detail: `claude auth probe failed: ${String(e)}` };
  }
}

function consentOk(): boolean {
  return process.env.EVOLVELOOP_HARNESS_CONSENT === "true";
}

export function probeLiveLlmReadiness(opts: LiveReadinessOptions = {}): LiveReadinessReport {
  const consent = consentOk();
  const blockers: string[] = [];
  const notes: string[] = [
    "Does not set EVOLVELOOP_HARNESS_CONSENT",
    "Does not invent tokens or API keys",
    "Deterministic solvers remain the CI regression path — never used for LIVE claims",
  ];
  const checks: NonNullable<LiveReadinessReport["checks"]> = {};

  const claudeProbe = probeHarnessCli("claude");
  const cursorProbe = probeHarnessCli("cursor-agent");
  const claudeAuth = claudeProbe.available
    ? claudeAuthLoggedIn()
    : { loggedIn: false, detail: "cli absent" };
  const cursorAuth = cursorProbe.available
    ? cursorAgentLoggedIn()
    : { loggedIn: false, detail: "cli absent" };
  const anthropicKey = envKeyPresent("ANTHROPIC_API_KEY");
  const openAiKey = envKeyPresent("OPENAI_API_KEY");
  const openRouterKey = envKeyPresent("OPENROUTER_API_KEY");

  const providers: LiveReadinessReport["providers"] = [
    {
      id: "cursor-agent",
      available: Boolean(cursorProbe.available),
      auth: cursorAuth.loggedIn ? "logged_in" : "none",
      detail: cursorAuth.detail,
    },
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
  ];

  checks.consent = {
    ok: consent,
    detail: consent
      ? "EVOLVELOOP_HARNESS_CONSENT=true (process-scoped)"
      : "EVOLVELOOP_HARNESS_CONSENT!=true",
  };
  checks.harness_cursor_agent = {
    ok: Boolean(cursorProbe.available),
    detail: cursorProbe.available ? `path=${cursorProbe.path}` : "absent",
  };
  checks.harness_claude = {
    ok: Boolean(claudeProbe.available),
    detail: claudeProbe.available ? `path=${claudeProbe.path}` : "absent",
  };
  checks.auth_cursor_agent = { ok: cursorAuth.loggedIn, detail: cursorAuth.detail };
  checks.auth_claude = { ok: claudeAuth.loggedIn, detail: claudeAuth.detail };

  let selected: LiveHarnessId | null = null;
  if (cursorProbe.available && cursorAuth.loggedIn) selected = "cursor-agent";
  else if (claudeProbe.available && (claudeAuth.loggedIn || anthropicKey)) selected = "claude-code";

  checks.model = {
    ok: selected !== null,
    detail: selected
      ? `${selected} account/default model usable for -p invoke`
      : "no authenticated harness with usable model",
  };

  if (!consent) blockers.push("EVOLVELOOP_HARNESS_CONSENT!=true");

  const liveProvider = selected !== null || openAiKey || openRouterKey;
  if (!liveProvider) blockers.push("no_authenticated_live_llm_provider");

  let canStartVerified = false;
  if (opts.verifyCanStart && consent && selected === "cursor-agent") {
    const smoke = smokeCursorAgentCanStart();
    canStartVerified = smoke.ok;
    checks.can_start = {
      ok: smoke.ok,
      detail: `${smoke.detail} (${smoke.duration_ms}ms)`,
    };
    if (!smoke.ok) blockers.push("can_start_failed");
  } else if (opts.verifyCanStart && consent && selected === "claude-code") {
    canStartVerified = true;
    checks.can_start = {
      ok: true,
      detail: "claude authenticated — can-start accepted via auth probe (suite validates invoke)",
    };
  } else if (opts.verifyCanStart && !consent) {
    checks.can_start = { ok: false, detail: "can-start skipped until consent is set" };
    blockers.push("can_start_not_verified");
  } else {
    checks.can_start = {
      ok: false,
      detail: "can-start not requested (pass verifyCanStart:true for READY with smoke)",
    };
    notes.push("can_start_not_verified_in_this_probe");
  }

  const executable = Boolean(consent && selected);

  let state: LiveReadinessState = "BLOCKED";
  if (executable) {
    if (opts.verifyCanStart) {
      state =
        canStartVerified && !blockers.includes("can_start_failed") ? "READY" : "BLOCKED";
    } else {
      // Authenticated + consent; smoke deferred — PARTIAL until verifyCanStart proves can-start
      state = "PARTIAL";
      notes.push("READY requires verifyCanStart:true (CLI live-readiness / live-suite)");
    }
  } else if (liveProvider && !consent) {
    state = "PARTIAL";
  } else {
    state = "BLOCKED";
  }

  // Deduplicate blockers while preserving order
  const uniqueBlockers = [...new Set(blockers)];

  return {
    kind: "LiveLlmReadiness",
    state,
    consent,
    executable,
    selected_harness: selected,
    providers,
    blockers: uniqueBlockers,
    notes,
    checks,
  };
}

/** Alias used by docs/scripts that prefer assess* naming. */
export function assessLiveReadiness(opts: LiveReadinessOptions = {}): LiveReadinessReport {
  return probeLiveLlmReadiness(opts);
}
