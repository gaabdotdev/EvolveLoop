/**
 * Local Ollama ModelProvider — healthCheck hits /api/tags; invoke uses /api/generate.
 */

import type {
  ModelHealth,
  ModelInvokeRequest,
  ModelInvokeResult,
  ModelProvider,
} from "./types.js";

function baseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OLLAMA_HOST || env.EVOLVELOOP_OLLAMA_URL || "http://127.0.0.1:11434").replace(
    /\/$/,
    "",
  );
}

function defaultModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.EVOLVELOOP_OLLAMA_MODEL || env.OLLAMA_MODEL || "bonsai-64k:latest";
}

export class OllamaModelProvider implements ModelProvider {
  readonly provider_id = "ollama";
  readonly locality = "local" as const;

  constructor(
    private readonly opts?: { baseUrl?: string; model?: string; timeoutMs?: number },
  ) {}

  private url(): string {
    return this.opts?.baseUrl ?? baseUrl();
  }

  async healthCheck(): Promise<ModelHealth> {
    const checked_at = new Date().toISOString();
    const base_url = this.url();
    const limitations = [
      "Local Ollama only — no FreeLLMAPI gateway",
      "Availability is probed via GET /api/tags",
    ];
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.opts?.timeoutMs ?? 4000);
      const res = await fetch(`${base_url}/api/tags`, { signal: ctrl.signal }).finally(() =>
        clearTimeout(t),
      );
      if (!res.ok) {
        return {
          kind: "ModelHealth",
          provider_id: this.provider_id,
          ok: false,
          code: `HTTP_${res.status}`,
          message: `Ollama /api/tags failed with ${res.status}`,
          base_url,
          checked_at,
          limitations,
        };
      }
      const body = (await res.json()) as { models?: Array<{ name?: string }> };
      const names = (body.models ?? []).map((m) => m.name).filter(Boolean) as string[];
      const want = this.opts?.model ?? defaultModel();
      const has = names.includes(want) || names.some((n) => n.startsWith(want.split(":")[0]!));
      return {
        kind: "ModelHealth",
        provider_id: this.provider_id,
        ok: names.length > 0,
        code: names.length > 0 ? (has ? "OK" : "OK_MODEL_FALLBACK") : "NO_MODELS",
        message:
          names.length === 0
            ? "Ollama reachable but no models pulled"
            : has
              ? `Ollama ok; model=${want}`
              : `Ollama ok; preferred model ${want} missing; available=${names.slice(0, 5).join(",")}`,
        model: has ? want : names[0],
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
    const model = req.model || health.model || defaultModel();
    const started = Date.now();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), req.timeout_ms ?? 60_000);
      const res = await fetch(`${this.url()}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, prompt: req.prompt, stream: false }),
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
        response?: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };
      return {
        kind: "ModelInvokeResult",
        provider_id: this.provider_id,
        status: "ok",
        code: "OK",
        message: "ollama generate ok",
        model,
        text: body.response ?? "",
        latency_ms: Date.now() - started,
        tokens_in: body.prompt_eval_count ?? null,
        tokens_out: body.eval_count ?? null,
        cost_usd: null,
        cost_provenance:
          body.prompt_eval_count != null || body.eval_count != null ? "reported" : "UNAVAILABLE",
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
