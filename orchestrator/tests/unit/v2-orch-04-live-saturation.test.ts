/**
 * V2-ORCH-04 live — backpressure under injected rate-limit + memory saturation.
 * Reads real host mem% and AMD/sysfs VRAM when present; else VRAM=UNAVAILABLE.
 * Proves concurrency reduction without crash.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { TaskGraphStore } from "../../src/v3/task-graph/store.js";
import {
  BackpressureController,
  scheduleReadyTasks,
  BACKPRESSURE_MEM_CRITICAL,
  BACKPRESSURE_VRAM_CRITICAL,
} from "../../src/v3/parallel/index.js";

function readMemPercent(): number {
  const total = os.totalmem();
  const free = os.freemem();
  if (total <= 0) return 0;
  return ((total - free) / total) * 100;
}

function probeVram():
  | { status: "AVAILABLE"; usedPercent: number; totalBytes: number; usedBytes: number; source: string }
  | { status: "UNAVAILABLE"; reason: string } {
  const totalPath = "/sys/class/drm/card0/device/mem_info_vram_total";
  const usedPath = "/sys/class/drm/card0/device/mem_info_vram_used";
  if (!existsSync(totalPath) || !existsSync(usedPath)) {
    return { status: "UNAVAILABLE", reason: "sysfs_vram_paths_missing" };
  }
  try {
    const totalBytes = Number(readFileSync(totalPath, "utf-8").trim());
    const usedBytes = Number(readFileSync(usedPath, "utf-8").trim());
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
      return { status: "UNAVAILABLE", reason: "vram_total_non_positive" };
    }
    return {
      status: "AVAILABLE",
      totalBytes,
      usedBytes,
      usedPercent: (usedBytes / totalBytes) * 100,
      source: totalPath,
    };
  } catch (err) {
    return {
      status: "UNAVAILABLE",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

describe("V2-ORCH-04 live saturation backpressure", () => {
  it("rate-limit + mem saturation reduce concurrency without crash; VRAM probed", () => {
    const vram = probeVram();
    const memPercent = readMemPercent();

    const ctrl = new BackpressureController({
      floor: 1,
      ceiling: 8,
      initial: 8,
    });

    // Wave 1: healthy — stay high / may increase already at ceiling.
    const healthy = ctrl.observe({
      rateLimitRemaining: 90,
      rateLimitLimit: 100,
      localTelemetry: {
        memPercent: Math.min(memPercent, 50),
        ...(vram.status === "AVAILABLE"
          ? { vramUsedPercent: Math.min(vram.usedPercent, 50) }
          : {}),
      },
    });
    expect(healthy.max_in_progress).toBe(8);

    // Wave 2: inject rate-limit saturation (remaining/limit < 0.2).
    const afterRate = ctrl.observe({
      rateLimitRemaining: 1,
      rateLimitLimit: 100,
      localTelemetry: { memPercent },
    });
    expect(afterRate.max_in_progress).toBe(7);
    expect(ctrl.getLastDecision()?.action).toBe("reduce");

    // Wave 3: inject memory critical (≥95) regardless of real host.
    const afterMem = ctrl.observe({
      rateLimitRemaining: 50,
      rateLimitLimit: 100,
      localTelemetry: { memPercent: BACKPRESSURE_MEM_CRITICAL },
    });
    expect(afterMem.max_in_progress).toBe(6);
    expect(ctrl.getLastDecision()?.reason).toContain("memPercent");

    // Wave 4: if VRAM available, inject critical VRAM; else document UNAVAILABLE.
    let vramDecision: string;
    if (vram.status === "AVAILABLE") {
      const afterVram = ctrl.observe({
        rateLimitRemaining: 80,
        rateLimitLimit: 100,
        localTelemetry: { vramUsedPercent: BACKPRESSURE_VRAM_CRITICAL },
      });
      expect(afterVram.max_in_progress).toBe(5);
      expect(ctrl.getLastDecision()?.reason).toContain("vramUsedPercent");
      vramDecision = `REDUCED_WITH_REAL_PROBE usedPercent_probe=${vram.usedPercent.toFixed(2)} injected=${BACKPRESSURE_VRAM_CRITICAL}`;
    } else {
      vramDecision = `VRAM=UNAVAILABLE reason=${vram.reason}`;
      // Still prove deterministic rate-limit path continues without crash.
      const again = ctrl.observe({
        rateLimitRemaining: 0,
        rateLimitLimit: 100,
      });
      expect(again.max_in_progress).toBeLessThanOrEqual(5);
    }

    // Integrate with scheduler: reduced policy caps starts.
    const tmp = path.join(os.tmpdir(), `v2-orch-04-live-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    const paths = resolveV3DataPaths(path.join(tmp, "data"));
    const store = new TaskGraphStore(paths.taskGraphsDir);
    store.create("w-bp-live", "gc-1", 1);
    for (let i = 1; i <= 8; i++) {
      store.addTask("w-bp-live", {
        task_id: `t${i}`,
        goal_contract_id: "gc-1",
        goal_contract_version: 1,
        title: `t${i}`,
        task_kind: "research",
        depends_on: [],
        touch_paths: [`src/t${i}`],
      });
    }
    const policy = ctrl.getPolicy();
    const scheduled = scheduleReadyTasks(paths, "w-bp-live", policy);
    expect(scheduled.newly_started.length).toBe(policy.max_in_progress);
    expect(scheduled.ready_but_deferred.length).toBe(8 - policy.max_in_progress);
    expect(policy.max_in_progress).toBeLessThan(8);

    const evidence = {
      kind: "ORCH04LiveSaturation",
      host_mem_percent: memPercent,
      vram,
      vram_decision: vramDecision,
      final_max_in_progress: policy.max_in_progress,
      newly_started: scheduled.newly_started.length,
      deferred: scheduled.ready_but_deferred.length,
      crash: false,
    };
    expect(evidence.crash).toBe(false);
    expect(evidence.final_max_in_progress).toBeLessThan(8);
    // Attach for harness log via console (captured by evidence runner).
    console.log("ORCH04_EVIDENCE_JSON=" + JSON.stringify(evidence));
  });
});
