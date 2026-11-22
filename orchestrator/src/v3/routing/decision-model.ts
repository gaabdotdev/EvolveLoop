/**
 * Jev-style decision model client — fail-closed unless explicitly enabled AND endpoint works.
 * Does not claim OpenRouter Jev or local Nimble/Tev1 unless probed present.
 */

import type { RouteCandidate, RouteDecision } from "./types.js";

export interface DecisionModelProbe {
  kind: "DecisionModelProbe";
  available: boolean;
  backend: "ollama_systemone" | "none";
  base_url: string;
  error?: string;
  limitations: string[];
}

export interface DecisionModelRequest {
  work_id: string;
  task_summary: string;
  candidates: RouteCandidate[];
  /** Must be true — silent enable forbidden. */
  explicit_enable: boolean;
}

export interface DecisionModelResponse {
  kind: "DecisionModelResponse";
  status: "ok" | "disabled" | "unavailable" | "error";
  selected_id?: string;
  raw?: unknown;
  error?: string;
  limitations: string[];
}

function resolveBase(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OLLAMA_HOST || env.EVOLVELOOP_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
}

export async function probeDecisionModel(opts?: {
  baseUrl?: string;
  timeoutMs?: number;
}): Promise<DecisionModelProbe> {
  const base_url = opts?.baseUrl ?? resolveBase();
  const timeoutMs = opts?.timeoutMs ?? 4000;
  const limitations = [
    "Jev (OpenRouter) not wired — requires user keys + explicit enable",
    "Local path expects Ollama /v1/systemone (Jev-style), not the proprietary Jev model itself",
    "No silent mock decision when unavailable",
  ];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${base_url}/v1/systemone`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ping: true }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    if (res.status === 404) {
      return {
        kind: "DecisionModelProbe",
        available: false,
        backend: "none",
        base_url,
        error: "systemone_endpoint_404",
        limitations,
      };
    }
    // Any non-404 means the route exists (may still need a model)
    return {
      kind: "DecisionModelProbe",
      available: res.ok || res.status === 400 || res.status === 422,
      backend: "ollama_systemone",
      base_url,
      error: res.ok ? undefined : `http_${res.status}`,
      limitations,
    };
  } catch (err) {
    return {
      kind: "DecisionModelProbe",
      available: false,
      backend: "none",
      base_url,
      error: err instanceof Error ? err.message : String(err),
      limitations,
    };
  }
}

export async function invokeDecisionModel(req: DecisionModelRequest): Promise<DecisionModelResponse> {
  const limitations = [
    "Decision model cannot bypass hard constraints already applied to candidates",
    "Not a security authority",
  ];
  if (!req.explicit_enable) {
    return {
      kind: "DecisionModelResponse",
      status: "disabled",
      error: "explicit_enable_required",
      limitations,
    };
  }
  const probe = await probeDecisionModel();
  if (!probe.available) {
    return {
      kind: "DecisionModelResponse",
      status: "unavailable",
      error: probe.error ?? "decision_model_unavailable",
      limitations: [...limitations, ...probe.limitations],
    };
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(`${probe.base_url}/v1/systemone`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task: req.task_summary,
        work_id: req.work_id,
        candidates: req.candidates.map((c) => ({ id: c.id, kind: c.kind, score: c.score, reasons: c.reasons })),
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        kind: "DecisionModelResponse",
        status: "error",
        error: `http_${res.status}`,
        raw,
        limitations: [...limitations, ...probe.limitations],
      };
    }
    const selected =
      (raw as { selected_id?: string; choice?: string; id?: string }).selected_id ??
      (raw as { choice?: string }).choice ??
      (raw as { id?: string }).id;
    if (!selected || !req.candidates.some((c) => c.id === selected)) {
      return {
        kind: "DecisionModelResponse",
        status: "error",
        error: "decision_not_in_candidate_set",
        raw,
        limitations,
      };
    }
    return {
      kind: "DecisionModelResponse",
      status: "ok",
      selected_id: selected,
      raw,
      limitations,
    };
  } catch (err) {
    return {
      kind: "DecisionModelResponse",
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      limitations,
    };
  }
}

/** Merge decision-model choice onto a deterministic RouteDecision without inventing candidates. */
export function applyDecisionToRoute(
  base: RouteDecision,
  decision: DecisionModelResponse,
): RouteDecision {
  if (decision.status !== "ok" || !decision.selected_id) {
    return {
      ...base,
      status: "decision_model_unavailable",
      selected: undefined,
      rejected: [
        ...base.rejected,
        { id: "jev-style", reason: decision.error ?? decision.status },
      ],
      limitations: [...base.limitations, ...decision.limitations],
    };
  }
  const selected = base.candidates.find((c) => c.id === decision.selected_id);
  if (!selected) {
    return {
      ...base,
      status: "decision_model_unavailable",
      selected: undefined,
      rejected: [...base.rejected, { id: decision.selected_id, reason: "not_in_candidate_set" }],
      limitations: [...base.limitations, ...decision.limitations],
    };
  }
  return {
    ...base,
    status: "selected",
    selected,
    limitations: [
      ...base.limitations,
      ...decision.limitations,
      "selected_by=decision_model_after_hard_constraints",
    ],
  };
}
