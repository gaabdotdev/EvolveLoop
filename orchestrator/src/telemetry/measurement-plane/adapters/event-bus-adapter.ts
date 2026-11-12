import type { EventBus } from "../../../events/event-bus.js";
import type { EventEnvelope } from "../../../types/index.js";
import type { TelemetryCollector } from "../collector.js";
import { createMeasurementEvent } from "../envelope.js";
import type { CorrelationIds } from "../types.js";

const TYPE_MAP: Record<string, string> = {
  FeatureStarted: "run.started",
  FeatureCompleted: "run.completed",
  FeatureBlocked: "run.failed",
  FeatureAborted: "run.cancelled",
  NodeScheduled: "task.assigned",
  NodeStarted: "task.started",
  NodeCompleted: "task.completed",
  NodeFailed: "task.failed",
  NodeSkipped: "task.cancelled",
  RetryScheduled: "task.retried",
  PlannerReplan: "plan.revised",
  GatePassed: "review.approved",
  GateRejected: "review.rejected",
  GateSkipped: "review.completed",
  ProviderSelected: "model.selected",
  ProviderFallbackUsed: "model.fallback_selected",
  ProviderDiscoveryStarted: "provider.requested",
  ProviderDiscoveryCompleted: "provider.response_received",
  ContextBudget: "context.snapshot",
  SkillLifecycle: "tool.completed",
  OrchestratorDecision: "plan.approved",
  SubgraphInvalidated: "task.replanned",
  PhaseGateReached: "criterion.evaluated",
  KnowledgeHit: "artifact.attached",
  KnowledgeProposed: "artifact.created",
  MemoryWritten: "artifact.updated",
};

export interface EventBusAdapterOptions {
  collector: TelemetryCollector;
  correlation?: CorrelationIds;
  runId: string;
}

/** Observe-only: maps engine EventBus envelopes into measurement events. */
export function attachEventBusAdapter(bus: EventBus, opts: EventBusAdapterOptions): () => void {
  return bus.onEvent((envelope) => {
    const mapped = mapEnvelope(envelope, opts);
    opts.collector.ingest(mapped);
  });
}

export function mapEnvelope(envelope: EventEnvelope, opts: EventBusAdapterOptions) {
  const event_name = TYPE_MAP[envelope.type] ?? `engine.${envelope.type}`;
  const payload = envelope.payload ?? {};
  const correlation: CorrelationIds = {
    run_id: opts.runId,
    feature_id: envelope.feature_id,
    engine_node_run_id: envelope.correlation_id,
    node_id: typeof payload.node_id === "string" ? payload.node_id : undefined,
    task_id: typeof payload.node_id === "string" ? payload.node_id : undefined,
    provider_id: typeof payload.provider_id === "string" ? payload.provider_id : undefined,
    ...opts.correlation,
  };

  const measurements: Record<string, number> = {};
  if (typeof payload.duration_ms === "number") {
    measurements.duration_ms = payload.duration_ms;
  }

  return createMeasurementEvent({
    event_name,
    event_id: `evt_bus_${envelope.event_id.replace(/-/g, "").slice(0, 20)}`,
    occurred_at: envelope.timestamp,
    source: {
      component: "orchestrator",
      module: "event-bus-adapter",
      instance_id: envelope.source,
    },
    correlation,
    provenance: { kind: "OBSERVED", reported_by: "event-bus-adapter" },
    attributes: {
      engine_event_type: envelope.type,
      engine_event_id: envelope.event_id,
      engine_source: envelope.source,
      // metadata only — payload keys, not free-form content dumps
      payload_keys: Object.keys(payload),
      success: payload.success,
      capability: payload.capability,
      error_code: payload.error_code,
    },
    measurements,
  });
}
