/**
 * V1-PROD-02 — FreeLLMAPI first-class ModelProvider.
 * Catalog discovery/update; states ready|needsKey|exhausted;
 * record model_requested vs model_served; transparent fallback to Ollama/other.
 * Default base http://localhost:3001/v1 — must tolerate unreachable host.
 */

import type {
  ModelHealth,
  ModelInvokeRequest,
  ModelInvokeResult,
  ModelProvider,
} from "./types.js";

export type FreeLLMAPIState = "ready" | "needsKey" | "exhausted" | "unreachable";

export interface FreeLLMAPICatalogEntry {
  id: string;
  owned_by?: string;
  raw?: unknown;
}

export interface FreeLLMAPICatalog {
  updated_at: string;
  base_url: string;
  state: FreeLLMAPIState;
  models: FreeLLMAPICatalogEntry[];
  message: string;
}

export interface FreeLLMAPIInvokeMeta {
  model_requested: string;
  model_served: string | null;
  provider_state: FreeLLMAPIState;
  fallback_used: boolean;
  fallback_provider_id?: string;
}

export interface FreeLLMAPIModelProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  /** Injectable fetch for unit tests. */
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_BASE = "http://127.0.0.1:3001/v1";

function resolveBase(opts?: FreeLLMAPIModelProviderOptions): string {
  const env = opts?.env ?? process.env;
  return (
    opts?.baseUrl ||
    env.EVOLVELOOP_FREELLMAPI_URL ||
    DEFAULT_BASE
  ).replace(/\/$/, "");
}

function resolveKey(opts?: FreeLLMAPIModelProviderOptions): string | undefined {
  const env = opts?.env ?? process.env;
  return (
    opts?.apiKey ||
    env.EVOLVELOOP_FREELLMAPI_API_KEY ||
    env.FREELLMAPI_API_KEY ||
    undefined
  );
}

function resolveModel(opts?: FreeLLMAPIModelProviderOptions): string {
  const env = opts?.env ?? process.env;
  return opts?.model || env.EVOLVELOOP_FREELLMAPI_MODEL || "default";
}

function classifyHttpState(status: number, bodyText: string): FreeLLMAPIState {
  if (status === 401 || status === 403) return "needsKey";
  if (status === 429 || /quota|rate.?limit|exhausted|no.?credits/i.test(bodyText)) {
    return "exhausted";
  }
  return "unreachable";
}

export class FreeLLMAPIModelProvider implements ModelProvider {
  readonly provider_id = "freellmapi";
  readonly locality = "remote" as const;

  private catalogCache: FreeLLMAPICatalog | null = null;
  private lastState: FreeLLMAPIState = "unreachable";

  constructor(private readonly opts?: FreeLLMAPIModelProviderOptions) {}

  private fetchFn(): typeof fetch {
    return this.opts?.fetchImpl ?? fetch;
  }

  getState(): FreeLLMAPIState {
    return this.lastState;
  }

  getCachedCatalog(): FreeLLMAPICatalog | null {
    return this.catalogCache;
  }

  async discoverCatalog(): Promise<FreeLLMAPICatalog> {
    const base_url = resolveBase(this.opts);
    const updated_at = new Date().toISOString();
    const key = resolveKey(this.opts);
    const headers: Record<string, string> = { accept: "application/json" };
    if (key) headers.authorization = `Bearer ${key}`;

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.opts?.timeoutMs ?? 4000);
      const res = await this.fetchFn()(`${base_url}/models`, {
        headers,
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));

      const text = await res.text();
      if (!res.ok) {
        const state = classifyHttpState(res.status, text);
        this.lastState = state;
        this.catalogCache = {
          updated_at,
          base_url,
          state,
          models: [],
          message: `catalog HTTP ${res.status}`,
        };
        return this.catalogCache;
      }

      let parsed: { data?: Array<{ id?: string; owned_by?: string }> };
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        this.lastState = "unreachable";
        this.catalogCache = {
          updated_at,
          base_url,
          state: "unreachable",
          models: [],
          message: "invalid catalog JSON",
        };
        return this.catalogCache;
      }

      const models: FreeLLMAPICatalogEntry[] = (parsed.data ?? [])
        .filter((m) => m.id)
        .map((m) => ({ id: m.id!, owned_by: m.owned_by, raw: m }));

      const state: FreeLLMAPIState = models.length > 0 ? "ready" : key ? "ready" : "needsKey";
      this.lastState = state;
      this.catalogCache = {
        updated_at,
        base_url,
        state,
        models,
        message: models.length > 0 ? `catalog=${models.length} models` : "empty catalog",
      };
      return this.catalogCache;
    } catch (err) {
      this.lastState = "unreachable";
      this.catalogCache = {
        updated_at,
        base_url,
        state: "unreachable",
        models: [],
        message: err instanceof Error ? err.message : String(err),
      };
      return this.catalogCache;
    }
  }

  async healthCheck(): Promise<ModelHealth> {
    const checked_at = new Date().toISOString();
    const base_url = resolveBase(this.opts);
    const limitations = [
      "FreeLLMAPI has no SLA guarantee — treat as best-effort",
      "Fallback to Ollama/other is explicit, never silent assumption of availability",
      "Default base http://127.0.0.1:3001/v1 may be down",
    ];
    const key = resolveKey(this.opts);
    if (!key && (this.opts?.env?.EVOLVELOOP_FREELLMAPI_REQUIRE_KEY === "true")) {
      this.lastState = "needsKey";
      return {
        kind: "ModelHealth",
        provider_id: this.provider_id,
        ok: false,
        code: "NEEDS_KEY",
        message: "FreeLLMAPI API key required",
        base_url,
        checked_at,
        limitations,
      };
    }

    const catalog = await this.discoverCatalog();
    const ok = catalog.state === "ready";
    return {
      kind: "ModelHealth",
      provider_id: this.provider_id,
      ok,
      code:
        catalog.state === "ready"
          ? "OK"
          : catalog.state === "needsKey"
            ? "NEEDS_KEY"
            : catalog.state === "exhausted"
              ? "EXHAUSTED"
              : "UNREACHABLE",
      message: catalog.message,
      model: catalog.models[0]?.id,
      base_url,
      checked_at,
      limitations,
    };
  }

  async invoke(req: ModelInvokeRequest): Promise<ModelInvokeResult & { freellmapi?: FreeLLMAPIInvokeMeta }> {
    const model_requested = req.model || resolveModel(this.opts);
    const base_url = resolveBase(this.opts);
    const key = resolveKey(this.opts);
    const started = Date.now();
    const limitations = [
      "FreeLLMAPI best-effort; no SLA",
      `model_requested=${model_requested}`,
    ];

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (key) headers.authorization = `Bearer ${key}`;

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), req.timeout_ms ?? this.opts?.timeoutMs ?? 60_000);
      const res = await this.fetchFn()(`${base_url}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: model_requested,
          messages: [{ role: "user", content: req.prompt }],
        }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));

      const text = await res.text();
      if (!res.ok) {
        const state = classifyHttpState(res.status, text);
        this.lastState = state;
        return {
          kind: "ModelInvokeResult",
          provider_id: this.provider_id,
          status: state === "needsKey" || state === "exhausted" ? "blocked" : "failed",
          code: state.toUpperCase(),
          message: `FreeLLMAPI invoke HTTP ${res.status}`,
          model: model_requested,
          latency_ms: Date.now() - started,
          cost_provenance: "UNAVAILABLE",
          limitations,
          freellmapi: {
            model_requested,
            model_served: null,
            provider_state: state,
            fallback_used: false,
          },
        };
      }

      let body: {
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      try {
        body = JSON.parse(text) as typeof body;
      } catch {
        this.lastState = "unreachable";
        return {
          kind: "ModelInvokeResult",
          provider_id: this.provider_id,
          status: "failed",
          code: "BAD_JSON",
          message: "invalid FreeLLMAPI response JSON",
          model: model_requested,
          latency_ms: Date.now() - started,
          cost_provenance: "UNAVAILABLE",
          limitations,
          freellmapi: {
            model_requested,
            model_served: null,
            provider_state: "unreachable",
            fallback_used: false,
          },
        };
      }

      const model_served = body.model ?? model_requested;
      this.lastState = "ready";
      return {
        kind: "ModelInvokeResult",
        provider_id: this.provider_id,
        status: "ok",
        code: "OK",
        message: "freellmapi chat ok",
        model: model_served,
        text: body.choices?.[0]?.message?.content ?? "",
        latency_ms: Date.now() - started,
        tokens_in: body.usage?.prompt_tokens ?? null,
        tokens_out: body.usage?.completion_tokens ?? null,
        cost_usd: null,
        cost_provenance:
          body.usage?.prompt_tokens != null || body.usage?.completion_tokens != null
            ? "reported"
            : "UNAVAILABLE",
        limitations: [...limitations, `model_served=${model_served}`],
        freellmapi: {
          model_requested,
          model_served,
          provider_state: "ready",
          fallback_used: false,
        },
      };
    } catch (err) {
      this.lastState = "unreachable";
      const name = err instanceof Error ? err.name : "";
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout =
        name === "AbortError" ||
        name === "TimeoutError" ||
        /aborted|timeout/i.test(msg);
      return {
        kind: "ModelInvokeResult",
        provider_id: this.provider_id,
        status: "failed",
        code: isTimeout ? "TIMEOUT_MID_STREAM" : "UNREACHABLE",
        message: isTimeout ? `timeout mid-stream: ${msg}` : msg,
        model: model_requested,
        latency_ms: Date.now() - started,
        cost_provenance: "UNAVAILABLE",
        limitations,
        freellmapi: {
          model_requested,
          model_served: null,
          provider_state: "unreachable",
          fallback_used: false,
        },
      };
    }
  }
}

export interface FallbackChainResult {
  kind: "FallbackChainResult";
  primary: ModelInvokeResult & { freellmapi?: FreeLLMAPIInvokeMeta };
  final: ModelInvokeResult;
  fallback_used: boolean;
  fallback_provider_id?: string;
  model_requested: string;
  model_served: string | null;
}

/**
 * Transparent fallback: try FreeLLMAPI, then Ollama/other — without assuming SLA.
 */
export async function invokeWithFallback(opts: {
  primary: FreeLLMAPIModelProvider;
  fallbacks: ModelProvider[];
  request: ModelInvokeRequest;
}): Promise<FallbackChainResult> {
  const model_requested = opts.request.model || resolveModel();
  const primary = await opts.primary.invoke(opts.request);
  if (primary.status === "ok") {
    return {
      kind: "FallbackChainResult",
      primary,
      final: primary,
      fallback_used: false,
      model_requested,
      model_served: primary.freellmapi?.model_served ?? primary.model ?? null,
    };
  }

  for (const fb of opts.fallbacks) {
    const result = await fb.invoke(opts.request);
    if (result.status === "ok") {
      return {
        kind: "FallbackChainResult",
        primary,
        final: {
          ...result,
          limitations: [
            ...result.limitations,
            `fallback_from=freellmapi:${primary.code}`,
            "no_sla_assumed",
          ],
        },
        fallback_used: true,
        fallback_provider_id: fb.provider_id,
        model_requested,
        model_served: result.model ?? null,
      };
    }
  }

  return {
    kind: "FallbackChainResult",
    primary,
    final: primary,
    fallback_used: false,
    model_requested,
    model_served: null,
  };
}
