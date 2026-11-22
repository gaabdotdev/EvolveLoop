/**
 * Observe-only bridge: Engineering Loop / continuity → Measurement Plane.
 * Never mutates orchestration decisions.
 */

import type { EngineeringLoopResult } from "../../../v3/engineering/types.js";
import { TelemetryCollector } from "../collector.js";
import { createMeasurementEvent } from "../envelope.js";
import { MeasurementEventStore } from "../event-store.js";
import type { MeasurementDataPaths } from "../paths.js";
import { buildAgentLifecycleEvent } from "../adapters/hierarchy-adapter.js";

export function recordEngineeringLoopObservation(
  paths: MeasurementDataPaths,
  result: EngineeringLoopResult,
): { run_id: string; events_accepted: number } {
  const run_id = result.run.run_id;
  const store = new MeasurementEventStore(paths);
  const collector = new TelemetryCollector(store, { mode: "normal", runId: run_id });
  let accepted = 0;
  const emit = (e: ReturnType<typeof createMeasurementEvent>) => {
    if (collector.ingest(e).accepted) accepted += 1;
  };

  emit(
    createMeasurementEvent({
      event_name: "run.started",
      source: { component: "engineering-loop", module: "bridge" },
      correlation: { run_id, goal_id: result.run.goal_contract_id },
      attributes: { work_id: result.run.work_id },
      critical: true,
    }),
  );

  for (const stage of result.run.stages) {
    emit(
      createMeasurementEvent({
        event_name: `engineering.stage.${stage.stage_id.toLowerCase()}`,
        source: { component: "engineering-loop", module: "bridge" },
        correlation: { run_id, agent_id: stage.actor_agent_id },
        attributes: { status: stage.status, notes: stage.notes },
        measurements: {},
      }),
    );
    if (stage.stage_id === "IMPLEMENT" && stage.actor_agent_id) {
      emit(
        buildAgentLifecycleEvent({
          run_id,
          agent_id: stage.actor_agent_id,
          role: "worker",
          kind: "completed",
        }),
      );
    }
    if (stage.stage_id === "REVIEW" && stage.actor_agent_id) {
      emit(
        createMeasurementEvent({
          event_name: "review.completed",
          source: { component: "engineering-loop", module: "bridge" },
          correlation: { run_id, agent_id: stage.actor_agent_id },
          attributes: { status: stage.status, independent: true },
          critical: true,
        }),
      );
    }
    if (stage.stage_id === "TEST") {
      emit(
        createMeasurementEvent({
          event_name: stage.status === "PASSED" ? "test.completed" : "test.failed",
          source: { component: "engineering-loop", module: "bridge" },
          correlation: { run_id },
          attributes: { notes: stage.notes },
          critical: true,
        }),
      );
    }
  }

  for (const f of result.workspace_changes ?? []) {
    emit(
      createMeasurementEvent({
        event_name: "filesystem.write",
        source: { component: "engineering-loop", module: "bridge" },
        correlation: { run_id },
        attributes: { path: f, op: "write" },
        privacy: { classification: "METADATA", content_included: false, redacted: true },
      }),
    );
  }

  emit(
    createMeasurementEvent({
      event_name: result.true_full_pass ? "true_full_pass.granted" : "true_full_pass.rejected",
      source: { component: "engineering-loop", module: "bridge" },
      correlation: { run_id, goal_id: result.run.goal_contract_id },
      attributes: { reasons: result.reasons, review_passed: result.review_passed },
      critical: true,
    }),
  );

  emit(
    createMeasurementEvent({
      event_name: result.true_full_pass ? "run.completed" : "run.failed",
      source: { component: "engineering-loop", module: "bridge" },
      correlation: { run_id },
      critical: true,
    }),
  );

  return { run_id, events_accepted: accepted };
}
