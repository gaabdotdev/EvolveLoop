/**
 * V2-MEM-01 — Optional Ollama lesson extractor.
 *
 * Failures propagate to ConsolidationEngine, which falls back to extractRulesHeuristic.
 * Does not assume Ollama is online (CI-safe when unused).
 */

import type { LessonExtractorPort, VerifiedEpisode } from "./consolidation.js";
import { extractRulesHeuristic } from "./consolidation.js";

export interface OllamaLessonAdapterOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  /** Inject fetch for tests. */
  fetchFn?: typeof fetch;
  /**
   * When true, parse failure / empty model output throws so the engine
   * falls back to heuristic (default). When false, returns heuristic locally.
   */
  throwOnFailure?: boolean;
}

function resolveBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OLLAMA_HOST || env.EVOLVELOOP_OLLAMA_URL || "http://127.0.0.1:11434").replace(
    /\/$/,
    "",
  );
}

function resolveModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.EVOLVELOOP_OLLAMA_MODEL || env.OLLAMA_MODEL || "bonsai-64k:latest";
}

function parseLessonPayload(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Prefer JSON array if the model complied.
  try {
    const jsonStart = trimmed.indexOf("[");
    const jsonEnd = trimmed.lastIndexOf("]");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((x) => String(x).trim()).filter((s) => s.length >= 8);
      }
    }
  } catch {
    // fall through to heuristic parse of free text
  }

  return extractRulesHeuristic(trimmed);
}

/**
 * Optional Ollama-backed LessonExtractorPort.
 * Network/HTTP/parse failures throw (engine → heuristic) unless throwOnFailure=false.
 */
export class OllamaLessonAdapter implements LessonExtractorPort {
  readonly extractor_id = "ollama-lesson";
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly throwOnFailure: boolean;

  constructor(opts?: OllamaLessonAdapterOptions) {
    this.baseUrl = opts?.baseUrl ?? resolveBaseUrl();
    this.model = opts?.model ?? resolveModel();
    this.timeoutMs = opts?.timeoutMs ?? 8_000;
    this.fetchFn = opts?.fetchFn ?? fetch;
    this.throwOnFailure = opts?.throwOnFailure ?? true;
  }

  async extractLessons(episode: VerifiedEpisode): Promise<string[]> {
    const prompt = [
      "Extract durable engineering lessons from this verified episode.",
      "Return ONLY a JSON array of short lesson strings.",
      "",
      `Episode id: ${episode.episode_id}`,
      `Evidence ids: ${episode.evidence_ids.join(", ") || "(none)"}`,
      "Summary:",
      episode.summary,
    ].join("\n");

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
      const res = await this.fetchFn(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          format: "json",
        }),
      }).finally(() => clearTimeout(t));

      if (!res.ok) {
        throw new Error(`Ollama /api/generate HTTP_${res.status}`);
      }

      const body = (await res.json()) as { response?: string };
      const lessons = parseLessonPayload(body.response ?? "");
      if (lessons.length === 0) {
        throw new Error("Ollama returned no parseable lessons");
      }
      return lessons;
    } catch (err) {
      if (!this.throwOnFailure) {
        return extractRulesHeuristic(episode.summary);
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}
