/**
 * V1-ORCH-02 — Hybrid event sourcing: atomic append + project.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StateDb } from "../../src/v3/state-db/index.js";

describe("V1-ORCH-02 hybrid event sourcing", () => {
  let tmp: string;
  let db: StateDb;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-orch02-"));
    db = new StateDb(path.join(tmp, "state.db"));
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("creates events + task_substates tables (schema v6)", () => {
    const tables = db.listTables();
    expect(tables).toContain("events");
    expect(tables).toContain("task_substates");
    expect(tables).toContain("evidence_records");
  });

  it("atomically appends event and projects task sub-state + task_graph", () => {
    const { event, substate } = db.appendEventAndProject({
      stream_id: "work:w1",
      event_type: "task.started",
      work_id: "w1",
      task_id: "t1",
      payload: { note: "go" },
      substate: {
        machine: "task_lifecycle",
        state: "IN_PROGRESS",
        checkpoint_id: "cp-9",
        payload: { mso_independent: true },
      },
      task_graph: { state: "IN_PROGRESS", payload: { role: "impl" } },
    });

    expect(event.seq).toBe(1);
    expect(event.event_type).toBe("task.started");
    expect(substate?.state).toBe("IN_PROGRESS");
    expect(substate?.checkpoint_id).toBe("cp-9");

    const events = db.listEvents("work:w1");
    expect(events).toHaveLength(1);

    const projected = db.getTaskSubstate("w1", "t1", "task_lifecycle");
    expect(projected?.state).toBe("IN_PROGRESS");
    expect(projected?.payload.mso_independent).toBe(true);

    const nodes = db.listTaskGraphNodes("w1");
    expect(nodes[0]?.state).toBe("IN_PROGRESS");

    // Second event advances seq; sub-state machine stays decoupled from global MSO
    const second = db.appendEventAndProject({
      stream_id: "work:w1",
      event_type: "task.blocked",
      work_id: "w1",
      task_id: "t1",
      substate: { machine: "task_lifecycle", state: "BLOCKED" },
      task_graph: { state: "BLOCKED" },
    });
    expect(second.event.seq).toBe(2);
    expect(db.getTaskSubstate("w1", "t1", "task_lifecycle")?.state).toBe("BLOCKED");
  });

  it("keeps event stream and projection consistent (same transaction)", () => {
    db.appendEventAndProject({
      stream_id: "s1",
      event_type: "task.started",
      work_id: "w",
      task_id: "t",
      substate: { machine: "task_lifecycle", state: "IN_PROGRESS" },
      task_graph: { state: "IN_PROGRESS" },
    });
    db.appendEventAndProject({
      stream_id: "s1",
      event_type: "task.done",
      work_id: "w",
      task_id: "t",
      substate: { machine: "task_lifecycle", state: "TRUE_PASS" },
      task_graph: { state: "TRUE_PASS" },
    });

    const events = db.listEvents("s1");
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
    expect(db.getTaskSubstate("w", "t", "task_lifecycle")?.state).toBe("TRUE_PASS");
    expect(db.listTaskGraphNodes("w")[0]?.state).toBe("TRUE_PASS");
    // Per-task machine is independent of global MSO session table
    expect(db.listTables()).toContain("mso_sessions");
  });
});
