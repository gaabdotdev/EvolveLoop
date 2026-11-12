import { readFileSync, existsSync } from "node:fs";
import { createMeasurementEvent, usageMeasurement } from "../envelope.js";
import type { MeasurementEvent, MeasurementValue, UsageAggregate } from "../types.js";

export interface PriceEntry {
  provider_id: string;
  model_id: string;
  currency: "USD";
  input_per_mtok: number;
  output_per_mtok: number;
  cached_input_per_mtok?: number;
  source: string;
  valid_from: string;
  valid_to?: string;
}

export interface PriceTable {
  version: string;
  currency: "USD";
  source: string;
  entries: PriceEntry[];
}

export function loadPriceTable(path: string): PriceTable | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as PriceTable;
}

export function lookupPrice(
  table: PriceTable,
  providerId: string,
  modelId: string,
): PriceEntry | null {
  return (
    table.entries.find((e) => e.provider_id === providerId && e.model_id === modelId) ??
    table.entries.find((e) => e.provider_id === providerId && e.model_id === "*") ??
    null
  );
}

/**
 * Calculate local cost from PROVIDER_REPORTED usage + versioned price table.
 * Does not invent prices; returns UNAVAILABLE when table/entry missing.
 */
export function calculateCost(
  usage: UsageAggregate,
  table: PriceTable | null,
  providerId?: string,
  modelId?: string,
): { calculated: MeasurementValue; event: MeasurementEvent | null } {
  if (!table || !providerId || !modelId) {
    return {
      calculated: {
        metric: "cost_usd_calculated",
        value: null,
        unit: "USD",
        provenance: "UNAVAILABLE",
      },
      event: null,
    };
  }
  const entry = lookupPrice(table, providerId, modelId);
  if (!entry) {
    return {
      calculated: {
        metric: "cost_usd_calculated",
        value: null,
        unit: "USD",
        provenance: "UNAVAILABLE",
        price_table_version: table.version,
      },
      event: null,
    };
  }

  const input = usage.input_tokens.value ?? 0;
  const output = usage.output_tokens.value ?? 0;
  if (usage.input_tokens.provenance !== "PROVIDER_REPORTED" && usage.input_tokens.value == null) {
    return {
      calculated: {
        metric: "cost_usd_calculated",
        value: null,
        unit: "USD",
        provenance: "UNAVAILABLE",
        price_table_version: table.version,
      },
      event: null,
    };
  }

  const cached = usage.cached_input_tokens.value ?? 0;
  const cachedRate = entry.cached_input_per_mtok ?? entry.input_per_mtok;
  const billableInput = Math.max(0, input - cached);
  const usd =
    (billableInput / 1_000_000) * entry.input_per_mtok +
    (cached / 1_000_000) * cachedRate +
    (output / 1_000_000) * entry.output_per_mtok;

  const calculated: MeasurementValue = {
    metric: "cost_usd_calculated",
    value: usd,
    unit: "USD",
    provenance: "DERIVED",
    provider_id: providerId,
    model_id: modelId,
    price_table_version: table.version,
  };

  const event = createMeasurementEvent({
    event_name: "cost.calculated",
    source: { component: "measurement-plane", module: "cost" },
    correlation: { provider_id: providerId, model_id: modelId },
    provenance: {
      kind: "DERIVED",
      reported_by: "cost-calculator",
      price_table_version: table.version,
      provider: providerId,
    },
    measurements: {
      cost_usd_calculated: calculated,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
    },
    attributes: {
      price_source: entry.source,
      currency: entry.currency,
      input_per_mtok: entry.input_per_mtok,
      output_per_mtok: entry.output_per_mtok,
    },
  });

  return { calculated, event };
}

export function costPerVerifiedCompletion(
  runs: Array<{ verified: boolean; cost_usd: number | null }>,
): MeasurementValue {
  const verified = runs.filter((r) => r.verified && r.cost_usd != null);
  if (!verified.length) {
    return {
      metric: "cost_per_verified_completion",
      value: null,
      unit: "USD",
      provenance: "UNAVAILABLE",
    };
  }
  const total = verified.reduce((a, r) => a + (r.cost_usd ?? 0), 0);
  return {
    metric: "cost_per_verified_completion",
    value: total / verified.length,
    unit: "USD",
    provenance: "DERIVED",
  };
}

export function wastedCost(runs: Array<{ verified: boolean; cost_usd: number | null }>): MeasurementValue {
  const failed = runs.filter((r) => !r.verified && r.cost_usd != null);
  const total = failed.reduce((a, r) => a + (r.cost_usd ?? 0), 0);
  return {
    metric: "wasted_cost_usd",
    value: failed.length ? total : 0,
    unit: "USD",
    provenance: failed.length ? "DERIVED" : "OBSERVED",
  };
}

/** Helper re-export for tests */
export { usageMeasurement };
