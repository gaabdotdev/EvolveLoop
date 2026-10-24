/**
 * EvolveLoop V2.5 - Observable LLM Provider Adapter
 * Directly connects G1 Inference Ledger and classification to LLM completions in V2.5.
 * Strictly decoupled from OmniRoute (runs with direct provider fallback).
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
  provider: "anthropic" | "openai" | string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  apiKey?: string;
  maxTokens?: number;
  featureId?: string;
  memoryRoot?: string;
  runId?: string;
  taskId?: string;
  agentId?: string;
  phase?: string;
  retryIndex?: number;
  gatewayUrl?: string;
}

export class ObservableLlmProviderAdapter {
  private readonly fetchImpl: FetchFn;

  constructor(fetchImpl: FetchFn = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async complete(input: ObservableCompletionInput): Promise<ObservableLlmAdapterResult> {
    const startTime = performance.now();
    const targetUrl =
      input.gatewayUrl ||
      (input.provider === "anthropic"
        ? "https://api.anthropic.com/v1/messages"
        : "https://api.openai.com/v1/chat/completions");

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (input.apiKey) {
      if (input.provider === "anthropic") {
        headers["x-api-key"] = input.apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        headers["authorization"] = `Bearer ${input.apiKey}`;
      }
    }

    let bodyPayload: Record<string, unknown>;
    if (input.provider === "anthropic") {
      bodyPayload = {
        model: input.model,
        max_tokens: input.maxTokens ?? 1024,
        messages: input.messages,
      };
    } else {
      bodyPayload = {
        model: input.model,
        max_tokens: input.maxTokens ?? 1024,
        messages: input.messages,
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
          provider: input.provider,
          model: input.model,
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
          provider: input.provider,
          model: input.model,
          retryIndex: input.retryIndex,
          durationMs,
          outcome: "error",
        });
        const ledgerResult = appendInferenceSpan(input.memoryRoot, input.featureId, failureSpan);
        ledgerWritten = ledgerResult.ok;
        ledgerPath = ledgerResult.path;
      }
      throw new Error(`${input.provider}_http_${res.status}`);
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
        provider: input.provider,
        model: input.model,
        retryIndex: input.retryIndex,
        durationMs,
        outcome: "success",
      });
      const ledgerResult = appendInferenceSpan(input.memoryRoot, input.featureId, span);
      ledgerWritten = ledgerResult.ok;
      ledgerPath = ledgerResult.path;
    }

    let text = "";
    if (input.provider === "anthropic") {
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
