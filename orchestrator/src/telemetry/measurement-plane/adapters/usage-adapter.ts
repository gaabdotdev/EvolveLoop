import type { VendorCacheUsage } from "../../../providers/llm/vendor-cache-usage.js";
import { createMeasurementEvent, usageMeasurement } from "../envelope.js";
import type { MeasurementEvent, ProvenanceKind } from "../types.js";

export interface UsageAdapterInput {
  usage: VendorCacheUsage | null;
  run_id: string;
  request_id: string;
  provider_id?: string;
  model_id?: string;
  agent_id?: string;
  task_id?: string;
  /** When usage is missing */
  unavailable?: boolean;
  estimated?: { input?: number; output?: number; method: string };
}

/**
 * Convert provider-reported (or explicitly estimated) usage into measurement events.
 * Never invents tokens: null/missing → UNAVAILABLE or ESTIMATED only when caller provides estimate.
 */
export function buildUsageEvents(input: UsageAdapterInput): MeasurementEvent[] {
  const events: MeasurementEvent[] = [];
  const baseCorr = {
    run_id: input.run_id,
    provider_request_id: input.request_id,
    provider_id: input.provider_id,
    model_id: input.model_id,
    agent_id: input.agent_id,
    task_id: input.task_id,
  };

  if (input.unavailable || input.usage === null) {
    if (input.estimated) {
      events.push(
        createMeasurementEvent({
          event_name: "usage.estimated",
          source: { component: "measurement-plane", module: "usage-adapter" },
          correlation: baseCorr,
          provenance: {
            kind: "ESTIMATED",
            reported_by: "usage-adapter",
            estimate_method: input.estimated.method,
          },
          measurements: {
            input_tokens: usageMeasurement("input_tokens", input.estimated.input ?? null, "ESTIMATED", {
              estimate_method: input.estimated.method,
              request_id: input.request_id,
              provider_id: input.provider_id,
              model_id: input.model_id,
            }),
            output_tokens: usageMeasurement("output_tokens", input.estimated.output ?? null, "ESTIMATED", {
              estimate_method: input.estimated.method,
              request_id: input.request_id,
            }),
          },
          quality: { complete: false, estimated_fields: ["input_tokens", "output_tokens"], missing_fields: [] },
        }),
      );
    } else {
      events.push(
        createMeasurementEvent({
          event_name: "usage.reported",
          source: { component: "measurement-plane", module: "usage-adapter" },
          correlation: baseCorr,
          provenance: { kind: "UNAVAILABLE", reported_by: "usage-adapter" },
          measurements: {
            input_tokens: usageMeasurement("input_tokens", null, "UNAVAILABLE", { request_id: input.request_id }),
            output_tokens: usageMeasurement("output_tokens", null, "UNAVAILABLE", { request_id: input.request_id }),
          },
          quality: {
            complete: false,
            estimated_fields: [],
            missing_fields: ["input_tokens", "output_tokens"],
          },
        }),
      );
    }
    return events;
  }

  const u = input.usage;
  const kind: ProvenanceKind = "PROVIDER_REPORTED";
  events.push(
    createMeasurementEvent({
      event_name: "usage.reported",
      source: { component: "measurement-plane", module: "usage-adapter", instance_id: u.vendor },
      correlation: baseCorr,
      provenance: { kind, provider: u.vendor, reported_by: "vendor-cache-usage" },
      measurements: {
        input_tokens: usageMeasurement("input_tokens", u.input_tokens, kind, {
          provider_id: input.provider_id ?? u.vendor,
          model_id: input.model_id,
          request_id: input.request_id,
        }),
        output_tokens: usageMeasurement("output_tokens", u.output_tokens, kind, {
          request_id: input.request_id,
        }),
        cached_input_tokens: usageMeasurement(
          "cached_input_tokens",
          u.cache_read_input_tokens || u.openai_cached_prompt_tokens,
          kind,
          { request_id: input.request_id },
        ),
        cache_creation_tokens: usageMeasurement(
          "cache_creation_tokens",
          u.cache_creation_input_tokens,
          kind,
          { request_id: input.request_id },
        ),
      },
      attributes: {
        vendor: u.vendor,
        vendor_cache_hit: u.vendor_cache_hit,
        partial: u.input_tokens === null || u.output_tokens === null,
      },
      quality: {
        complete: u.input_tokens !== null && u.output_tokens !== null,
        estimated_fields: [],
        missing_fields: [
          ...(u.input_tokens === null ? ["input_tokens"] : []),
          ...(u.output_tokens === null ? ["output_tokens"] : []),
        ],
      },
    }),
  );

  if (u.cache_read_input_tokens > 0 || u.openai_cached_prompt_tokens > 0) {
    events.push(
      createMeasurementEvent({
        event_name: "cache.usage_reported",
        source: { component: "measurement-plane", module: "usage-adapter" },
        correlation: baseCorr,
        provenance: { kind, provider: u.vendor, reported_by: "vendor-cache-usage" },
        measurements: {
          cache_read: u.cache_read_input_tokens || u.openai_cached_prompt_tokens,
        },
      }),
    );
  }

  return events;
}

/** Dedup key: one final usage per provider request + metric family. */
export function usageDedupKey(requestId: string, family: "reported" | "estimated"): string {
  return `${requestId}::${family}`;
}
