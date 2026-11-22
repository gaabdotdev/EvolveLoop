/**
 * Nomic Embed Text via Ollama — real probe/embed when available; otherwise fail-closed.
 * Does not invent embedding dimensions or pretend semantic index productization.
 */

export interface EmbeddingProbeResult {
  kind: "EmbeddingProbeResult";
  available: boolean;
  backend: "ollama";
  model_id: string;
  base_url: string;
  embedding_dim?: number;
  error?: string;
  limitations: string[];
}

export interface EmbedResult {
  kind: "EmbedResult";
  status: "ok" | "unavailable" | "error";
  model_id: string;
  texts: string[];
  vectors?: number[][];
  embedding_dim?: number;
  error?: string;
  limitations: string[];
}

const DEFAULT_BASE = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "nomic-embed-text";

function limitations(extra: string[] = []): string[] {
  return [
    "Embeddings are vectors only — not a conversational model",
    "Presence of vectors ≠ full Context Intelligence productization",
    "No invented token/cost telemetry from this client",
    ...extra,
  ];
}

export function resolveOllamaBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OLLAMA_HOST || env.EVOLVELOOP_OLLAMA_URL || DEFAULT_BASE).replace(/\/$/, "");
}

export function resolveNomicModelId(env: NodeJS.ProcessEnv = process.env): string {
  return env.EVOLVELOOP_NOMIC_MODEL || DEFAULT_MODEL;
}

export async function probeNomicEmbed(opts?: {
  baseUrl?: string;
  modelId?: string;
  timeoutMs?: number;
}): Promise<EmbeddingProbeResult> {
  const base_url = opts?.baseUrl ?? resolveOllamaBaseUrl();
  const model_id = opts?.modelId ?? resolveNomicModelId();
  const timeoutMs = opts?.timeoutMs ?? 8000;

  try {
    const tags = await fetchJson(`${base_url}/api/tags`, undefined, timeoutMs);
    const names: string[] = Array.isArray(tags.models)
      ? tags.models.map((m: { name?: string }) => String(m.name ?? ""))
      : [];
    const found = names.some((n) => n === model_id || n.startsWith(`${model_id}:`) || n.startsWith("nomic-embed-text"));
    if (!found) {
      return {
        kind: "EmbeddingProbeResult",
        available: false,
        backend: "ollama",
        model_id,
        base_url,
        error: `model_not_installed:${model_id}`,
        limitations: limitations(["Install with: ollama pull nomic-embed-text"]),
      };
    }

    const emb = await fetchJson(
      `${base_url}/api/embeddings`,
      { model: model_id.includes(":") ? model_id : "nomic-embed-text", prompt: "probe" },
      timeoutMs,
    );
    const dim = Array.isArray(emb.embedding) ? emb.embedding.length : undefined;
    if (!dim) {
      return {
        kind: "EmbeddingProbeResult",
        available: false,
        backend: "ollama",
        model_id,
        base_url,
        error: "embedding_response_missing_vector",
        limitations: limitations(),
      };
    }
    return {
      kind: "EmbeddingProbeResult",
      available: true,
      backend: "ollama",
      model_id,
      base_url,
      embedding_dim: dim,
      limitations: limitations(),
    };
  } catch (err) {
    return {
      kind: "EmbeddingProbeResult",
      available: false,
      backend: "ollama",
      model_id,
      base_url,
      error: err instanceof Error ? err.message : String(err),
      limitations: limitations(["Ollama unreachable or timed out"]),
    };
  }
}

export async function embedTexts(
  texts: string[],
  opts?: { baseUrl?: string; modelId?: string; timeoutMs?: number; requireAvailable?: boolean },
): Promise<EmbedResult> {
  const base_url = opts?.baseUrl ?? resolveOllamaBaseUrl();
  const model_id = opts?.modelId ?? resolveNomicModelId();
  const timeoutMs = opts?.timeoutMs ?? 30_000;

  if (!texts.length) {
    return {
      kind: "EmbedResult",
      status: "error",
      model_id,
      texts,
      error: "empty_texts",
      limitations: limitations(),
    };
  }

  const probe = await probeNomicEmbed({ baseUrl: base_url, modelId: model_id, timeoutMs: Math.min(timeoutMs, 8000) });
  if (!probe.available) {
    return {
      kind: "EmbedResult",
      status: "unavailable",
      model_id,
      texts,
      error: probe.error,
      limitations: probe.limitations,
    };
  }

  const model = model_id.includes(":") ? model_id : "nomic-embed-text";
  const vectors: number[][] = [];
  try {
    for (const text of texts) {
      const emb = await fetchJson(`${base_url}/api/embeddings`, { model, prompt: text }, timeoutMs);
      if (!Array.isArray(emb.embedding)) {
        return {
          kind: "EmbedResult",
          status: "error",
          model_id,
          texts,
          error: "embedding_missing",
          limitations: limitations(),
        };
      }
      vectors.push(emb.embedding as number[]);
    }
    return {
      kind: "EmbedResult",
      status: "ok",
      model_id,
      texts,
      vectors,
      embedding_dim: vectors[0]?.length,
      limitations: limitations(),
    };
  } catch (err) {
    return {
      kind: "EmbedResult",
      status: "error",
      model_id,
      texts,
      error: err instanceof Error ? err.message : String(err),
      limitations: limitations(),
    };
  }
}

async function fetchJson(
  url: string,
  body: Record<string, unknown> | undefined,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`non_json_status_${res.status}`);
    }
    if (!res.ok) {
      throw new Error(String(parsed.error ?? `http_${res.status}`));
    }
    return parsed;
  } finally {
    clearTimeout(t);
  }
}
