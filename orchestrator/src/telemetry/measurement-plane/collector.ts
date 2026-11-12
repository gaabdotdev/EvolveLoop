import type { MeasurementEventStore } from "./event-store.js";
import { createMeasurementEvent, validateMeasurementEvent } from "./envelope.js";
import type {
  CollectorMode,
  CollectorStats,
  MeasurementEvent,
} from "./types.js";

export interface CollectorOptions {
  mode?: CollectorMode;
  maxQueue?: number;
  runId: string;
  /** In benchmark mode, critical events must persist or run is incomplete. */
  onCriticalLoss?: (event: MeasurementEvent, reason: string) => void;
}

export class TelemetryCollector {
  private queue: MeasurementEvent[] = [];
  private seenIds = new Set<string>();
  private sequenceByProducer = new Map<string, number>();
  private lastOccurredAt: string | null = null;
  private stats: CollectorStats;
  private incomplete = false;
  private incompleteReasons: string[] = [];

  constructor(
    private store: MeasurementEventStore,
    private opts: CollectorOptions,
  ) {
    this.stats = {
      mode: opts.mode ?? "normal",
      emitted: 0,
      accepted: 0,
      rejected_invalid: 0,
      dropped: 0,
      delayed: 0,
      duplicates: 0,
      critical_lost: 0,
      queue_high_water: 0,
      write_failures: 0,
    };
  }

  getStats(): CollectorStats {
    return { ...this.stats };
  }

  isRunComplete(): { complete: boolean; reasons: string[] } {
    if (this.stats.mode !== "benchmark") return { complete: true, reasons: [] };
    return { complete: !this.incomplete, reasons: [...this.incompleteReasons] };
  }

  /** Accept a fully formed measurement event. */
  ingest(raw: MeasurementEvent): { accepted: boolean; reason?: string } {
    this.stats.emitted += 1;
    const received_at = new Date().toISOString();
    const event: MeasurementEvent = { ...raw, received_at };

    const validation = validateMeasurementEvent(event);
    if (!validation.ok) {
      this.stats.rejected_invalid += 1;
      this.recordDrop(event, "schema_invalid", validation.errors.join("; "));
      return { accepted: false, reason: validation.errors.join("; ") };
    }

    if (this.seenIds.has(event.event_id)) {
      this.stats.duplicates += 1;
      // Keep annotation event; do not double-count as accepted fact
      const note = createMeasurementEvent({
        event_name: "collector.event_duplicate",
        source: { component: "measurement-plane", module: "collector" },
        correlation: { run_id: this.opts.runId, ...event.correlation },
        attributes: { duplicate_of: event.event_id, original_event_name: event.event_name },
        critical: false,
      });
      this.persist(note);
      return { accepted: false, reason: "duplicate" };
    }

    if (this.lastOccurredAt && event.occurred_at < this.lastOccurredAt) {
      this.stats.delayed += 1;
      event.quality = { ...event.quality, delayed: true };
    } else {
      this.lastOccurredAt = event.occurred_at;
    }

    const producer = `${event.source.component}:${event.source.module}`;
    const seq = (this.sequenceByProducer.get(producer) ?? 0) + 1;
    this.sequenceByProducer.set(producer, seq);
    if (event.sequence === undefined) event.sequence = seq;

    const maxQueue = this.opts.maxQueue ?? (this.stats.mode === "benchmark" ? 10_000 : 1_000);
    if (this.queue.length >= maxQueue) {
      this.stats.dropped += 1;
      this.stats.queue_high_water = Math.max(this.stats.queue_high_water, this.queue.length);
      this.recordDrop(event, "queue_overflow", "queue full");
      if (event.critical && this.stats.mode === "benchmark") {
        this.markIncomplete(`critical_lost:${event.event_name}`);
      }
      return { accepted: false, reason: "queue_overflow" };
    }

    this.queue.push(event);
    this.stats.queue_high_water = Math.max(this.stats.queue_high_water, this.queue.length);

    if (this.stats.mode === "benchmark" || event.critical) {
      return this.flushOne(event);
    }

    // Normal mode: opportunistic flush
    if (this.queue.length >= 32) this.flush();
    this.stats.accepted += 1;
    this.seenIds.add(event.event_id);
    return { accepted: true };
  }

  flush(): void {
    while (this.queue.length) {
      const event = this.queue.shift()!;
      this.flushOne(event);
    }
  }

  private flushOne(event: MeasurementEvent): { accepted: boolean; reason?: string } {
    try {
      this.persist(event);
      this.seenIds.add(event.event_id);
      this.stats.accepted += 1;
      // remove from queue if present
      const idx = this.queue.indexOf(event);
      if (idx >= 0) this.queue.splice(idx, 1);
      return { accepted: true };
    } catch (err) {
      this.stats.write_failures += 1;
      this.stats.last_error = err instanceof Error ? err.message : String(err);
      if (event.critical && this.stats.mode === "benchmark") {
        this.markIncomplete(`write_failed:${event.event_name}`);
        this.opts.onCriticalLoss?.(event, this.stats.last_error);
      }
      this.recordDrop(event, "storage_unavailable", this.stats.last_error);
      return { accepted: false, reason: "storage_unavailable" };
    }
  }

  private persist(event: MeasurementEvent): void {
    const runId = event.correlation.run_id ?? this.opts.runId;
    this.store.append(runId, event);
  }

  private recordDrop(event: MeasurementEvent, reason: string, detail: string): void {
    if (event.critical) {
      this.stats.critical_lost += 1;
      if (this.stats.mode === "benchmark") this.markIncomplete(`${reason}:${event.event_name}`);
    }
    try {
      const drop = createMeasurementEvent({
        event_name: "collector.event_dropped",
        source: { component: "measurement-plane", module: "collector" },
        correlation: { run_id: this.opts.runId },
        attributes: {
          reason,
          detail,
          dropped_event_name: event.event_name,
          dropped_event_id: event.event_id,
          critical: !!event.critical,
        },
        measurements: { dropped_count: 1 },
        critical: this.stats.mode === "benchmark",
      });
      this.store.append(this.opts.runId, drop);
    } catch {
      // last resort: stats already updated
    }
  }

  private markIncomplete(reason: string): void {
    this.incomplete = true;
    this.incompleteReasons.push(reason);
  }
}
