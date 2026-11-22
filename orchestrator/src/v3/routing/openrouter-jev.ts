/**
 * OpenRouter Jev (remote) — fail-closed without API key AND explicit consent.
 * Does not send project payloads unless both gates pass.
 */

import type { RouteCandidate } from "./types.js";
import type { DecisionModelResponse } from "./decision-model.js";

export interface OpenRouterJevOptions {
  apiKey?: string;
  /** Must be true — remote project data requires consent. */
  consent: boolean;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface OpenRouterJevProbe {
  kind: "OpenRouterJevProbe";
  available: boolean;
  consent: boolean;
  has_api_key: boolean;
  model: string;
  error?: string;
  limitations: string[];
}

const DEFAULT_MODEL = "openai/gpt-4o-mini"; // placeholder; operator should set EVOLVELOOP_JEV_MODEL
const DEFAULT_BASE = "https://openrouter.ai/api/v1";

function limitations(): string[] {
  return [
    "Remote Jev/OpenRouter is never the default path",
    "Requires OPENROUTER_API_KEY (or EVOLVELOOP_OPENROUTER_API_KEY) AND consent=true",
    "Does not claim TypeSafe Jev model id unless EVOLVELOOP_JEV_MODEL is set",
    "Decision cannot invent candidates outside the hard-constraint set",
  ];
}

export function probeOpenRouterJev(opts: OpenRouterJevOptions): OpenRouterJevProbe {
  const key =
    opts.apiKey ||
    process.env.EVOLVELOOP_OPENROUTER_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    "";
  const model = opts.model || process.env.EVOLVELOOP_JEV_MODEL || DEFAULT_MODEL;
  const has_api_key = key.length > 0;
  const consent = opts.consent === true;
  if (!consent) {
    return {
      kind: "OpenRouterJevProbe",
      available: false,
      consent: false,
      has_api_key,
      model,
      error: "consent_required",
      limitations: limitations(),
    };
  }
  if (!has_api_key) {
    return {
      kind: "OpenRouterJevProbe",
      available: false,
      consent: true,
      has_api_key: false,
      model,
      error: "api_key_missing",
      limitations: limitations(),
    };
  }
  return {
    kind: "OpenRouterJevProbe",
    available: true,
    consent: true,
    has_api_key: true,
    model,
    limitations: limitations(),
  };
}

/**
 * Ask OpenRouter chat-completions for a structured choice among candidate ids.
 * Fail-closed on any gate failure or malformed response.
 */
export async function invokeOpenRouterJev(
  input: {
    work_id: string;
    task_summary: string;
    candidates: RouteCandidate[];
  },
  opts: OpenRouterJevOptions,
): Promise<DecisionModelResponse> {
  const probe = probeOpenRouterJev(opts);
  if (!probe.available) {
    return {
      kind: "DecisionModelResponse",
      status: probe.error === "consent_required" ? "disabled" : "unavailable",
      error: probe.error,
      limitations: probe.limitations,
    };
  }

  const key =
    opts.apiKey ||
    process.env.EVOLVELOOP_OPENROUTER_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    "";
  const baseUrl = (opts.baseUrl || process.env.EVOLVELOOP_OPENROUTER_URL || DEFAULT_BASE).replace(
    /\/$/,
    "",
  );
  const model = probe.model;
  const allowed = new Set(input.candidates.map((c) => c.id));
  const prompt = {
    work_id: input.work_id,
    task: input.task_summary,
    instruction:
      "Select exactly one candidate id from the list. Reply with JSON only: {\"selected_id\":\"...\"}",
    candidates: input.candidates.map((c) => ({
      id: c.id,
      kind: c.kind,
      score: c.score,
      reasons: c.reasons,
    })),
  };

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are a discrete resource router. Never invent ids. JSON only.",
          },
          { role: "user", content: JSON.stringify(prompt) },
        ],
        temperature: 0,
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        kind: "DecisionModelResponse",
        status: "error",
        error: `http_${res.status}`,
        raw,
        limitations: limitations(),
      };
    }

    const content = extractContent(raw);
    const selected = parseSelectedId(content);
    if (!selected || !allowed.has(selected)) {
      return {
        kind: "DecisionModelResponse",
        status: "error",
        error: "decision_not_in_candidate_set",
        raw: { content, raw },
        limitations: limitations(),
      };
    }
    return {
      kind: "DecisionModelResponse",
      status: "ok",
      selected_id: selected,
      raw,
      limitations: [...limitations(), `model=${model}`],
    };
  } catch (err) {
    return {
      kind: "DecisionModelResponse",
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      limitations: limitations(),
    };
  }
}

function extractContent(raw: Record<string, unknown>): string {
  const choices = raw.choices as Array<{ message?: { content?: string } }> | undefined;
  return choices?.[0]?.message?.content ?? "";
}

function parseSelectedId(content: string): string | undefined {
  const trimmed = content.trim();
  try {
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as { selected_id?: string };
      if (parsed.selected_id) return parsed.selected_id;
    }
  } catch {
    /* fall through */
  }
  const m = /"selected_id"\s*:\s*"([^"]+)"/.exec(trimmed);
  return m?.[1];
}
