/**
 * Trace reconstruction wrap. Uses the V3 Measurement Plane builder unchanged.
 * Reconstruction is DERIVED from accepted events. Gaps are UNAVAILABLE — no spans invented.
 */

import {
  buildAgentTree,
  buildTimeline,
  buildTraceForest,
  reconstructExecution,
} from "../../telemetry/measurement-plane/trace/builder.js";
import type { MeasurementEvent } from "../../telemetry/measurement-plane/types.js";
import type { ObservabilityTrace } from "./types.js";

export function reconstructObservedExecution(events: MeasurementEvent[]): ObservabilityTrace {
  const recon = reconstructExecution(events);
  return {
    events_used: events.length,
    reconstruction_provenance: "DERIVED",
    gap_provenance: "UNAVAILABLE",
    timeline: recon.timeline,
    agent_tree: recon.agent_tree,
    forest: recon.trace,
    gaps: recon.gaps,
  };
}

export { buildAgentTree, buildTimeline, buildTraceForest };
