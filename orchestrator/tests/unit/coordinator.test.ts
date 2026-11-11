import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";

describe("CoordinatorService", () => {
  let tmp: string;
  let service: CoordinatorService;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "coord-"));
    const paths = resolveV3DataPaths(tmp);
    service = new CoordinatorService(paths);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-1",
      objective: "demo",
      criteria: [
        {
          id: "c1",
          description: "done",
          mandatory: true,
          verification: [{ id: "v1", kind: "test", description: "t" }],
          evidence_required: ["e1"],
        },
      ],
    });
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("persists work across start/stop and tick without claiming power-off continuity", () => {
    service.start();
    service.registerWork("work-1", "gc-1", 1);
    const status = service.status();
    expect(status.coordinator.process_state).toBe("running");
    expect(status.limitation).toMatch(/machine is off/i);

    service.stop("test");
    expect(service.loadState().process_state).toBe("stopped");

    // State survives "TUI close" (stop); tick still works for resume inspection
    const tick = service.tick("work-1");
    expect(tick.work_id).toBe("work-1");
    expect(tick.true_full_pass_eligible).toBe(false);
    expect(tick.work_state).toBe("IN_PROGRESS");
  });

  it("reaches TRUE_FULL_PASS only after criterion evidence", () => {
    service.registerWork("work-2", "gc-1", 1);
    expect(service.tick("work-2").true_full_pass_eligible).toBe(false);

    const goals = new GoalContractStore(resolveV3DataPaths(tmp).goalContractsDir);
    goals.updateCriterionState("gc-1", "c1", "PASS", ["e1"]);
    const tick = service.tick("work-2");
    expect(tick.true_full_pass_eligible).toBe(true);
    expect(tick.work_state).toBe("TRUE_FULL_PASS");
  });
});
