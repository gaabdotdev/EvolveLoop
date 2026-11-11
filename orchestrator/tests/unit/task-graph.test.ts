import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TaskGraphStore, canStartTask } from "../../src/v3/task-graph/index.js";

describe("TaskGraphStore (V3.0)", () => {
  let tmp: string;
  let store: TaskGraphStore;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "task-graph-"));
    store = new TaskGraphStore(tmp);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("creates graph, approves plan, links engine ids", () => {
    store.create("work-1", "gc-1", 1);
    store.addTask("work-1", {
      task_id: "plan-backend",
      goal_contract_id: "gc-1",
      goal_contract_version: 1,
      title: "Plan backend",
      domain: "backend",
      task_kind: "plan",
      depends_on: [],
    });
    store.addTask("work-1", {
      task_id: "impl-backend",
      goal_contract_id: "gc-1",
      goal_contract_version: 1,
      title: "Implement backend",
      domain: "backend",
      task_kind: "implement",
      depends_on: ["plan-backend"],
      parent_task_id: "plan-backend",
    });
    const before = store.load("work-1");
    const byIdBefore = new Map(before.tasks.map((t) => [t.task_id, t]));
    expect(canStartTask(before.tasks.find((t) => t.task_id === "impl-backend")!, byIdBefore)).toBe(
      false,
    );

    store.approvePlan("work-1", "plan-backend", 1);
    const snap = store.linkEngineRun("work-1", "impl-backend", {
      feature_id: "feat-1",
      ir_id: "ir-1",
      run_id: "run-1",
    });
    const impl = snap.tasks.find((t) => t.task_id === "impl-backend")!;
    expect(impl.feature_id).toBe("feat-1");
    expect(snap.tasks.find((t) => t.task_id === "plan-backend")?.plan_approved).toBe(true);

    const byId = new Map(snap.tasks.map((t) => [t.task_id, t]));
    expect(canStartTask(impl, byId)).toBe(true);
  });
});
