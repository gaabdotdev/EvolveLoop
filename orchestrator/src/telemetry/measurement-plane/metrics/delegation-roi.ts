/**
 * Delegation ROI — decomposed components only.
 * Hierarchy depth / subagent count are contextual, never sole evidence of good delegation.
 */

import type { CaseRunResult } from "../benchmark/runner.js";
import type { StrategyId } from "../types.js";
import { summarizeLatency } from "./stats.js";

export interface DelegationRoiComponents {
  baseline_strategy: StrategyId;
  candidate_strategy: StrategyId;
  case_id?: string;
  sample_size_baseline: number;
  sample_size_candidate: number;
  reliability: "insufficient_sample" | "low" | "ok";
  quality: {
    verified_completion_rate_baseline: number | null;
    verified_completion_rate_candidate: number | null;
    delta: number | null;
  };
  latency: {
    mean_ms_baseline: number | null;
    mean_ms_candidate: number | null;
    delta_ms: number | null;
    /** Positive delta_ms means candidate slower */
  };
  cost: {
    cost_per_verified_baseline: number | null;
    cost_per_verified_candidate: number | null;
    delta: number | null;
    provenance: string;
  };
  tokens: {
    total_reported_baseline: number | null;
    total_reported_candidate: number | null;
    delta: number | null;
    provenance: string;
  };
  rework: {
    mean_rework_rate_baseline: number | null;
    mean_rework_rate_candidate: number | null;
    delta: number | null;
  };
  coordination: {
    mean_coordination_share_baseline: number | null;
    mean_coordination_share_candidate: number | null;
    delta: number | null;
  };
  hierarchy_context: {
    mean_depth_baseline: number | null;
    mean_depth_candidate: number | null;
    mean_subagents_baseline: number | null;
    mean_subagents_candidate: number | null;
    note: string;
  };
  interpretation_notes: string[];
}

function avg(nums: Array<number | null | undefined>): number | null {
  const v = nums.filter((n): n is number => n != null && Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function delta(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return b - a;
}

function vcr(rows: CaseRunResult[]): number | null {
  const valid = rows.filter((r) => r.validity === "valid");
  if (!valid.length) return null;
  return valid.filter((r) => r.true_full_pass).length / valid.length;
}

export function computeDelegationRoi(
  results: CaseRunResult[],
  baseline: StrategyId,
  candidate: StrategyId,
  caseId?: string,
): DelegationRoiComponents {
  const filter = (s: StrategyId) =>
    results.filter((r) => r.strategy === s && (!caseId || r.case_id === caseId) && r.validity === "valid");
  const base = filter(baseline);
  const cand = filter(candidate);
  const n = Math.min(base.length, cand.length);
  const reliability = n < 3 ? "insufficient_sample" : n < 5 ? "low" : "ok";

  const baseDur = base.map((r) => r.metrics.timing.end_to_end_duration_ms);
  const candDur = cand.map((r) => r.metrics.timing.end_to_end_duration_ms);
  const baseCost = avg(
    base.map((r) => {
      const c = r.metrics.usage.cost_usd_calculated.value ?? r.metrics.usage.cost_usd_reported.value;
      return c;
    }),
  );
  const candCost = avg(
    cand.map((r) => r.metrics.usage.cost_usd_calculated.value ?? r.metrics.usage.cost_usd_reported.value),
  );
  const baseTok = avg(base.map((r) => r.metrics.usage.total_reported.value));
  const candTok = avg(cand.map((r) => r.metrics.usage.total_reported.value));

  const notes: string[] = [
    "ROI is decomposed; no single opaque score.",
    "Hierarchy depth/subagent counts are context only — not proof of beneficial delegation.",
    "Tokens/costs remain UNAVAILABLE unless PROVIDER_REPORTED/HARNESS_REPORTED/DERIVED from priced usage.",
  ];
  if (reliability !== "ok") notes.push(`Sample reliability=${reliability} (n_min=${n}).`);

  return {
    baseline_strategy: baseline,
    candidate_strategy: candidate,
    case_id: caseId,
    sample_size_baseline: base.length,
    sample_size_candidate: cand.length,
    reliability,
    quality: {
      verified_completion_rate_baseline: vcr(base),
      verified_completion_rate_candidate: vcr(cand),
      delta: delta(vcr(base), vcr(cand)),
    },
    latency: {
      mean_ms_baseline: avg(baseDur),
      mean_ms_candidate: avg(candDur),
      delta_ms: delta(avg(baseDur), avg(candDur)),
    },
    cost: {
      cost_per_verified_baseline: baseCost,
      cost_per_verified_candidate: candCost,
      delta: delta(baseCost, candCost),
      provenance: baseCost == null && candCost == null ? "UNAVAILABLE" : "DERIVED_OR_REPORTED",
    },
    tokens: {
      total_reported_baseline: baseTok,
      total_reported_candidate: candTok,
      delta: delta(baseTok, candTok),
      provenance: baseTok == null && candTok == null ? "UNAVAILABLE" : "PROVIDER_REPORTED_OR_HARNESS",
    },
    rework: {
      mean_rework_rate_baseline: avg(base.map((r) => r.metrics.hierarchy.delegation_rework_rate)),
      mean_rework_rate_candidate: avg(cand.map((r) => r.metrics.hierarchy.delegation_rework_rate)),
      delta: delta(
        avg(base.map((r) => r.metrics.hierarchy.delegation_rework_rate)),
        avg(cand.map((r) => r.metrics.hierarchy.delegation_rework_rate)),
      ),
    },
    coordination: {
      mean_coordination_share_baseline: avg(base.map((r) => r.metrics.hierarchy.root_coordination_share)),
      mean_coordination_share_candidate: avg(cand.map((r) => r.metrics.hierarchy.root_coordination_share)),
      delta: delta(
        avg(base.map((r) => r.metrics.hierarchy.root_coordination_share)),
        avg(cand.map((r) => r.metrics.hierarchy.root_coordination_share)),
      ),
    },
    hierarchy_context: {
      mean_depth_baseline: avg(base.map((r) => r.metrics.hierarchy.delegation_depth)),
      mean_depth_candidate: avg(cand.map((r) => r.metrics.hierarchy.delegation_depth)),
      mean_subagents_baseline: avg(base.map((r) => r.metrics.hierarchy.subagent_count)),
      mean_subagents_candidate: avg(cand.map((r) => r.metrics.hierarchy.subagent_count)),
      note: "Contextual only — interpret with quality/latency/cost/rework components.",
    },
    interpretation_notes: notes,
  };
}

export function computeDelegationRoiMatrix(results: CaseRunResult[]): {
  by_case: DelegationRoiComponents[];
  aggregate: DelegationRoiComponents[];
  latency_distributions: Record<string, ReturnType<typeof summarizeLatency>>;
} {
  const cases = [...new Set(results.map((r) => r.case_id))];
  const pairs: Array<[StrategyId, StrategyId]> = [
    ["A_single_agent", "B_evolveloop_no_delegation"],
    ["A_single_agent", "C_evolveloop_adaptive"],
    ["B_evolveloop_no_delegation", "C_evolveloop_adaptive"],
  ];
  const by_case: DelegationRoiComponents[] = [];
  for (const caseId of cases) {
    for (const [b, c] of pairs) by_case.push(computeDelegationRoi(results, b, c, caseId));
  }
  const aggregate = pairs.map(([b, c]) => computeDelegationRoi(results, b, c));

  const latency_distributions: Record<string, ReturnType<typeof summarizeLatency>> = {};
  for (const s of ["A_single_agent", "B_evolveloop_no_delegation", "C_evolveloop_adaptive"] as StrategyId[]) {
    const samples = results
      .filter((r) => r.strategy === s && r.validity === "valid")
      .map((r) => r.metrics.timing.end_to_end_duration_ms)
      .filter((x): x is number => x != null);
    latency_distributions[s] = summarizeLatency(samples);
  }

  return { by_case, aggregate, latency_distributions };
}
