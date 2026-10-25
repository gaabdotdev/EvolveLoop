/**
 * ObservableInferenceProvider — Canonical ExecutionEngine ProviderRuntime for inference capabilities.
 * Bridges ExecutionEngine DAG scheduling to ObservableLlmProviderAdapter and G1 Inference Ledger.
 * 
 * Capability: "llm.complete"
 */

import type {
  ExecuteRequest,
  ExecuteResult,
  ProviderRuntime,
} from "../types/index.js";
import { buildWorkerEvidence } from "../evidence/builders.js";
import {
  ObservableLlmProviderAdapter,
  type FetchFn,
  type ObservableCompletionInput,
} from "../observability/observable-llm-adapter.ts";

function extractInputs(request: ExecuteRequest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const inp of request.inputs ?? []) {
    if (typeof inp === "object" && inp !== null) {
      if (typeof inp.ref === "string") {
        const ref = inp.ref;
        const colon = ref.indexOf(":");
        if (colon > 0) {
          out[ref.slice(0, colon)] = ref.slice(colon + 1);
        } else {
          const eq = ref.indexOf("=");
          if (eq > 0) out[ref.slice(0, eq)] = ref.slice(eq + 1);
          else out.path = ref;
        }
      }
      for (const [k, v] of Object.entries(inp)) {
        if (k !== "ref" && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
          out[k] = String(v);
        }
      }
    }
  }
  const constraints = (request.node?.constraints ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(constraints)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      if (!(k in out)) out[k] = String(v);
    }
  }
  return out;
}

export interface ObservableInferenceProviderOptions {
  id?: string;
  adapter?: ObservableLlmProviderAdapter;
  fetchImpl?: FetchFn;
  defaultProvider?: "anthropic" | "openai" | string;
  defaultModel?: string;
  apiKey?: string;
  gatewayUrl?: string;
  memoryRoot?: string;
  allowLoopback?: boolean;
}

export class ObservableInferenceProvider implements ProviderRuntime {
  readonly id: string;
  private adapter: ObservableLlmProviderAdapter;
  private defaultProvider: string;
  private defaultModel: string;
  private apiKey?: string;
  private gatewayUrl?: string;
  private memoryRoot?: string;
  private cancelled = new Set<string>();

  constructor(options: ObservableInferenceProviderOptions = {}) {
    this.id = options.id ?? "observable-inference";
    this.adapter =
      options.adapter ??
      new ObservableLlmProviderAdapter(options.fetchImpl, {
        allowLoopback: options.allowLoopback ?? false,
      });
    this.defaultProvider = options.defaultProvider ?? "anthropic";
    this.defaultModel = options.defaultModel ?? "claude-3-5-sonnet";
    this.apiKey = options.apiKey;
    this.gatewayUrl = options.gatewayUrl;
    this.memoryRoot = options.memoryRoot;
  }

  supports(mode?: string): boolean {
    return !mode || mode === "default" || mode === "inference" || mode === "llm";
  }

  async cancel(runId: string): Promise<void> {
    this.cancelled.add(runId);
  }

  async execute(request: ExecuteRequest): Promise<ExecuteResult> {
    const start = Date.now();

    if (this.cancelled.has(request.run_id)) {
      return {
        run_id: request.run_id,
        success: false,
        error: { code: "CANCELLED", message: "Run cancelled" },
        duration_ms: Date.now() - start,
        provider_id: this.id,
      };
    }

    const inputs = extractInputs(request);
    const prompt = inputs.prompt ?? inputs.query ?? inputs.briefing ?? request.briefing;
    const provider = inputs.provider ?? this.defaultProvider;
    const model = inputs.model ?? this.defaultModel;
    const apiKey = inputs.apiKey ?? inputs.api_key ?? this.apiKey;
    const gatewayUrl = inputs.gatewayUrl ?? inputs.gateway_url ?? this.gatewayUrl;
    const memoryRoot = inputs.memoryRoot ?? inputs.memory_root ?? this.memoryRoot ?? process.cwd();
    const featureId = request.memory_scope || request.node_id;

    const completionInput: ObservableCompletionInput = {
      provider,
      model,
      prompt,
      system_prompt: inputs.system_prompt ?? inputs.system,
      apiKey,
      gatewayUrl,
      memoryRoot,
      featureId,
      runId: request.run_id,
      taskId: request.node_id,
      phase: request.node.type,
      retryIndex: request.node.retry_count,
    };

    try {
      const adapterResult = await this.adapter.complete(completionInput);
      const durationMs = Date.now() - start;

      const evidence = buildWorkerEvidence(
        request.node,
        request.run_id,
        this.id,
        durationMs,
      );

      if (evidence.spec.payload && typeof evidence.spec.payload === "object") {
        (evidence.spec.payload as Record<string, unknown>).inference = {
          provider,
          model,
          span: adapterResult.span,
          ledger_written: adapterResult.ledgerWritten,
          ledger_path: adapterResult.ledgerPath,
        };
      }
      (evidence.spec as { normalized?: unknown }).normalized = {
        text: adapterResult.text,
        span: adapterResult.span,
      };

      return {
        run_id: request.run_id,
        success: true,
        evidence,
        duration_ms: durationMs,
        provider_id: this.id,
        executor_id: "observable-inference",
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: string }).code)
          : "INFERENCE_ERROR";

      return {
        run_id: request.run_id,
        success: false,
        error: {
          code,
          message: err instanceof Error ? err.message : String(err),
        },
        duration_ms: durationMs,
        provider_id: this.id,
        executor_id: "observable-inference",
      };
    }
  }
}

export function createObservableInferenceProvider(
  options?: ObservableInferenceProviderOptions,
): ObservableInferenceProvider {
  return new ObservableInferenceProvider(options);
}
