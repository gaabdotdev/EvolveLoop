/**
 * M09 measurable-improvement evaluator.
 * Numeric floors are UNAVAILABLE. Canonical declared-UNAVAILABLE artifacts yield UNAVAILABLE.
 * Does not rank executors.
 */

import { BaselineValidationError } from "./errors.js";
import { validateBaselineArtifact } from "./schema.js";
import {
  IMPROVEMENT_BAR_ID,
  IMPROVEMENT_BAR_VERSION,
  NUMERIC_FLOORS,
  PRIMARY_AXES,
  type BaselineMetricName,
  type FairBaselineArtifact,
  type ImprovementClaim,
  type ImprovementVerdict,
  type RecordedMetricSlot,
} from "./types.js";

function recordedProof(artifact: FairBaselineArtifact, metric: BaselineMetricName): RecordedMetricSlot | undefined {
  const slot = artifact.metrics.find((m) => m.metric === metric);
  if (!slot || !slot.quality_proof || slot.status !== "RECORDED") return undefined;
  return slot;
}

function caseSet(artifact: FairBaselineArtifact): string {
  return [...artifact.workload.cases.map((c) => c.case_id)].sort().join("\0");
}

function comparablePair(baseline: FairBaselineArtifact, candidate: FairBaselineArtifact): string[] {
  const reasons: string[] = [];
  if (baseline.suite_id !== candidate.suite_id || baseline.suite_version !== candidate.suite_version) {
    reasons.push("suite identity differs");
  }
  if (caseSet(baseline) !== caseSet(candidate)) reasons.push("case set differs");
  if (baseline.workload.work_category !== candidate.workload.work_category) reasons.push("work_category differs");
  if (baseline.workload.task_kind !== candidate.workload.task_kind) reasons.push("task_kind differs");
  if (baseline.environment.class !== candidate.environment.class) reasons.push("environment.class differs");
  return reasons;
}

function directionOf(metric: BaselineMetricName): "higher_better" | "lower_better" | undefined {
  const axis = PRIMARY_AXES.find((a) => a.metric === metric);
  return axis?.direction;
}

function delta(metric: BaselineMetricName, baselineValue: number, candidateValue: number): "better" | "worse" | "equal" {
  const direction = directionOf(metric) ?? "higher_better";
  if (candidateValue === baselineValue) return "equal";
  if (direction === "lower_better") return candidateValue < baselineValue ? "better" : "worse";
  return candidateValue > baselineValue ? "better" : "worse";
}

function invalid(reasons: string[]): ImprovementVerdict {
  return {
    kind: "INVALID",
    bar_id: IMPROVEMENT_BAR_ID,
    bar_version: IMPROVEMENT_BAR_VERSION,
    numeric_floors: NUMERIC_FLOORS,
    reasons,
    axis_results: [],
  };
}

/**
 * Evaluate an M09-style improvement claim. Fixtures may use HARNESS_REPORTED numbers;
 * the canonical declared-UNAVAILABLE artifact yields UNAVAILABLE.
 */
export function evaluateImprovementClaim(
  baselineRaw: unknown,
  candidateRaw: unknown,
  claim: ImprovementClaim = { claim_kind: "measurable_improvement" },
): ImprovementVerdict {
  let baseline: FairBaselineArtifact;
  let candidate: FairBaselineArtifact;
  try {
    baseline = validateBaselineArtifact(baselineRaw);
    candidate = validateBaselineArtifact(candidateRaw);
  } catch (err) {
    const e = err as BaselineValidationError;
    return invalid([e.message]);
  }

  const cited = claim.cited_metrics ?? PRIMARY_AXES.map((a) => a.metric);
  const incomparable = comparablePair(baseline, candidate);
  if (incomparable.length > 0) {
    return {
      kind: "INCOMPARABLE",
      bar_id: IMPROVEMENT_BAR_ID,
      bar_version: IMPROVEMENT_BAR_VERSION,
      numeric_floors: NUMERIC_FLOORS,
      reasons: incomparable,
      axis_results: cited.map((metric) => ({ metric, comparable: false, delta_direction: "unavailable" })),
    };
  }

  const axis_results: ImprovementVerdict["axis_results"] = [];
  let better = 0;
  let worse = 0;
  let equal = 0;
  let missing = 0;

  for (const metric of cited) {
    const b = recordedProof(baseline, metric);
    const c = recordedProof(candidate, metric);
    if (!b || !c) {
      missing += 1;
      axis_results.push({ metric, comparable: false, delta_direction: "unavailable" });
      continue;
    }
    const d = delta(metric, b.value, c.value);
    if (d === "better") better += 1;
    else if (d === "worse") worse += 1;
    else equal += 1;
    axis_results.push({ metric, comparable: true, delta_direction: d });
  }

  const floors = NUMERIC_FLOORS;
  const common = {
    bar_id: IMPROVEMENT_BAR_ID,
    bar_version: IMPROVEMENT_BAR_VERSION,
    numeric_floors: floors,
    axis_results,
  } as const;

  if (missing > 0) {
    return {
      ...common,
      kind: "UNAVAILABLE",
      reasons: ["one or more cited primary axes lack quality-proof OBSERVED/HARNESS_REPORTED values"],
    };
  }

  if (claim.claim_kind === "tradeoff_disclosure") {
    return {
      ...common,
      kind: better > 0 && worse > 0 ? "TRADEOFF_NOT_IMPROVEMENT" : better > 0 && worse === 0 ? "IMPROVED" : worse > 0 ? "DEGRADED" : "NO_MATERIAL_CHANGE",
      reasons: ["claim_kind is tradeoff_disclosure; mixed axes are not sold as improvement"],
    };
  }

  if (better > 0 && worse === 0) {
    return { ...common, kind: "IMPROVED", reasons: ["strict Pareto on quality-proof primary axes; numeric floors remain UNAVAILABLE"] };
  }
  if (worse > 0 && better === 0) {
    return { ...common, kind: "DEGRADED", reasons: ["at least one primary axis worse and none better"] };
  }
  if (better > 0 && worse > 0) {
    return { ...common, kind: "TRADEOFF_NOT_IMPROVEMENT", reasons: ["mixed primary axes must not be claimed as improvement"] };
  }
  return { ...common, kind: "NO_MATERIAL_CHANGE", reasons: ["primary axes equal on quality-proof values"] };
}
