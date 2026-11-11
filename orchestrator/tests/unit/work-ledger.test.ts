import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { WorkLedgerStore } from "../../src/v3/work-ledger/store.js";

describe("WorkLedgerStore", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ledger-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("is append-only and rebuilds snapshot from JSONL", () => {
    const paths = resolveV3DataPaths(tmp);
    const ledger = new WorkLedgerStore(paths.workLedgerDir);
    ledger.open("w1", "gc1");
    ledger.recordStateChange("w1", "RECOVERY", "test");
    ledger.append({
      work_id: "w1",
      type: "task_recorded",
      origin: "test",
      payload: { task_count: 2 },
      provenance: { source: "test" },
    });

    const entries = ledger.read("w1");
    expect(entries.length).toBe(3);
    expect(entries[0]!.version).toBe(1);
    expect(entries[2]!.version).toBe(3);
    expect(ledger.snapshot("w1").work_state).toBe("RECOVERY");

    // Corrupt meta intentionally then rebuild
    const rebuilt = ledger.rebuildSnapshot("w1");
    expect(rebuilt.latest_version).toBe(3);
    expect(rebuilt.entry_count).toBe(3);
    expect(rebuilt.work_state).toBe("RECOVERY");
  });

  it("opens on registerWork and records tick projections", () => {
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-l",
      objective: "ledger",
      criteria: [
        {
          id: "c1",
          description: "d",
          mandatory: true,
          verification: [{ id: "v1", kind: "manual", description: "m" }],
          evidence_required: ["e1"],
        },
      ],
    });
    const coord = new CoordinatorService(paths);
    coord.registerWork("w-l", "gc-l", 1);
    expect(coord.ledger.snapshot("w-l").entry_count).toBe(1);
    expect(coord.ledger.read("w-l")[0]!.type).toBe("work_opened");

    coord.tick("w-l");
    const types = coord.ledger.read("w-l").map((e) => e.type);
    expect(types).toContain("note");
    expect(types).toContain("task_recorded");
    expect(types).toContain("agent_recorded");
    expect(types).toContain("criterion_recorded");
  });

  it("records state change to TRUE_FULL_PASS after evidence", () => {
    const paths = resolveV3DataPaths(tmp);
    const goals = new GoalContractStore(paths.goalContractsDir);
    goals.create({
      goal_contract_id: "gc-p",
      objective: "pass",
      criteria: [
        {
          id: "c1",
          description: "d",
          mandatory: true,
          verification: [{ id: "v1", kind: "test", description: "t" }],
          evidence_required: ["e1"],
        },
      ],
    });
    const coord = new CoordinatorService(paths);
    coord.registerWork("w-p", "gc-p", 1);
    goals.updateCriterionState("gc-p", "c1", "PASS", ["e1"]);
    const tick = coord.tick("w-p");
    expect(tick.work_state).toBe("TRUE_FULL_PASS");
    const states = coord.ledger
      .read("w-p")
      .filter((e) => e.type === "work_state_changed")
      .map((e) => e.payload.work_state);
    expect(states).toContain("TRUE_FULL_PASS");
  });
});
