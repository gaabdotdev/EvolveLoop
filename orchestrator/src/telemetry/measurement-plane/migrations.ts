/**
 * Persistent schema migrations + integrity recovery for Measurement Event Store.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { MEASUREMENT_SCHEMA_VERSION, type MeasurementEvent } from "./types.js";
import type { MeasurementDataPaths } from "./paths.js";
import { createMeasurementEvent, validateMeasurementEvent } from "./envelope.js";

export const STORE_META_VERSION = 1;

export interface StoreMeta {
  store_meta_version: number;
  event_schema_version: string;
  migrated_at?: string;
  migrations_applied: string[];
}

export interface IntegrityReport {
  run_id: string;
  total_lines: number;
  valid_events: number;
  corrupt_lines: number;
  migrated_events: number;
  quarantined_path?: string;
  repaired: boolean;
}

export interface MigrationResult {
  from: string;
  to: string;
  meta: StoreMeta;
  runs_processed: number;
  events_migrated: number;
  integrity: IntegrityReport[];
}

function metaPath(paths: MeasurementDataPaths): string {
  return join(paths.root, "store-meta.json");
}

export function readStoreMeta(paths: MeasurementDataPaths): StoreMeta | null {
  const p = metaPath(paths);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as StoreMeta;
}

export function writeStoreMeta(paths: MeasurementDataPaths, meta: StoreMeta): void {
  mkdirSync(paths.root, { recursive: true });
  writeFileSync(metaPath(paths), JSON.stringify(meta, null, 2));
}

/** Normalize legacy / partial objects into schema 1.0 envelopes when possible. */
export function migrateEventToV1(raw: unknown): { event: MeasurementEvent | null; migrated: boolean; error?: string } {
  if (!raw || typeof raw !== "object") return { event: null, migrated: false, error: "not_object" };
  const obj = raw as Record<string, unknown>;

  if (obj.schema_version === MEASUREMENT_SCHEMA_VERSION) {
    const v = validateMeasurementEvent(obj);
    if (v.ok) return { event: obj as unknown as MeasurementEvent, migrated: false };
    return { event: null, migrated: false, error: v.errors.join(";") };
  }

  // Legacy engine EventEnvelope-ish → wrap
  if (typeof obj.type === "string" && typeof obj.event_id === "string") {
    const wrapped = createMeasurementEvent({
      event_name: `legacy.${obj.type}`,
      event_id: `evt_mig_${String(obj.event_id).replace(/-/g, "").slice(0, 20)}`,
      occurred_at: typeof obj.timestamp === "string" ? obj.timestamp : undefined,
      source: {
        component: "migration",
        module: "legacy-event-envelope",
        instance_id: typeof obj.source === "string" ? obj.source : undefined,
      },
      correlation: {
        run_id: typeof obj.feature_id === "string" ? obj.feature_id : undefined,
        feature_id: typeof obj.feature_id === "string" ? obj.feature_id : undefined,
        engine_node_run_id: typeof obj.correlation_id === "string" ? obj.correlation_id : undefined,
      },
      provenance: { kind: "DERIVED", reported_by: "migration-v1" },
      attributes: {
        legacy: true,
        payload_keys:
          obj.payload && typeof obj.payload === "object" ? Object.keys(obj.payload as object) : [],
      },
      quality: { complete: false, estimated_fields: [], missing_fields: ["original_schema"] },
    });
    return { event: wrapped, migrated: true };
  }

  // Partial measurement event missing schema_version
  if (typeof obj.event_name === "string" && typeof obj.event_id === "string") {
    const filled = createMeasurementEvent({
      event_name: obj.event_name,
      event_id: obj.event_id,
      occurred_at: typeof obj.occurred_at === "string" ? obj.occurred_at : undefined,
      source:
        obj.source && typeof obj.source === "object"
          ? (obj.source as MeasurementEvent["source"])
          : { component: "migration", module: "partial-event" },
      correlation:
        obj.correlation && typeof obj.correlation === "object"
          ? (obj.correlation as MeasurementEvent["correlation"])
          : {},
      provenance:
        obj.provenance && typeof obj.provenance === "object"
          ? (obj.provenance as MeasurementEvent["provenance"])
          : { kind: "UNKNOWN", reported_by: "migration-v1" },
      privacy:
        obj.privacy && typeof obj.privacy === "object"
          ? (obj.privacy as MeasurementEvent["privacy"])
          : undefined,
      attributes: (obj.attributes as Record<string, unknown>) ?? { migrated_partial: true },
      measurements: (obj.measurements as MeasurementEvent["measurements"]) ?? {},
      quality: { complete: false, estimated_fields: [], missing_fields: ["schema_version"] },
    });
    return { event: filled, migrated: true };
  }

  return { event: null, migrated: false, error: "unrecognized_shape" };
}

export function repairRunJsonl(
  paths: MeasurementDataPaths,
  runId: string,
  opts?: { write?: boolean },
): IntegrityReport {
  const file = join(paths.eventsDir, `${runId}.jsonl`);
  const report: IntegrityReport = {
    run_id: runId,
    total_lines: 0,
    valid_events: 0,
    corrupt_lines: 0,
    migrated_events: 0,
    repaired: false,
  };
  if (!existsSync(file)) return report;

  const lines = readFileSync(file, "utf-8").split("\n").filter((l) => l.length > 0);
  report.total_lines = lines.length;
  const good: string[] = [];
  const bad: string[] = [];

  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      report.corrupt_lines += 1;
      bad.push(line);
      continue;
    }
    const { event, migrated, error } = migrateEventToV1(parsed);
    if (!event) {
      report.corrupt_lines += 1;
      bad.push(JSON.stringify({ error, raw: parsed }));
      continue;
    }
    if (migrated) report.migrated_events += 1;
    report.valid_events += 1;
    good.push(JSON.stringify(event));
  }

  if (opts?.write !== false && (report.corrupt_lines > 0 || report.migrated_events > 0)) {
    const quarantineDir = join(paths.root, "quarantine");
    mkdirSync(quarantineDir, { recursive: true });
    if (bad.length) {
      const q = join(quarantineDir, `${runId}.${Date.now()}.corrupt.jsonl`);
      writeFileSync(q, bad.join("\n") + "\n");
      report.quarantined_path = q;
    }
    const bak = `${file}.bak`;
    if (!existsSync(bak)) copyFileSync(file, bak);
    writeFileSync(file, good.map((l) => l).join("\n") + (good.length ? "\n" : ""));
    report.repaired = true;
  }

  return report;
}

export function migrateStoreToCurrent(paths: MeasurementDataPaths): MigrationResult {
  mkdirSync(paths.eventsDir, { recursive: true });
  const previous = readStoreMeta(paths);
  const from = previous?.event_schema_version ?? "unknown";
  const integrity: IntegrityReport[] = [];
  let events_migrated = 0;
  let runs = 0;

  if (existsSync(paths.eventsDir)) {
    for (const name of readdirSync(paths.eventsDir)) {
      if (!name.endsWith(".jsonl")) continue;
      const runId = name.replace(/\.jsonl$/, "");
      runs += 1;
      const rep = repairRunJsonl(paths, runId, { write: true });
      integrity.push(rep);
      events_migrated += rep.migrated_events;
    }
  }

  const meta: StoreMeta = {
    store_meta_version: STORE_META_VERSION,
    event_schema_version: MEASUREMENT_SCHEMA_VERSION,
    migrated_at: new Date().toISOString(),
    migrations_applied: [
      ...(previous?.migrations_applied ?? []),
      `to-${MEASUREMENT_SCHEMA_VERSION}@${new Date().toISOString()}`,
    ],
  };
  writeStoreMeta(paths, meta);

  return {
    from,
    to: MEASUREMENT_SCHEMA_VERSION,
    meta,
    runs_processed: runs,
    events_migrated,
    integrity,
  };
}

/** Verify store can be read after backup rename recovery simulation. */
export function recoverFromBackup(paths: MeasurementDataPaths, runId: string): boolean {
  const file = join(paths.eventsDir, `${runId}.jsonl`);
  const bak = `${file}.bak`;
  if (!existsSync(bak)) return false;
  renameSync(bak, file);
  return true;
}
