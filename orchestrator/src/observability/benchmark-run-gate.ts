/**
 * Benchmark Run Gate (G2 - Phase B)
 * Evaluates whether benchmark runs are permitted according to formal contract invariants.
 * No IO, no network, and no external dependencies (e.g. tiktoken) allowed.
 */

export const BENCHMARK_BLOCKERS = {
  TREATMENT_NOT_DESIGNATED: "treatment_id_not_designated",
  PRICE_TABLE_ABSENT: "price_table_absent",
  TIKTOKEN_ABSENT: "tiktoken_absent",
  PRODUCTION_CALL_SITE_UNPROVEN: "production_call_site_unproven",
  PRODUCTION_CONSUMPTION_NOT_MEASURED: "production_consumption_not_measured",
} as const;

export type BenchmarkBlocker =
  (typeof BENCHMARK_BLOCKERS)[keyof typeof BENCHMARK_BLOCKERS];

export interface EvaluateBenchmarkRunInput {
  treatmentId: string;
  priceTablePresent: boolean;
  tiktokenPresent: boolean;
  productionCallSiteProven: boolean;
  productionConsumption: string;
}

export interface BenchmarkRunGateResult {
  allowed: boolean;
  blockers: BenchmarkBlocker[];
}

/**
 * Pure evaluation function for the benchmark run gate.
 * Rejects with { allowed: false, blockers: [...] } if any of the 5 blockers are present.
 * Only returns { allowed: true, blockers: [] } when all 5 blockers are resolved in input.
 */
export function evaluateBenchmarkRun(
  input: EvaluateBenchmarkRunInput,
): BenchmarkRunGateResult {
  const blockers: BenchmarkBlocker[] = [];

  if (
    !input.treatmentId ||
    input.treatmentId.trim() === "" ||
    input.treatmentId === "NOT_DESIGNATED"
  ) {
    blockers.push(BENCHMARK_BLOCKERS.TREATMENT_NOT_DESIGNATED);
  }

  if (!input.priceTablePresent) {
    blockers.push(BENCHMARK_BLOCKERS.PRICE_TABLE_ABSENT);
  }

  if (!input.tiktokenPresent) {
    blockers.push(BENCHMARK_BLOCKERS.TIKTOKEN_ABSENT);
  }

  if (!input.productionCallSiteProven) {
    blockers.push(BENCHMARK_BLOCKERS.PRODUCTION_CALL_SITE_UNPROVEN);
  }

  if (
    !input.productionConsumption ||
    input.productionConsumption.trim() === "" ||
    input.productionConsumption === "NOT_MEASURED"
  ) {
    blockers.push(BENCHMARK_BLOCKERS.PRODUCTION_CONSUMPTION_NOT_MEASURED);
  }

  return {
    allowed: blockers.length === 0,
    blockers,
  };
}
