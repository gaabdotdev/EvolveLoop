/**
 * V0-TEST-D — Deterministic offline baseline comparator for token economy.
 *
 * Live ≥50–60% reduction vs baseline REQUIRES a harness with real LLM traffic.
 * This fixture only proves the comparator math and ledger shape offline.
 * Do NOT claim live savings without measured numbers from a consented harness run.
 */

export interface TokenBaselineSample {
  label: string;
  /** Total tokens attributed to the task (in+out+tools). */
  total_tokens: number;
  subsystem: string;
  zero_token_path: boolean;
}

export interface TokenBaselineCompareResult {
  baseline_total: number;
  phase_total: number;
  reduction_ratio: number;
  reduction_pct: number;
  meets_target: boolean;
  target_min_pct: number;
  /** Honest gap flag when live harness numbers are unavailable. */
  live_harness_required: boolean;
  notes: string[];
}

export const V0_TOKEN_BASELINE_FIXTURE: TokenBaselineSample[] = [
  { label: "baseline_status", total_tokens: 0, subsystem: "cli", zero_token_path: true },
  { label: "baseline_pause", total_tokens: 0, subsystem: "cli", zero_token_path: true },
  { label: "baseline_impl_prompt", total_tokens: 12_000, subsystem: "llm", zero_token_path: false },
  { label: "baseline_validate", total_tokens: 4_000, subsystem: "llm", zero_token_path: false },
];

export const V0_TOKEN_PHASE1_FIXTURE: TokenBaselineSample[] = [
  { label: "phase1_status", total_tokens: 0, subsystem: "cli", zero_token_path: true },
  { label: "phase1_pause", total_tokens: 0, subsystem: "cli", zero_token_path: true },
  // Deterministic offline stand-in: compressed prompt + local validation skip.
  { label: "phase1_impl_prompt", total_tokens: 4_800, subsystem: "llm", zero_token_path: false },
  { label: "phase1_validate", total_tokens: 0, subsystem: "local_validation", zero_token_path: true },
];

/** Default V0 target band from master plan (live claim needs harness). */
export const V0_TOKEN_REDUCTION_TARGET_MIN_PCT = 50;
export const V0_TOKEN_REDUCTION_TARGET_MAX_PCT = 60;

export function sumTokens(samples: TokenBaselineSample[]): number {
  return samples.reduce((acc, s) => acc + s.total_tokens, 0);
}

/**
 * Compare phase vs baseline totals.
 * `claim_live` must stay false unless caller supplies measured harness numbers.
 */
export function compareTokenBaseline(
  baseline: TokenBaselineSample[],
  phase: TokenBaselineSample[],
  opts?: { target_min_pct?: number; claim_live?: boolean },
): TokenBaselineCompareResult {
  const baseline_total = sumTokens(baseline);
  const phase_total = sumTokens(phase);
  const target_min_pct = opts?.target_min_pct ?? V0_TOKEN_REDUCTION_TARGET_MIN_PCT;
  const claim_live = opts?.claim_live === true;

  if (baseline_total <= 0) {
    return {
      baseline_total,
      phase_total,
      reduction_ratio: 0,
      reduction_pct: 0,
      meets_target: false,
      target_min_pct,
      live_harness_required: !claim_live,
      notes: ["baseline_total_non_positive — cannot compute reduction"],
    };
  }

  const reduction_ratio = (baseline_total - phase_total) / baseline_total;
  const reduction_pct = reduction_ratio * 100;
  const meets_target = reduction_pct >= target_min_pct;

  const notes: string[] = [
    `offline_fixture_reduction=${reduction_pct.toFixed(2)}%`,
    claim_live
      ? "claim_live=true — caller asserts measured harness numbers"
      : "LIVE_GAP: ≥50–60% vs baseline not claimed without harness measurements",
  ];

  return {
    baseline_total,
    phase_total,
    reduction_ratio,
    reduction_pct,
    meets_target,
    target_min_pct,
    live_harness_required: !claim_live,
    notes,
  };
}
