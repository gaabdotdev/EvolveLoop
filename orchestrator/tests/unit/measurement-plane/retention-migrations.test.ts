import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  utimesSync,
  existsSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMeasurementPaths } from "../../../src/telemetry/measurement-plane/paths.js";
import { MeasurementEventStore } from "../../../src/telemetry/measurement-plane/event-store.js";
import { createMeasurementEvent } from "../../../src/telemetry/measurement-plane/envelope.js";
import { applyRetention } from "../../../src/telemetry/measurement-plane/retention.js";
import {
  migrateStoreToCurrent,
  migrateEventToV1,
  repairRunJsonl,
  readStoreMeta,
  recoverFromBackup,
} from "../../../src/telemetry/measurement-plane/migrations.js";

describe("retention", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ret-"));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("deletes aged runs and keeps recent ones", () => {
    const paths = resolveMeasurementPaths(tmp);
    const store = new MeasurementEventStore(paths);
    store.append(
      "old_run",
      createMeasurementEvent({
        event_name: "run.completed",
        source: { component: "t", module: "t" },
        correlation: { run_id: "old_run" },
        occurred_at: "2020-01-01T00:00:00.000Z",
      }),
    );
    store.append(
      "new_run",
      createMeasurementEvent({
        event_name: "run.completed",
        source: { component: "t", module: "t" },
        correlation: { run_id: "new_run" },
        occurred_at: new Date().toISOString(),
      }),
    );
    const oldPath = join(paths.eventsDir, "old_run.jsonl");
    const past = new Date("2020-01-02T00:00:00Z");
    utimesSync(oldPath, past, past);

    const dry = applyRetention(paths, { retention_days: 30, dry_run: true });
    expect(dry.deleted_runs).toContain("old_run");
    expect(existsSync(oldPath)).toBe(true);

    const applied = applyRetention(paths, { retention_days: 30, dry_run: false });
    expect(applied.deleted_runs).toContain("old_run");
    expect(existsSync(oldPath)).toBe(false);
    expect(existsSync(join(paths.eventsDir, "new_run.jsonl"))).toBe(true);
  });
});

describe("migrations + integrity recovery", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "mig-"));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("migrates legacy EventEnvelope and quarantines corrupt lines", () => {
    const paths = resolveMeasurementPaths(tmp);
    const runId = "run_legacy";
    const file = join(paths.eventsDir, `${runId}.jsonl`);
    const legacy = {
      event_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      type: "FeatureStarted",
      timestamp: "2026-01-01T00:00:00.000Z",
      feature_id: "feat_1",
      source: "engine",
      payload: { ok: true },
    };
    writeFileSync(file, `${JSON.stringify(legacy)}\n{not-json\n`);

    const migrated = migrateEventToV1(legacy);
    expect(migrated.migrated).toBe(true);
    expect(migrated.event?.schema_version).toBe("1.0");

    const result = migrateStoreToCurrent(paths);
    expect(result.events_migrated).toBeGreaterThanOrEqual(1);
    expect(readStoreMeta(paths)?.event_schema_version).toBe("1.0");
    const integ = result.integrity.find((i) => i.run_id === runId);
    expect(integ?.corrupt_lines).toBeGreaterThanOrEqual(1);
    expect(integ?.valid_events).toBeGreaterThanOrEqual(1);
    expect(integ?.quarantined_path && existsSync(integ.quarantined_path)).toBe(true);

    // backup recovery: remove active file, restore from .bak
    const bak = `${file}.bak`;
    expect(existsSync(bak)).toBe(true);
    unlinkSync(file);
    expect(recoverFromBackup(paths, runId)).toBe(true);
    expect(readFileSync(file, "utf-8").length).toBeGreaterThan(0);

    // second repair on clean migrated file should keep valid events
    const repaired = repairRunJsonl(paths, runId, { write: true });
    expect(repaired.valid_events).toBeGreaterThanOrEqual(1);
  });
});
