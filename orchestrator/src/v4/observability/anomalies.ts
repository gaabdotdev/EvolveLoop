/**
 * M12-init stagnation / cost-anomaly hooks.
 * Detection is not implemented; results are honest UNAVAILABLE (mission: do not invent facts).
 */

import type { MeasurementEvent } from "../../telemetry/measurement-plane/types.js";
import type { AnomalyAssessment } from "./types.js";

const STAGNATION_REASON =
  "M12-init does not implement stagnation detection; no loop/stagnation fact invented";
const COST_REASON =
  "M12-init does not implement cost-anomaly detection; no baseline or threshold invented";

export function evaluateStagnation(_events: readonly MeasurementEvent[]): AnomalyAssessment {
  return {
    signal: "stagnation",
    status: "UNAVAILABLE",
    provenance: "UNAVAILABLE",
    value: null,
    reason: STAGNATION_REASON,
  };
}

export function evaluateCostAnomaly(_events: readonly MeasurementEvent[]): AnomalyAssessment {
  return {
    signal: "cost_anomaly",
    status: "UNAVAILABLE",
    provenance: "UNAVAILABLE",
    value: null,
    reason: COST_REASON,
  };
}
