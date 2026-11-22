/**
 * V1-GATE-TOK — comparator math for token-economy ceiling gate.
 *
 * Honesty (PG-004): all numbers are ESTIMATED (chars/4 proxy) unless provenance
 * says otherwise. Never invent PROVIDER_REPORTED / live LLM billing savings.
 */

export const V1_GATE_TOK_TARGET_MIN_PCT = 75;
export const V1_GATE_TOK_TARGET_MAX_PCT = 85;
export const V1_GATE_TOK_O1_MIN_ITERATIONS = 5;

export type HonestyKind = "estimated" | "reported" | "UNAVAILABLE";

export interface TokenCompareSlice {
  baseline_total: number;
  phase_total: number;
  reduction_pct: number;
  meets_target: boolean;
  target_min_pct: number;
  honesty: HonestyKind;
  notes?: string[];
}

export interface V1GateTokVerdictInput {
  combined_reduction_pct: number;
  crystallizer_zero_token_proven: boolean;
  o1_snapshot_proven: boolean;
  o1_iterations: number;
  target_min_pct?: number;
}

export interface V1GateTokVerdict {
  kind: "V1GateTokVerdict";
  pass: boolean;
  label: string;
  reasons: string[];
  target_min_pct: number;
  measured_reduction_pct: number;
}

export function compareTokenTotals(
  baselineTotal: number,
  phaseTotal: number,
  opts?: { target_min_pct?: number; honesty?: HonestyKind; notes?: string[] },
): TokenCompareSlice {
  const target_min_pct = opts?.target_min_pct ?? V1_GATE_TOK_TARGET_MIN_PCT;
  const honesty = opts?.honesty ?? "estimated";
  if (baselineTotal <= 0) {
    return {
      baseline_total: baselineTotal,
      phase_total: phaseTotal,
      reduction_pct: 0,
      meets_target: false,
      target_min_pct,
      honesty,
      notes: ["baseline_total_non_positive", ...(opts?.notes ?? [])],
    };
  }
  const reduction_pct = ((baselineTotal - phaseTotal) / baselineTotal) * 100;
  return {
    baseline_total: baselineTotal,
    phase_total: phaseTotal,
    reduction_pct,
    meets_target: reduction_pct >= target_min_pct,
    target_min_pct,
    honesty,
    notes: opts?.notes,
  };
}

/**
 * PASS only if:
 * - combined reduction_pct >= 75
 * - crystallizer 0-token path proven
 * - O(1) snapshot size proven across ≥5 iterations
 */
export function evaluateV1GateTok(input: V1GateTokVerdictInput): V1GateTokVerdict {
  const target_min_pct = input.target_min_pct ?? V1_GATE_TOK_TARGET_MIN_PCT;
  const reasons: string[] = [];

  const reductionOk = input.combined_reduction_pct >= target_min_pct;
  if (!reductionOk) {
    reasons.push(
      `FAIL_REDUCTION: measured ${input.combined_reduction_pct.toFixed(2)}% < ${target_min_pct}%`,
    );
  } else {
    reasons.push(
      `OK_REDUCTION: measured ${input.combined_reduction_pct.toFixed(2)}% >= ${target_min_pct}%`,
    );
  }

  if (!input.crystallizer_zero_token_proven) {
    reasons.push("FAIL_CRYSTALLIZER: 0-token path not proven");
  } else {
    reasons.push("OK_CRYSTALLIZER: 0-token path proven");
  }

  const o1Ok =
    input.o1_snapshot_proven && input.o1_iterations >= V1_GATE_TOK_O1_MIN_ITERATIONS;
  if (!o1Ok) {
    reasons.push(
      `FAIL_O1_SNAPSHOT: proven=${input.o1_snapshot_proven} iterations=${input.o1_iterations} (need ≥${V1_GATE_TOK_O1_MIN_ITERATIONS})`,
    );
  } else {
    reasons.push(
      `OK_O1_SNAPSHOT: stable across ${input.o1_iterations} iterations`,
    );
  }

  const pass = reductionOk && input.crystallizer_zero_token_proven && o1Ok;
  const pct = input.combined_reduction_pct.toFixed(2);
  return {
    kind: "V1GateTokVerdict",
    pass,
    label: pass
      ? `V1-GATE-TOK_PASS_${pct}pct`
      : `V1-GATE-TOK_FAIL_${pct}pct`,
    reasons,
    target_min_pct,
    measured_reduction_pct: input.combined_reduction_pct,
  };
}
