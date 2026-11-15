/**
 * M12 MeasurementSinkPort implementation.
 * Wires V4 ingest to the existing V3 Measurement Plane collector without inventing facts.
 *
 * `emit` is the unauthenticated fire-and-forget port (frozen). It cannot persist OBSERVED.
 * `emitFromControlPlane` is the in-process CP path; OBSERVED is allowed only when explicit.
 */

import { TelemetryCollector, type CollectorOptions } from "../../telemetry/measurement-plane/collector.js";
import { MeasurementEventStore } from "../../telemetry/measurement-plane/event-store.js";
import { resolveMeasurementPaths } from "../../telemetry/measurement-plane/paths.js";
import type { CollectorStats, MeasurementEvent } from "../../telemetry/measurement-plane/types.js";
import type { MeasurementSinkPort } from "../contracts/ports.js";
import { evaluateCostAnomaly, evaluateStagnation } from "./anomalies.js";
import { wrapInboundEvent } from "./envelope.js";
import { computeUnknownProvenanceRate, incidentSignal } from "./signals.js";
import { reconstructObservedExecution } from "./traces.js";
import type { ControlPlaneObserver, ObservabilityTrace } from "./types.js";

export interface ObservabilitySinkOptions {
  runId: string;
  /** Existing MP store. If omitted, a store is created under `dataDir`. */
  store?: MeasurementEventStore;
  dataDir?: string;
  collector?: TelemetryCollector;
  collectorOptions?: Omit<CollectorOptions, "runId">;
}

export interface IngestResult {
  accepted: boolean;
  reason?: string;
  defaulted_fields: string[];
  observed_downgraded: boolean;
}

export class ObservabilitySink implements MeasurementSinkPort {
  readonly runId: string;
  readonly store: MeasurementEventStore;
  readonly collector: TelemetryCollector;
  private readonly accepted: MeasurementEvent[] = [];
  private rejected = 0;

  constructor(opts: ObservabilitySinkOptions) {
    this.runId = opts.runId;
    this.store = opts.store ?? new MeasurementEventStore(resolveMeasurementPaths(requireDataDir(opts.dataDir)));
    this.collector =
      opts.collector ??
      new TelemetryCollector(this.store, {
        runId: opts.runId,
        mode: opts.collectorOptions?.mode ?? "normal",
        maxQueue: opts.collectorOptions?.maxQueue,
        onCriticalLoss: opts.collectorOptions?.onCriticalLoss,
      });
  }

  /**
   * Frozen port. Unauthenticated channel: missing provenance → UNKNOWN/UNAVAILABLE;
   * producer-asserted OBSERVED is downgraded to UNKNOWN.
   */
  emit(measurementEvent: unknown): void {
    this.ingest(measurementEvent, "unauthenticated");
  }

  /**
   * Control-plane observers only. Missing provenance still defaults to UNKNOWN (R15).
   * Explicit OBSERVED is retained because identity is the in-process observer argument.
   */
  emitFromControlPlane(measurementEvent: unknown, observer: ControlPlaneObserver): void {
    this.ingest(measurementEvent, "control_plane", observer);
  }

  ingest(raw: unknown, channel: "unauthenticated" | "control_plane", observer?: ControlPlaneObserver): IngestResult {
    const wrapped = wrapInboundEvent(raw, channel, observer);
    if (!wrapped.ok || !wrapped.event) {
      this.rejected += 1;
      return {
        accepted: false,
        reason: wrapped.reason ?? "wrap_failed",
        defaulted_fields: wrapped.defaulted_fields,
        observed_downgraded: wrapped.observed_downgraded,
      };
    }
    const result = this.collector.ingest(wrapped.event);
    if (result.accepted) {
      this.accepted.push(wrapped.event);
    } else {
      this.rejected += 1;
    }
    return {
      accepted: result.accepted,
      reason: result.reason,
      defaulted_fields: wrapped.defaulted_fields,
      observed_downgraded: wrapped.observed_downgraded,
    };
  }

  flush(): void {
    this.collector.flush();
  }

  acceptedEvents(): readonly MeasurementEvent[] {
    return this.accepted;
  }

  rejectedCount(): number {
    return this.rejected;
  }

  collectorStats(): CollectorStats {
    return this.collector.getStats();
  }

  unknownRate() {
    return computeUnknownProvenanceRate(this.accepted);
  }

  stagnation() {
    return evaluateStagnation(this.accepted);
  }

  costAnomaly() {
    return evaluateCostAnomaly(this.accepted);
  }

  incident() {
    return incidentSignal();
  }

  traces(): ObservabilityTrace {
    return reconstructObservedExecution([...this.accepted]);
  }
}

function requireDataDir(dataDir: string | undefined): string {
  if (!dataDir) {
    throw new Error("ObservabilitySink requires store or dataDir to wire the Measurement Plane");
  }
  return dataDir;
}
