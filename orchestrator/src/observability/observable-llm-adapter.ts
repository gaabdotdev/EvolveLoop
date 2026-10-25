/**
 * EvolveLoop V2.5 - Observable LLM Provider Adapter
 * Directly connects G1 Inference Ledger and classification to LLM completions in V2.5.
 * Strictly decoupled from OmniRoute (runs with direct provider fallback).
 * Enforces SSRF prevention, allowlisted providers, and rigorous input validation.
 */

import {
  classifyHttpInferenceUsage,
  type InferenceSpanRecord,
} from "./inference-usage.ts";
import {
  appendInferenceSpan,
} from "./inference-ledger.ts";

export type FetchFn = typeof fetch;

export interface ObservableLlmAdapterResult {
  text: string;
  raw: unknown;
  span?: InferenceSpanRecord;
  ledgerWritten: boolean;
  ledgerPath?: string;
}

export interface ObservableCompletionInput {
  provider?: "anthropic" | "openai" | string;
  model?: string;
  prompt?: string;
  system_prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  apiKey?: string;
  maxTokens?: number;
  max_tokens?: number;
  temperature?: number;
  featureId?: string;
  memoryRoot?: string;
  runId?: string;
  taskId?: string;
  agentId?: string;
  phase?: string;
  retryIndex?: number;
  gatewayUrl?: string;
}

const ALLOWED_PROVIDERS = new Set(["anthropic", "openai"]);

const DEFAULT_ENDPOINTS: Record<string, string> = {
  anthropic: "https://api.anthropic.com/v1/messages",
  openai: "https://api.openai.com/v1/chat/completions",
};

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-3-5-sonnet",
  openai: "gpt-4o",
};

/**
 * Validates target endpoint against SSRF and unauthorized network destinations.
 */
export function validateTargetUrl(rawUrl: string, allowLoopback = false): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`[-] SECURITY_SSRF_VIOLATION: Invalid target URL '${rawUrl}'.`);
  }

  if (parsed.protocol !== "https:" && !(allowLoopback && parsed.protocol === "http:")) {
    throw new Error(
      `[-] SECURITY_SSRF_VIOLATION: Protocol '${parsed.protocol}' is forbidden. Only HTTPS is permitted.`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error("[-] SECURITY_SSRF_VIOLATION: Embedded credentials in target URL are strictly prohibited.");
  }

  const hostname = parsed.hostname.toLowerCase();

  // Cloud metadata endpoint protection
  if (hostname === "169.254.169.254" || hostname === "metadata.google.internal") {
    throw new Error(`[-] SECURITY_SSRF_VIOLATION: Cloud metadata endpoint '${hostname}' is blocked.`);
  }

  // Loopback and private network boundaries
  const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (isLoopback && !allowLoopback) {
    throw new Error(`[-] SECURITY_SSRF_VIOLATION: Loopback connection to '${hostname}' is not authorized.`);
  }

  return parsed;
}

export class ObservableLlmProviderAdapter {
  private readonly fetchImpl: FetchFn;
  private readonly allowLoopback: boolean;

  constructor(fetchImpl: FetchFn = fetch, options: { allowLoopback?: boolean } = {}) {
    this.fetchImpl = fetchImpl;
    this.allowLoopback = options.allowLoopback ?? false;
  }

  async complete(input: ObservableCompletionInput): Promise<ObservableLlmAdapterResult> {
    const startTime = performance.now();

    const provider = (input.provider || "anthropic").toLowerCase();
    if (!ALLOWED_PROVIDERS.has(provider)) {
      throw new Error(`[-] UNSUPPORTED_PROVIDER: Provider '${provider}' is not in the authorized allowlist.`);
    }

    const model = input.model || DEFAULT_MODELS[provider] || "default-model";

    // Build structured messages from input.prompt / input.messages
    let messages: Array<{ role: string; content: string }> = [];
    if (input.messages && Array.isArray(input.messages) && input.messages.length > 0) {
      messages = input.messages;
    } else if (input.prompt && typeof input.prompt === "string" && input.prompt.trim().length > 0) {
      if (input.prompt.length > 64000) {
        throw new Error("[-] PAYLOAD_LIMIT_EXCEEDED: Prompt exceeds maximum permitted size of 64,000 characters.");
      }
      messages = [{ role: "user", content: input.prompt.trim() }];
    } else {
      throw new Error("[-] INVALID_INPUT: 'prompt' or non-empty 'messages' array is required.");
    }

    const rawTargetUrl = input.gatewayUrl || DEFAULT_ENDPOINTS[provider];
    const validatedUrl = validateTargetUrl(rawTargetUrl, this.allowLoopback);
    const targetUrl = validatedUrl.toString();

    // Resolving API credentials safely from parameter or environment
    const apiKey =
      input.apiKey ||
      (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY) ||
      undefined;

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (apiKey) {
      if (provider === "anthropic") {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        headers["authorization"] = `Bearer ${apiKey}`;
      }
    }

    const maxTokens = Math.min(Math.max(input.maxTokens ?? input.max_tokens ?? 1024, 1), 4096);
    const temperature = typeof input.temperature === "number" ? Math.max(0, Math.min(input.temperature, 1)) : 0;

    let bodyPayload: Record<string, unknown>;
    if (provider === "anthropic") {
      bodyPayload = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages,
      };
      if (input.system_prompt) {
        bodyPayload.system = input.system_prompt;
      }
    } else {
      const openAiMessages = input.system_prompt
        ? [{ role: "system", content: input.system_prompt }, ...messages]
        : messages;

      bodyPayload = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: openAiMessages,
      };
    }

    let res: Response;
    let durationMs: number;

    try {
      res = await this.fetchImpl(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyPayload),
      });
      durationMs = Number((performance.now() - startTime).toFixed(2));
    } catch (fetchErr: unknown) {
      durationMs = Number((performance.now() - startTime).toFixed(2));
      let ledgerWritten = false;
      let ledgerPath: string | undefined;

      if (input.memoryRoot && input.featureId) {
        const failureSpan = classifyHttpInferenceUsage({
          httpOk: false,
          runId: input.runId,
          taskId: input.taskId,
          agentId: input.agentId,
          phase: input.phase,
          provider,
          model,
          retryIndex: input.retryIndex,
          durationMs,
          outcome: "error",
        });
        const ledgerResult = appendInferenceSpan(input.memoryRoot, input.featureId, failureSpan);
        ledgerWritten = ledgerResult.ok;
        ledgerPath = ledgerResult.path;
      }
      throw fetchErr;
    }

    if (!res.ok) {
      let ledgerWritten = false;
      let ledgerPath: string | undefined;

      if (input.memoryRoot && input.featureId) {
        const failureSpan = classifyHttpInferenceUsage({
          httpOk: false,
          runId: input.runId,
          taskId: input.taskId,
          agentId: input.agentId,
          phase: input.phase,
          provider,
          model,
          retryIndex: input.retryIndex,
          durationMs,
          outcome: "error",
        });
        const ledgerResult = appendInferenceSpan(input.memoryRoot, input.featureId, failureSpan);
        ledgerWritten = ledgerResult.ok;
        ledgerPath = ledgerResult.path;
      }
      throw new Error(`${provider}_http_${res.status}`);
    }

    const raw = (await res.json()) as unknown;
    let span: InferenceSpanRecord | undefined;
    let ledgerWritten = false;
    let ledgerPath: string | undefined;

    if (input.memoryRoot && input.featureId) {
      span = classifyHttpInferenceUsage({
        httpOk: true,
        body: raw,
        runId: input.runId,
        taskId: input.taskId,
        agentId: input.agentId,
        phase: input.phase,
        provider,
        model,
        retryIndex: input.retryIndex,
        durationMs,
        outcome: "success",
      });
      const ledgerResult = appendInferenceSpan(input.memoryRoot, input.featureId, span);
      ledgerWritten = ledgerResult.ok;
      ledgerPath = ledgerResult.path;
    }

    let text = "";
    if (provider === "anthropic") {
      const content = (raw as { content?: Array<{ type?: string; text?: string }> })?.content;
      if (Array.isArray(content)) {
        text = content
          .filter((c) => c.type === "text" && c.text)
          .map((c) => c.text!)
          .join("");
      }
    } else {
      const choices = (raw as { choices?: Array<{ message?: { content?: string } }> })?.choices;
      text = choices?.[0]?.message?.content ?? "";
    }

    return {
      text,
      raw,
      span,
      ledgerWritten,
      ledgerPath,
    };
  }
}
