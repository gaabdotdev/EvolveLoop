/**
 * Real-provider usage ingestion for Measurement Plane.
 * Parses vendor bodies / VendorCacheUsage / budget records.
 * Never invents tokens — missing fields → UNAVAILABLE / explicit ESTIMATED only.
 */

import {
  parseAnthropicCacheUsage,
  parseOpenAiCacheUsage,
  type LlmVendorId,
  type VendorCacheUsage,
} from "../../../providers/llm/vendor-cache-usage.js";
import type { TelemetryCollector } from "../collector.js";
import { buildUsageEvents, type UsageAdapterInput } from "./usage-adapter.js";
import { createMeasurementEvent, usageMeasurement } from "../envelope.js";
import type { MeasurementEvent, ProvenanceKind } from "../types.js";

export type ProviderUsageSource =
  | { kind: "vendor_cache_usage"; usage: VendorCacheUsage }
  | { kind: "anthropic_response_body"; body: unknown }
  | { kind: "openai_response_body"; body: unknown }
  | { kind: "unavailable" }
  | {
      kind: "estimated";
      input?: number;
      output?: number;
      method: string;
    }
  | {
      kind: "budget_record";
      tokens?: number | null;
      cost_usd?: number | null;
      duration_ms?: number | null;
      reported_by: string;
    };

export interface IngestProviderUsageOpts {
  run_id: string;
  request_id: string;
  provider_id?: string;
  model_id?: string;
  agent_id?: string;
  task_id?: string;
  source: ProviderUsageSource;
  collector?: TelemetryCollector;
}

export function parseProviderBody(
  vendor: LlmVendorId,
  body: unknown,
): VendorCacheUsage {
  return vendor === "anthropic" ? parseAnthropicCacheUsage(body) : parseOpenAiCacheUsage(body);
}

export function toUsageAdapterInput(opts: IngestProviderUsageOpts): UsageAdapterInput {
  const base = {
    run_id: opts.run_id,
    request_id: opts.request_id,
    provider_id: opts.provider_id,
    model_id: opts.model_id,
    agent_id: opts.agent_id,
    task_id: opts.task_id,
  };
  const s = opts.source;
  switch (s.kind) {
    case "vendor_cache_usage":
      return { ...base, usage: s.usage };
    case "anthropic_response_body":
      return { ...base, usage: parseAnthropicCacheUsage(s.body), provider_id: opts.provider_id ?? "anthropic" };
    case "openai_response_body":
      return { ...base, usage: parseOpenAiCacheUsage(s.body), provider_id: opts.provider_id ?? "openai" };
    case "unavailable":
      return { ...base, usage: null, unavailable: true };
    case "estimated":
      return {
        ...base,
        usage: null,
        estimated: { input: s.input, output: s.output, method: s.method },
      };
    case "budget_record":
      // Budget path handled separately (HARNESS_REPORTED / explicit record)
      return { ...base, usage: null, unavailable: true };
  }
}

export function buildBudgetUsageEvents(opts: IngestProviderUsageOpts & {
  source: Extract<ProviderUsageSource, { kind: "budget_record" }>;
}): MeasurementEvent[] {
  const s = opts.source;
  const hasTokens = s.tokens != null && Number.isFinite(s.tokens);
  const hasCost = s.cost_usd != null && Number.isFinite(s.cost_usd);
  const kind: ProvenanceKind = "HARNESS_REPORTED";

  if (!hasTokens && !hasCost) {
    return buildUsageEvents({
      run_id: opts.run_id,
      request_id: opts.request_id,
      provider_id: opts.provider_id,
      model_id: opts.model_id,
      agent_id: opts.agent_id,
      task_id: opts.task_id,
      usage: null,
      unavailable: true,
    });
  }

  return [
    createMeasurementEvent({
      event_name: "usage.reported",
      source: { component: "measurement-plane", module: "provider-usage", instance_id: "budget_record" },
      correlation: {
        run_id: opts.run_id,
        provider_request_id: opts.request_id,
        provider_id: opts.provider_id,
        model_id: opts.model_id,
        agent_id: opts.agent_id,
        task_id: opts.task_id,
      },
      provenance: { kind, reported_by: s.reported_by, provider: opts.provider_id ?? null },
      measurements: {
        ...(hasTokens
          ? {
              total_reported: usageMeasurement("total_reported", s.tokens as number, kind, {
                request_id: opts.request_id,
                provider_id: opts.provider_id,
                model_id: opts.model_id,
              }),
            }
          : {
              input_tokens: usageMeasurement("input_tokens", null, "UNAVAILABLE", {
                request_id: opts.request_id,
              }),
              output_tokens: usageMeasurement("output_tokens", null, "UNAVAILABLE", {
                request_id: opts.request_id,
              }),
            }),
        ...(hasCost
          ? {
              cost_usd_reported: {
                metric: "cost_usd_reported",
                value: s.cost_usd as number,
                unit: "USD",
                provenance: kind,
                request_id: opts.request_id,
                final: true,
                collected_at: new Date().toISOString(),
              },
            }
          : {}),
        ...(s.duration_ms != null
          ? { duration_ms: s.duration_ms }
          : {}),
      },
      attributes: {
        source: "budget_record",
        tokens_field_present: hasTokens,
        cost_field_present: hasCost,
        note: "Budget records may only expose totals; component tokens stay UNAVAILABLE when not provided",
      },
      quality: {
        complete: false,
        estimated_fields: [],
        missing_fields: [
          // Totals do not imply component token availability
          "input_tokens",
          "output_tokens",
          ...(!hasCost ? ["cost_usd_reported"] : []),
        ],
      },
    }),
  ];
}

/** Build measurement events from a real provider/harness source and optionally ingest. */
export function ingestProviderUsage(opts: IngestProviderUsageOpts): MeasurementEvent[] {
  const events =
    opts.source.kind === "budget_record"
      ? buildBudgetUsageEvents(opts as IngestProviderUsageOpts & { source: Extract<ProviderUsageSource, { kind: "budget_record" }> })
      : buildUsageEvents(toUsageAdapterInput(opts));

  if (opts.collector) {
    for (const e of events) opts.collector.ingest(e);
  }
  return events;
}

/**
 * Attach observe-only hook around LlmHttpProviderAdapter results.
 * Caller supplies the already-parsed VendorCacheUsage from the adapter — we do not call the network.
 */
export function recordLlmAdapterUsage(input: {
  collector: TelemetryCollector;
  run_id: string;
  request_id: string;
  provider_id: string;
  model_id?: string;
  agent_id?: string;
  usage: VendorCacheUsage | null;
}): MeasurementEvent[] {
  if (input.usage == null) {
    return ingestProviderUsage({
      collector: input.collector,
      run_id: input.run_id,
      request_id: input.request_id,
      provider_id: input.provider_id,
      model_id: input.model_id,
      agent_id: input.agent_id,
      source: { kind: "unavailable" },
    });
  }
  return ingestProviderUsage({
    collector: input.collector,
    run_id: input.run_id,
    request_id: input.request_id,
    provider_id: input.provider_id,
    model_id: input.model_id,
    agent_id: input.agent_id,
    source: { kind: "vendor_cache_usage", usage: input.usage },
  });
}
