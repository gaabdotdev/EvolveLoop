/**
 * V2-ORCH-01 — File-Ownership Locking in the parallel scheduler.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { TaskGraphStore } from "../../src/v3/task-graph/store.js";
import {
  scheduleReadyTasks,
  releaseTaskFileLocks,
  pathsOverlap,
  taskScopePaths,
} from "../../src/v3/parallel/index.js";

describe("V2-ORCH-01 File-Ownership Locking", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v2-orch-01-"));
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

  it("taskScopePaths merges touch_paths, owned_paths, modules", () => {
    expect(
      taskScopePaths({
        touch_paths: ["src/a"],
        owned_paths: ["src/a", "src/b"],
        modules: ["pkg/mod"],
      }),
    ).toEqual(["src/a", "src/b", "pkg/mod"]);
  });

  it("pathsOverlap detects prefix intersection", () => {
    expect(pathsOverlap("src/foo", "src/foo/bar")).toBe(true);
    expect(pathsOverlap("src/foo/bar", "src/foo")).toBe(true);
    expect(pathsOverlap("src/foo", "src/bar")).toBe(false);
  });

  it("two tasks with disjoint paths can both advance (respecting max_in_progress)", () => {
    const { paths, store } = setupWork("w-disjoint");
    store.addTask("w-disjoint", {
      task_id: "t-a",
      goal_contract_id: "gc-1",
      goal_contract_version: 1,
      title: "a",
      task_kind: "research",
      depends_on: [],
      touch_paths: ["src/alpha"],
    });
    store.addTask("w-disjoint", {
      task_id: "t-b",
      goal_contract_id: "gc-1",
      goal_contract_version: 1,
      title: "b",
      task_kind: "research",
      depends_on: [],
      owned_paths: ["src/beta"],
    });

    const scheduled = scheduleReadyTasks(paths, "w-disjoint", { max_in_progress: 2 });
    expect(scheduled.newly_started.sort()).toEqual(["t-a", "t-b"]);
    expect(scheduled.queued_for_lock).toEqual([]);
    expect(scheduled.ready_but_deferred).toEqual([]);

    const inProg = store
      .load("w-disjoint")
      .tasks.filter((t) => t.state === "IN_PROGRESS")
      .map((t) => t.task_id)
      .sort();
    expect(inProg).toEqual(["t-a", "t-b"]);
  });

  it("two tasks with overlapping paths → only one IN_PROGRESS; other deferred", () => {
    const { paths, store } = setupWork("w-overlap");
    store.addTask("w-overlap", {
      task_id: "t-first",
      goal_contract_id: "gc-1",
      goal_contract_version: 1,
      title: "first",
      task_kind: "research",
      depends_on: [],
      touch_paths: ["src/shared"],
    });
    store.addTask("w-overlap", {
      task_id: "t-second",
      goal_contract_id: "gc-1",
      goal_contract_version: 1,
      title: "second",
      task_kind: "research",
      depends_on: [],
      touch_paths: ["src/shared"],
    });

    const scheduled = scheduleReadyTasks(paths, "w-overlap", { max_in_progress: 2 });
    expect(scheduled.newly_started).toEqual(["t-first"]);
    expect(scheduled.queued_for_lock).toEqual(["t-second"]);
    expect(scheduled.ready_but_deferred).toContain("t-second");

    const states = Object.fromEntries(
      store.load("w-overlap").tasks.map((t) => [t.task_id, t.state]),
    );
    expect(states["t-first"]).toBe("IN_PROGRESS");
    expect(states["t-second"]).toBe("PENDING");
  });

  it("releasing lock allows the deferred task to advance", () => {
    const { paths, store } = setupWork("w-release");
    store.addTask("w-release", {
      task_id: "t-holder",
      goal_contract_id: "gc-1",
      goal_contract_version: 1,
      title: "holder",
      task_kind: "research",
      depends_on: [],
      touch_paths: ["src/mod"],
    });
    store.addTask("w-release", {
      task_id: "t-waiter",
      goal_contract_id: "gc-1",
      goal_contract_version: 1,
      title: "waiter",
      task_kind: "research",
      depends_on: [],
      modules: ["src/mod"],
    });

    const first = scheduleReadyTasks(paths, "w-release", { max_in_progress: 2 });
    expect(first.newly_started).toEqual(["t-holder"]);
    expect(first.queued_for_lock).toEqual(["t-waiter"]);

    store.setTaskState("w-release", "t-holder", "TRUE_PASS");
    const released = releaseTaskFileLocks(paths, "w-release", "t-holder");
    expect(released).toBeGreaterThan(0);

    const second = scheduleReadyTasks(paths, "w-release", { max_in_progress: 2 });
    expect(second.newly_started).toEqual(["t-waiter"]);
    expect(second.queued_for_lock).toEqual([]);
    expect(store.load("w-release").tasks.find((t) => t.task_id === "t-waiter")?.state).toBe(
      "IN_PROGRESS",
    );
  });

  it("prefix overlap via pathsOverlap blocks concurrent start", () => {
    const { paths, store } = setupWork("w-prefix");
    // task_id order is the stable tie-break when created_at collides.
    store.addTask("w-prefix", {
      task_id: "t-a",
      goal_contract_id: "gc-1",
      goal_contract_version: 1,
      title: "parent-scope",
      task_kind: "research",
      depends_on: [],
      touch_paths: ["src/pkg"],
    });
    store.addTask("w-prefix", {
      task_id: "t-b",
      goal_contract_id: "gc-1",
      goal_contract_version: 1,
      title: "child-scope",
      task_kind: "research",
      depends_on: [],
      touch_paths: ["src/pkg/util"],
    });

    expect(pathsOverlap("src/pkg", "src/pkg/util")).toBe(true);

    const scheduled = scheduleReadyTasks(paths, "w-prefix", { max_in_progress: 2 });
    expect(scheduled.newly_started).toEqual(["t-a"]);
    expect(scheduled.queued_for_lock).toEqual(["t-b"]);
    expect(store.load("w-prefix").tasks.find((t) => t.task_id === "t-b")?.state).toBe("PENDING");
  });

  it("max_in_progress still defers without lock conflict", () => {
    const { paths, store } = setupWork("w-slots");
    for (const id of ["a", "b", "c"]) {
      store.addTask("w-slots", {
        task_id: id,
        goal_contract_id: "gc-1",
        goal_contract_version: 1,
        title: id,
        task_kind: "research",
        depends_on: [],
        touch_paths: [`src/${id}`],
      });
    }
    const scheduled = scheduleReadyTasks(paths, "w-slots", { max_in_progress: 2 });
    expect(scheduled.newly_started.length).toBe(2);
    expect(scheduled.ready_but_deferred).toEqual(["c"]);
    expect(scheduled.queued_for_lock).toEqual([]);
  });

  it("5 ready tasks with partial path intersection: only non-conflicting advance", () => {
    // §4.1 shape (3–5 concurrent) at scheduler level — not live worktrees.
    const { paths, store } = setupWork("w-five");
    const specs: Array<{ id: string; touch: string[] }> = [
      { id: "t1", touch: ["src/shared"] },
      { id: "t2", touch: ["src/shared", "src/a"] }, // conflicts with t1
      { id: "t3", touch: ["src/b"] }, // disjoint
      { id: "t4", touch: ["src/c"] }, // disjoint
      { id: "t5", touch: ["src/shared/nested"] }, // prefix-conflicts with t1
    ];
    for (const s of specs) {
      store.addTask("w-five", {
        task_id: s.id,
        goal_contract_id: "gc-1",
        goal_contract_version: 1,
        title: s.id,
        task_kind: "research",
        depends_on: [],
        touch_paths: s.touch,
      });
    }

    const scheduled = scheduleReadyTasks(paths, "w-five", { max_in_progress: 5 });
    expect(scheduled.newly_started).toEqual(["t1", "t3", "t4"]);
    expect(scheduled.queued_for_lock.sort()).toEqual(["t2", "t5"]);
    expect(scheduled.ready_but_deferred.sort()).toEqual(["t2", "t5"]);

    const states = Object.fromEntries(
      store.load("w-five").tasks.map((t) => [t.task_id, t.state]),
    );
    expect(states["t1"]).toBe("IN_PROGRESS");
    expect(states["t3"]).toBe("IN_PROGRESS");
    expect(states["t4"]).toBe("IN_PROGRESS");
    expect(states["t2"]).toBe("PENDING");
    expect(states["t5"]).toBe("PENDING");
  });
});
