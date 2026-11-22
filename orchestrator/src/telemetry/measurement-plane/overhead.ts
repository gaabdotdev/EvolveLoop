/**
 * Measure Measurement Plane instrumentation overhead (local, deterministic).
 */

import { performance } from "node:perf_hooks";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMeasurementPaths } from "./paths.js";
import { MeasurementEventStore } from "./event-store.js";
import { TelemetryCollector } from "./collector.js";
import { createMeasurementEvent } from "./envelope.js";
import { reconstructExecution } from "./trace/builder.js";
import { buildRunMetricsReport } from "./metrics/engine.js";

export interface OverheadSample {
  label: "none" | "minimal" | "full";
  iterations: number;
  wall_ms_mean: number;
  wall_ms_min: number;
  wall_ms_max: number;
  rss_delta_bytes_mean: number;
  storage_bytes_mean: number;
  events_per_iter: number;
  rebuild_ms_mean: number;
  report_ms_mean: number;
}

function dirBytes(path: string): number {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (st.isFile()) return st.size;
  let n = 0;
  for (const name of readdirSync(path)) n += dirBytes(join(path, name));
  return n;
}

function runOnce(label: OverheadSample["label"], workDir: string): {
  wall_ms: number;
  rss_delta: number;
  storage: number;
  events: number;
  rebuild_ms: number;
  report_ms: number;
} {
  const rss0 = process.memoryUsage().rss;
  const t0 = performance.now();
  let events = 0;
  let rebuild_ms = 0;
  let report_ms = 0;
  let storage = 0;

  if (label === "none") {
    // Pure CPU baseline: no collector/store
    let x = 0;
    for (let i = 0; i < 200; i++) x += i * i;
    void x;
  } else {
    const paths = resolveMeasurementPaths(workDir);
    const store = new MeasurementEventStore(paths);
    const run_id = `oh_${label}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const collector = new TelemetryCollector(store, {
      mode: label === "full" ? "benchmark" : "normal",
      runId: run_id,
      maxQueue: label === "full" ? 10_000 : 256,
    });
    const count = label === "full" ? 80 : 20;
    for (let i = 0; i < count; i++) {
      const r = collector.ingest(
        createMeasurementEvent({
          event_name: i === 0 ? "run.started" : i === count - 1 ? "run.completed" : "tool.completed",
          source: { component: "overhead", module: "bench" },
          correlation: { run_id, agent_id: "agent_root", task_id: `t${i}` },
          measurements: { duration_ms: 1 + (i % 5) },
          critical: i === 0 || i === count - 1,
        }),
      );
      if (r.accepted) events += 1;
    }
    collector.flush();
    const loaded = store.load(run_id);
    const rb0 = performance.now();
    reconstructExecution(loaded);
    rebuild_ms = performance.now() - rb0;
    const rp0 = performance.now();
    buildRunMetricsReport(loaded);
    report_ms = performance.now() - rp0;
    storage = dirBytes(paths.root);
  }

  const wall_ms = performance.now() - t0;
  const rss_delta = process.memoryUsage().rss - rss0;
  return { wall_ms, rss_delta, storage, events, rebuild_ms, report_ms };
}

export function measureInstrumentationOverhead(iterations = 5): {
  samples: OverheadSample[];
  methodology: string[];
  limitations: string[];
} {
  const root = mkdtempSync(join(tmpdir(), "mp-overhead-"));
  const samples: OverheadSample[] = [];
  try {
    for (const label of ["none", "minimal", "full"] as const) {
      const walls: number[] = [];
      const rss: number[] = [];
      const storage: number[] = [];
      const events: number[] = [];
      const rebuild: number[] = [];
      const report: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const dir = join(root, `${label}_${i}`);
        const s = runOnce(label, dir);
        walls.push(s.wall_ms);
        rss.push(s.rss_delta);
        storage.push(s.storage);
        events.push(s.events);
        rebuild.push(s.rebuild_ms);
        report.push(s.report_ms);
      }
      const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
      samples.push({
        label,
        iterations,
        wall_ms_mean: mean(walls),
        wall_ms_min: Math.min(...walls),
        wall_ms_max: Math.max(...walls),
        rss_delta_bytes_mean: mean(rss),
        storage_bytes_mean: mean(storage),
        events_per_iter: mean(events),
        rebuild_ms_mean: mean(rebuild),
        report_ms_mean: mean(report),
      });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  return {
    samples,
    methodology: [
      "none: CPU loop without Measurement Plane",
      "minimal: normal-mode collector + ~20 events",
      "full: benchmark-mode collector + ~80 events + reconstruct + metrics report",
      "RSS deltas are process-level and noisy on small samples",
    ],
    limitations: [
      "Does not measure live ExecutionEngine attach path end-to-end",
      "Does not include network LLM latency",
      "Synthetic event generation — not a substitute for suite benchmarks",
    ],
  };
}

export function writeOverheadReport(outPath: string, iterations = 5): ReturnType<typeof measureInstrumentationOverhead> {
  const report = measureInstrumentationOverhead(iterations);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  return report;
}
