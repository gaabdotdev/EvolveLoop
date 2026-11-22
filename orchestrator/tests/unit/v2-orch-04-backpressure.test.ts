/**
 * V2-ORCH-04 — Dynamic backpressure (rate-limit + local telemetry).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { TaskGraphStore } from "../../src/v3/task-graph/store.js";
import {
  scheduleReadyTasks,
  BackpressureController,
  applyBackpressure,
  computeBackpressureMax,
} from "../../src/v3/parallel/index.js";

describe("V2-ORCH-04 Dynamic Backpressure", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v2-orch-04-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  });

  function setupWork(workId: string) {
    const paths = resolveV3DataPaths(path.join(tmp, "data"));
    const store = new TaskGraphStore(paths.taskGraphsDir);
    store.create(workId, "gc-1", 1);
    return { paths, store };
  }

  it("rate-limit saturation reduces max_in_progress", () => {
    const ctrl = new BackpressureController({
      floor: 1,
      ceiling: 4,
      initial: 4,
    });
    // remaining/limit = 1/10 = 0.1 < 0.2
    const policy = ctrl.observe({
      rateLimitRemaining: 1,
      rateLimitLimit: 10,
    });
    expect(policy.max_in_progress).toBe(3);
    expect(ctrl.getState().max_in_progress).toBe(3);
    expect(ctrl.getLastDecision()?.action).toBe("reduce");
  });

  it("high VRAM telemetry reduces max_in_progress", () => {
    const before = applyBackpressure(
      { max_in_progress: 3 },
      {
        rateLimitRemaining: 80,
        rateLimitLimit: 100,
        localTelemetry: { vramUsedPercent: 92 },
      },
      { floor: 1, ceiling: 4 },
    );
    expect(before.max_in_progress).toBe(2);

    const decision = computeBackpressureMax(
      3,
      { floor: 1, ceiling: 4 },
      { localTelemetry: { vramUsedPercent: 90 } },
    );
    expect(decision.action).toBe("reduce");
    expect(decision.max_in_progress).toBe(2);
  });

  it("high CPU telemetry reduces immediately even with healthy rate-limit", () => {
    const policy = applyBackpressure(
      { max_in_progress: 4 },
      {
        rateLimitRemaining: 90,
        rateLimitLimit: 100,
        localTelemetry: { cpuPercent: 96 },
      },
      { floor: 1, ceiling: 4 },
    );
    expect(policy.max_in_progress).toBe(3);
  });

  it("recovers toward ceiling when signals normalize", () => {
    const ctrl = new BackpressureController({
      floor: 1,
      ceiling: 4,
      initial: 2,
    });

    // Healthy ratio 0.8 > 0.5 and telemetry OK → increase
    expect(
      ctrl.observe({
        rateLimitRemaining: 80,
        rateLimitLimit: 100,
        localTelemetry: { cpuPercent: 20, vramUsedPercent: 30 },
      }).max_in_progress,
    ).toBe(3);

    expect(
      ctrl.observe({
        rateLimitRemaining: 70,
        rateLimitLimit: 100,
        localTelemetry: { cpuPercent: 25, vramUsedPercent: 40 },
      }).max_in_progress,
    ).toBe(4);

    // Already at ceiling — stays at 4
    expect(
      ctrl.observe({
        rateLimitRemaining: 60,
        rateLimitLimit: 100,
      }).max_in_progress,
    ).toBe(4);
  });

  it("never goes below floor or above ceiling", () => {
    const ctrl = new BackpressureController({
      floor: 2,
      ceiling: 3,
      initial: 2,
    });

    // Repeated saturation cannot drop below floor
    for (let i = 0; i < 5; i++) {
      ctrl.observe({ rateLimitRemaining: 0, rateLimitLimit: 100 });
    }
    expect(ctrl.getState().max_in_progress).toBe(2);

    const atCeiling = new BackpressureController({
      floor: 1,
      ceiling: 2,
      initial: 2,
    });
    for (let i = 0; i < 5; i++) {
      atCeiling.observe({ rateLimitRemaining: 90, rateLimitLimit: 100 });
    }
    expect(atCeiling.getState().max_in_progress).toBe(2);

    const clamped = applyBackpressure(
      { max_in_progress: 99 },
      { rateLimitRemaining: 90, rateLimitLimit: 100 },
      { floor: 1, ceiling: 3 },
    );
    // current 99 clamped to ceiling 3, then increase would stay at 3
    expect(clamped.max_in_progress).toBe(3);
  });

  it("scheduleReadyTasks respects resulting policy (smoke)", () => {
    const { paths, store } = setupWork("w-bp");
    for (const id of ["t1", "t2", "t3", "t4"]) {
      store.addTask("w-bp", {
        task_id: id,
        goal_contract_id: "gc-1",
        goal_contract_version: 1,
        title: id,
        task_kind: "research",
        depends_on: [],
        touch_paths: [`src/${id}`],
      });
    }

    const ctrl = new BackpressureController({
      floor: 1,
      ceiling: 4,
      initial: 4,
    });
    // Saturate → max_in_progress becomes 3
    const policy = ctrl.observe({
      rateLimitRemaining: 1,
      rateLimitLimit: 20,
    });
    expect(policy.max_in_progress).toBe(3);

    const scheduled = scheduleReadyTasks(paths, "w-bp", policy);
    expect(scheduled.policy.max_in_progress).toBe(3);
    expect(scheduled.newly_started).toHaveLength(3);
    expect(scheduled.ready_but_deferred).toHaveLength(1);
    expect(scheduled.newly_started.sort()).toEqual(["t1", "t2", "t3"]);
    expect(scheduled.ready_but_deferred).toEqual(["t4"]);
  });

  it("mid-band rate-limit holds concurrency", () => {
    const decision = computeBackpressureMax(
      3,
      { floor: 1, ceiling: 5 },
      { rateLimitRemaining: 35, rateLimitLimit: 100 },
    );
    expect(decision.action).toBe("hold");
    expect(decision.max_in_progress).toBe(3);
  });
});
