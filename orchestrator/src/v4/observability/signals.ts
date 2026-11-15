/**
 * TM-V4-D07 UNKNOWN-rate monitoring (counts accepted events; does not invent a rate from empty).
 * TM-V4-D20 incident freeze/revocation is not implemented in M12-init — honest UNAVAILABLE.
 */

import type { MeasurementEvent } from "../../telemetry/measurement-plane/types.js";
import type { IncidentSignal, UnknownRateReport } from "./types.js";

export function computeUnknownProvenanceRate(events: readonly MeasurementEvent[]): UnknownRateReport {
  const total = events.length;
  const unknown = events.filter((e) => e.provenance?.kind === "UNKNOWN").length;
  if (total === 0) {
    return {
      total: 0,
      unknown: 0,
      rate: null,
      rate_provenance: "UNAVAILABLE",
      count_provenance: "OBSERVED",
    };
  }
  return {
    total,
    unknown,
    rate: unknown / total,
    rate_provenance: "DERIVED",
    count_provenance: "OBSERVED",
  };
}

export function incidentSignal(): IncidentSignal {
  return {
    status: "UNAVAILABLE",
    provenance: "UNAVAILABLE",
    freeze: null,
    revocation: null,
    reason:
      "M12-init has no incident freeze/revocation path; TM-V4-D20 is shared with M10/M02 and is not invented here",
  };
}
