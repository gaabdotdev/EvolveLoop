/**
 * V1-ORCH-03 — Delta Grill-Me with mocked process kill.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StateDb } from "../../src/v3/state-db/index.js";
import { applyDeltaGrillMe, listStaleEvidence } from "../../src/v3/grill-me/delta.js";
import type { GoalContract } from "../../src/v3/goal-contract/types.js";

function contract(version: number, opts?: { objective?: string; criteriaIds?: string[] }): GoalContract {
  const ts = new Date().toISOString();
  const ids = opts?.criteriaIds ?? ["c1", "c2"];
  return {
    kind: "GoalContract",
    goal_contract_id: "gc-delta",
    version,
    created_at: ts,
    updated_at: ts,
    objective: opts?.objective ?? "delta objective",
    scope: ["src/"],
    out_of_scope: [],
    functional_requirements: [],
    non_functional_requirements: [],
    constraints: [],
    dependencies: [],
    risks: [],
    work_id: "work-delta",
    supersedes_version: version > 1 ? version - 1 : undefined,
    criteria: ids.map((id) => ({
      id,
      description: `crit ${id}`,
      mandatory: true,
      verification: [{ id: `v-${id}`, kind: "command" as const, description: "x" }],
      evidence_required: ["e"],
      state: "NOT_STARTED" as const,
      evidence_ids: [],
      updated_at: ts,
    })),
  };
}

describe("V1-ORCH-03 delta grill-me", () => {
  let tmp: string;
  let db: StateDb;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-orch03-"));
    db = new StateDb(path.join(tmp, "state.db"));
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("versions v1→v2 immutably, cancels obsolete tasks via SIGTERM mock, marks evidence STALE", () => {
    const v1 = contract(1, { criteriaIds: ["c1", "c2"] });
    db.saveGoalContract(v1, { validated: true });
    db.upsertTaskGraphNode({
      work_id: "work-delta",
      task_id: "task-c2",
      state: "IN_PROGRESS",
      payload: { criterion_id: "c2" },
    });
    db.upsertTaskGraphNode({
      work_id: "work-delta",
      task_id: "task-c1",
      state: "IN_PROGRESS",
      payload: { criterion_id: "c1" },
    });
    db.upsertEvidenceRecord({
      evidence_id: "ev-old",
      work_id: "work-delta",
      task_id: "task-c2",
      goal_contract_id: "gc-delta",
      goal_contract_version: 1,
      status: "VALID",
      kind: "test_result",
    });

    const killed: Array<{ pid: number; signal?: NodeJS.Signals }> = [];
    const v2 = contract(2, { criteriaIds: ["c1"], objective: "narrowed objective" });

    const result = applyDeltaGrillMe({
      db,
      previous: v1,
      next: v2,
      obsolete_task_ids: ["task-c2"],
      running: [{ task_id: "task-c2", pid: 424242, work_id: "work-delta" }],
      killFn: (pid, signal) => {
        killed.push({ pid, signal });
        return true;
      },
    });

    expect(result.from_version).toBe(1);
    expect(result.to_version).toBe(2);
    expect(result.obsolete_task_ids).toEqual(["task-c2"]);
    expect(killed).toEqual([{ pid: 424242, signal: "SIGTERM" }]);
    expect(result.signalled[0]?.signalled).toBe(true);

    const loaded = db.loadLatestGoalContract("gc-delta");
    expect(loaded?.version).toBe(2);
    // v1 still present (immutable versioning)
    const v1row = db.queryOne<{ version: number }>(
      `SELECT version FROM goal_contracts WHERE goal_contract_id = ? AND version = 1`,
      "gc-delta",
    );
    expect(v1row?.version).toBe(1);

    const nodes = db.listTaskGraphNodes("work-delta");
    expect(nodes.find((n) => n.task_id === "task-c2")?.state).toBe("CANCELLED");

    expect(result.stale_evidence_ids).toContain("ev-old");
    expect(listStaleEvidence(db, "work-delta").map((e) => e.evidence_id)).toContain("ev-old");
  });
});
