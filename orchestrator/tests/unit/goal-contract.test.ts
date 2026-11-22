import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  GoalContractStore,
  GoalContractError,
  evaluateTrueFullPass,
} from "../../src/v3/goal-contract/index.js";

describe("GoalContractStore (V3.0)", () => {
  let tmp: string;
  let store: GoalContractStore;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "goal-contract-"));
    store = new GoalContractStore(tmp);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("creates versioned contract and refuses overwrite", () => {
    const c = store.create({
      goal_contract_id: "gc-1",
      objective: "Ship path hardening",
      criteria: [
        {
          id: "c1",
          description: "symlink escape denied",
          mandatory: true,
          verification: [{ id: "v1", kind: "test", description: "unit" }],
          evidence_required: ["test-report"],
        },
      ],
    });
    expect(c.version).toBe(1);
    expect(store.loadLatest("gc-1").objective).toBe("Ship path hardening");
    expect(() =>
      store.create({
        goal_contract_id: "gc-1",
        objective: "dup",
        criteria: [],
      }),
    ).toThrow(GoalContractError);
  });

  it("revises without deleting prior version file", async () => {
    store.create({
      goal_contract_id: "gc-2",
      objective: "v1",
      criteria: [
        {
          id: "c1",
          description: "x",
          mandatory: true,
          verification: [{ id: "v1", kind: "test", description: "t" }],
          evidence_required: [],
        },
      ],
    });
    const v2 = store.revise("gc-2", { objective: "v2" });
    expect(v2.version).toBe(2);
    expect(v2.supersedes_version).toBe(1);
    expect(store.loadVersion("gc-2", 1).objective).toBe("v1");
    expect(store.loadLatest("gc-2").objective).toBe("v2");
    await expect(fs.access(path.join(tmp, "gc-2", "v1.json"))).resolves.toBeUndefined();
  });

  it("does not grant TRUE_FULL_PASS without mandatory PASS + evidence", () => {
    store.create({
      goal_contract_id: "gc-3",
      objective: "obj",
      criteria: [
        {
          id: "c1",
          description: "must pass",
          mandatory: true,
          verification: [{ id: "v1", kind: "test", description: "t" }],
          evidence_required: ["e1"],
        },
      ],
    });
    const before = store.evaluate("gc-3");
    expect(before.eligible).toBe(false);
    expect(before.work_state).toBe("NOT_PASS");

    store.updateCriterionState("gc-3", "c1", "PASS", ["e1"]);
    const after = store.evaluate("gc-3");
    expect(after.eligible).toBe(true);
    expect(after.work_state).toBe("TRUE_FULL_PASS");
  });

  it("evaluateTrueFullPass rejects agent-style incomplete states", () => {
    const result = evaluateTrueFullPass({
      kind: "GoalContract",
      goal_contract_id: "x",
      version: 1,
      created_at: "",
      updated_at: "",
      objective: "o",
      scope: [],
      out_of_scope: [],
      functional_requirements: [],
      non_functional_requirements: [],
      constraints: [],
      dependencies: [],
      risks: [],
      criteria: [
        {
          id: "c1",
          description: "d",
          mandatory: true,
          verification: [],
          evidence_required: [],
          state: "IN_PROGRESS",
          evidence_ids: [],
          updated_at: "",
        },
      ],
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("mandatory_incomplete"))).toBe(true);
  });
});
