/**
 * V5-M03 — Usage records with measured | estimated | unavailable.
 * Never invent token/cost numbers.
 */

import type { CostProvenance } from "../model-providers/types.js";
import type { UsageProvenance, UsageRecord } from "./types.js";

export interface UsageInput {
  provider_id: string;
  model_id?: string;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_usd?: number | null;
  /**
   * Explicit provenance from the caller.
   * If omitted, inferred from presence of numbers — never invents values.
   */
  provenance?: UsageProvenance;
  /** Map from ModelProvider CostProvenance when bridging. */
  cost_provenance?: CostProvenance;
  notes?: string[];
}

/** Map legacy CostProvenance → UsageProvenance (M03 vocabulary). */
export function mapCostProvenance(p: CostProvenance): UsageProvenance {
  switch (p) {
    case "reported":
      return "measured";
    case "estimated":
      return "estimated";
    case "UNAVAILABLE":
    default:
      return "unavailable";
  }
}

/**
 * Build an honest usage record.
 * - Does not invent tokens/cost when absent.
 * - If provenance is unavailable, numeric fields are null/omitted.
 */
export function createUsageRecord(input: UsageInput): UsageRecord {
  const notes = [...(input.notes ?? [])];
  let provenance: UsageProvenance;

  if (input.provenance) {
    provenance = input.provenance;
  } else if (input.cost_provenance) {
    provenance = mapCostProvenance(input.cost_provenance);
    notes.push(`mapped_from_cost_provenance=${input.cost_provenance}`);
  } else {
    const hasTokens =
      (input.tokens_in != null && Number.isFinite(input.tokens_in)) ||
      (input.tokens_out != null && Number.isFinite(input.tokens_out));
    const hasCost = input.cost_usd != null && Number.isFinite(input.cost_usd);
    if (!hasTokens && !hasCost) {
      provenance = "unavailable";
      notes.push("no tokens/cost supplied — provenance=unavailable");
    } else {
      // Numbers present without provenance claim → estimated (not measured).
      provenance = "estimated";
      notes.push("numbers present without explicit provenance — treated as estimated");
    }
  }

  if (provenance === "unavailable") {
    return {
      kind: "UsageRecord",
      provider_id: input.provider_id,
      model_id: input.model_id,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      provenance: "unavailable",
      notes,
    };
  }

  return {
    kind: "UsageRecord",
    provider_id: input.provider_id,
    model_id: input.model_id,
    tokens_in: input.tokens_in ?? null,
    tokens_out: input.tokens_out ?? null,
    cost_usd: input.cost_usd ?? null,
    provenance,
    notes,
  };
}
