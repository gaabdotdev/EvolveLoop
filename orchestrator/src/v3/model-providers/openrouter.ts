/**
 * Remote OpenRouter ModelProvider — fail-closed without API key.
 * Interfaces stay decoupled; missing credentials → honest healthCheck failure.
 */

import type {
  ModelHealth,
  ModelInvokeRequest,
  ModelInvokeResult,
  ModelProvider,
} from "./types.js";

const DEFAULT_BASE = "https://openrouter.ai/api/v1";

function apiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return (
    env.EVOLVELOOP_OPENROUTER_API_KEY ||
    env.OPENROUTER_API_KEY ||
    undefined
  );
}

function baseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.EVOLVELOOP_OPENROUTER_URL || DEFAULT_BASE).replace(/\/$/, "");
}

function defaultModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.EVOLVELOOP_OPENROUTER_MODEL || "openai/gpt-4o-mini";
}

export class OpenRouterModelProvider implements ModelProvider {
  readonly provider_id = "openrouter";
  readonly locality = "remote" as const;

  constructor(
    private readonly opts?: { baseUrl?: string; model?: string; timeoutMs?: number },
  ) {}

  async healthCheck(): Promise<ModelHealth> {
    const checked_at = new Date().toISOString();
    const base_url = this.opts?.baseUrl ?? baseUrl();
    const limitations = [
      "Remote OpenRouter never used as silent default",
      "Requires OPENROUTER_API_KEY or EVOLVELOOP_OPENROUTER_API_KEY",
      "Does not invent cost when usage fields absent",
    ];
    const key = apiKey();
    if (!key) {
      return {
        kind: "ModelHealth",
        provider_id: this.provider_id,
        ok: false,
        code: "MISSING_CREDENTIALS",
        message: "OpenRouter API key absent — healthCheck failed honestly",
        base_url,
        model: this.opts?.model ?? defaultModel(),
        checked_at,
        limitations,
      };
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.opts?.timeoutMs ?? 5000);
      const res = await fetch(`${base_url}/models`, {
        headers: { authorization: `Bearer ${key}` },
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));
      if (!res.ok) {
        return {
          kind: "ModelHealth",
          provider_id: this.provider_id,
          ok: false,
          code: `HTTP_${res.status}`,
          message: `OpenRouter /models failed with ${res.status}`,
          base_url,
          checked_at,
          limitations,
        };
      }
      return {
        kind: "ModelHealth",
        provider_id: this.provider_id,
        ok: true,
        code: "OK",
        message: "OpenRouter credentials present and /models reachable",
        model: this.opts?.model ?? defaultModel(),
        base_url,
        checked_at,
        limitations,
      };
    } catch (err) {
      return {
        kind: "ModelHealth",
        provider_id: this.provider_id,
        ok: false,
        code: "UNREACHABLE",
        message: err instanceof Error ? err.message : String(err),
        base_url,
        checked_at,
        limitations,
      };
    }
  }

  async invoke(req: ModelInvokeRequest): Promise<ModelInvokeResult> {
    const health = await this.healthCheck();
    if (!health.ok) {
      return {
        kind: "ModelInvokeResult",
        provider_id: this.provider_id,
        status: "blocked",
        code: health.code,
        message: health.message,
        cost_provenance: "UNAVAILABLE",
        limitations: health.limitations,
      };
    }
    const key = apiKey()!;
    const model = req.model || health.model || defaultModel();
    const started = Date.now();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), req.timeout_ms ?? 60_000);
      const res = await fetch(`${health.base_url}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: req.prompt }],
        }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));
      if (!res.ok) {
        return {
          kind: "ModelInvokeResult",
          provider_id: this.provider_id,
          status: "failed",
          code: `HTTP_${res.status}`,
          message: await res.text(),
          model,
          latency_ms: Date.now() - started,
          cost_provenance: "UNAVAILABLE",
          limitations: health.limitations,
        };
      }
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const text = body.choices?.[0]?.message?.content ?? "";
      const tokens_in = body.usage?.prompt_tokens ?? null;
      const tokens_out = body.usage?.completion_tokens ?? null;
      return {
        kind: "ModelInvokeResult",
        provider_id: this.provider_id,
        status: "ok",
        code: "OK",
        message: "openrouter chat ok",
        model,
        text,
        latency_ms: Date.now() - started,
        tokens_in,
        tokens_out,
        cost_usd: null,
        cost_provenance: tokens_in != null || tokens_out != null ? "reported" : "UNAVAILABLE",
        limitations: health.limitations,
      };
    } catch (err) {
      return {
        kind: "ModelInvokeResult",
        provider_id: this.provider_id,
        status: "failed",
        code: "INVOKE_ERROR",
        message: err instanceof Error ? err.message : String(err),
        model,
        latency_ms: Date.now() - started,
        cost_provenance: "UNAVAILABLE",
        limitations: health.limitations,
      };
    }
  }
}
