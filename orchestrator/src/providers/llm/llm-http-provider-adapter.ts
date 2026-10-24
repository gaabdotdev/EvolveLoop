/**
 * V22-GOAL-010-vendor — HTTP LLM provider adapter with vendor cache_control + usage parse.
 */

import type { PromptCachePart } from "../../v22/prompt-cache-http.js";
import { buildStablePromptPrefix } from "../../v22/prompt-cache-http.js";
import { redactSecrets } from "../../evidence/secret-redaction.js";
import {
  parseAnthropicCacheUsage,
  parseOpenAiCacheUsage,
  type VendorCacheUsage,
} from "./vendor-cache-usage.js";
import {
  buildVendorCacheTelemetry,
  persistVendorCacheTelemetry,
  type VendorCacheTelemetryRecord,
} from "./vendor-cache-telemetry.js";
import {
  classifyHttpInferenceUsage,
  type InferenceSpanRecord,
} from "../../observability/inference-usage.js";
import { appendInferenceSpan } from "../../observability/inference-ledger.js";
import { resolveLlmGatewayUrl } from "./llm-gateway-target.js";

export type FetchFn = typeof fetch;

export interface LlmAdapterResult {
  text: string;
  raw: unknown;
  usage: VendorCacheUsage;
  telemetry: VendorCacheTelemetryRecord;
  span?: InferenceSpanRecord;
}

export interface AnthropicCompleteInput {
  apiKey: string;
  model: string;
  stablePrefixParts: PromptCachePart[];
  userMessage: string;
  maxTokens?: number;
  featureId?: string;
  memoryRoot?: string;
  callIndex?: number;
  liveProbe?: boolean;
  runId?: string;
  taskId?: string;
  agentId?: string;
  phase?: string;
  retryIndex?: number;
  durationMs?: number;
}

export interface OpenAiCompleteInput {
  apiKey: string;
  model: string;
  stablePrefixParts: PromptCachePart[];
  userMessage: string;
  maxTokens?: number;
  featureId?: string;
  memoryRoot?: string;
  callIndex?: number;
  liveProbe?: boolean;
  runId?: string;
  taskId?: string;
  agentId?: string;
  phase?: string;
  retryIndex?: number;
  durationMs?: number;
}

export function buildAnthropicMessagesBody(input: {
  model: string;
  stablePrefixParts: PromptCachePart[];
  userMessage: string;
  maxTokens?: number;
}): Record<string, unknown> {
  const stableText = buildStablePromptPrefix(input.stablePrefixParts);
  return {
    model: input.model,
    max_tokens: input.maxTokens ?? 64,
    system: [
      {
        type: "text",
        text: stableText,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: redactSecrets(input.userMessage) }],
  };
}

export function buildOpenAiChatBody(input: {
  model: string;
  stablePrefixParts: PromptCachePart[];
  userMessage: string;
  maxTokens?: number;
}): Record<string, unknown> {
  const stableText = buildStablePromptPrefix(input.stablePrefixParts);
  return {
    model: input.model,
    max_tokens: input.maxTokens ?? 64,
    messages: [
      {
        role: "system",
        content: stableText,
      },
      { role: "user", content: redactSecrets(input.userMessage) },
    ],
  };
}

function extractAnthropicText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const content = (body as { content?: Array<{ type?: string; text?: string }> }).content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("");
}

function extractOpenAiText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const choices = (body as { choices?: Array<{ message?: { content?: string } }> }).choices;
  return choices?.[0]?.message?.content ?? "";
}

export class LlmHttpProviderAdapter {
  constructor(private readonly fetchImpl: FetchFn = fetch) {}

  async completeAnthropic(input: AnthropicCompleteInput): Promise<LlmAdapterResult> {
    const body = buildAnthropicMessagesBody(input);
    const url = resolveLlmGatewayUrl("anthropic", process.env);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": input.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (input.memoryRoot && input.featureId) {
        const failureSpan = classifyHttpInferenceUsage({
          httpOk: false,
          runId: input.runId,
          taskId: input.taskId,
          agentId: input.agentId,
          phase: input.phase,
          provider: "anthropic",
          model: input.model,
          retryIndex: input.retryIndex,
          durationMs: input.durationMs,
          outcome: "error",
        });
        appendInferenceSpan(input.memoryRoot, input.featureId, failureSpan);
      }
      throw err;
    }
    if (!res.ok) {
      if (input.memoryRoot && input.featureId) {
        const failureSpan = classifyHttpInferenceUsage({
          httpOk: false,
          runId: input.runId,
          taskId: input.taskId,
          agentId: input.agentId,
          phase: input.phase,
          provider: "anthropic",
          model: input.model,
          retryIndex: input.retryIndex,
          durationMs: input.durationMs,
        });
        appendInferenceSpan(input.memoryRoot, input.featureId, failureSpan);
      }
      throw new Error(`anthropic_http_${res.status}`);
    }
    const raw = (await res.json()) as unknown;
    const usage = parseAnthropicCacheUsage(raw);
    const telemetry = buildVendorCacheTelemetry({
      vendor: "anthropic",
      usage,
      stablePrefixParts: input.stablePrefixParts,
      callIndex: input.callIndex,
      liveProbe: input.liveProbe,
    });
    let span: InferenceSpanRecord | undefined;
    if (input.memoryRoot && input.featureId) {
      persistVendorCacheTelemetry(input.memoryRoot, input.featureId, telemetry);
      span = classifyHttpInferenceUsage({
        httpOk: true,
        body: raw,
        runId: input.runId,
        taskId: input.taskId,
        agentId: input.agentId,
        phase: input.phase,
        provider: "anthropic",
        model: input.model,
        retryIndex: input.retryIndex,
        durationMs: input.durationMs,
      });
      appendInferenceSpan(input.memoryRoot, input.featureId, span);
    }
    return { text: extractAnthropicText(raw), raw, usage, telemetry, span };
  }

  async completeOpenAi(input: OpenAiCompleteInput): Promise<LlmAdapterResult> {
    const body = buildOpenAiChatBody(input);
    const url = resolveLlmGatewayUrl("openai", process.env);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (input.memoryRoot && input.featureId) {
        const failureSpan = classifyHttpInferenceUsage({
          httpOk: false,
          runId: input.runId,
          taskId: input.taskId,
          agentId: input.agentId,
          phase: input.phase,
          provider: "openai",
          model: input.model,
          retryIndex: input.retryIndex,
          durationMs: input.durationMs,
          outcome: "error",
        });
        appendInferenceSpan(input.memoryRoot, input.featureId, failureSpan);
      }
      throw err;
    }
    if (!res.ok) {
      if (input.memoryRoot && input.featureId) {
        const failureSpan = classifyHttpInferenceUsage({
          httpOk: false,
          runId: input.runId,
          taskId: input.taskId,
          agentId: input.agentId,
          phase: input.phase,
          provider: "openai",
          model: input.model,
          retryIndex: input.retryIndex,
          durationMs: input.durationMs,
        });
        appendInferenceSpan(input.memoryRoot, input.featureId, failureSpan);
      }
      throw new Error(`openai_http_${res.status}`);
    }
    const raw = (await res.json()) as unknown;
    const usage = parseOpenAiCacheUsage(raw);
    const telemetry = buildVendorCacheTelemetry({
      vendor: "openai",
      usage,
      stablePrefixParts: input.stablePrefixParts,
      callIndex: input.callIndex,
      liveProbe: input.liveProbe,
    });
    let span: InferenceSpanRecord | undefined;
    if (input.memoryRoot && input.featureId) {
      persistVendorCacheTelemetry(input.memoryRoot, input.featureId, telemetry);
      span = classifyHttpInferenceUsage({
        httpOk: true,
        body: raw,
        runId: input.runId,
        taskId: input.taskId,
        agentId: input.agentId,
        phase: input.phase,
        provider: "openai",
        model: input.model,
        retryIndex: input.retryIndex,
        durationMs: input.durationMs,
      });
      appendInferenceSpan(input.memoryRoot, input.featureId, span);
    }
    return { text: extractOpenAiText(raw), raw, usage, telemetry, span };
  }
}
