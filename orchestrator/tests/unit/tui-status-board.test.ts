import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { buildStatusBoard, renderStatusBoardText } from "../../src/v3/tui/status-board.js";

describe("TUI status board", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tui-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("renders works/agents/adapters without claiming OS daemon", () => {
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-t",
      objective: "tui",
      criteria: [
        {
          id: "c1",
          description: "d",
          mandatory: true,
          verification: [{ id: "v1", kind: "manual", description: "m" }],
          evidence_required: ["e"],
        },
      ],
    });
    const coord = new CoordinatorService(paths);
    coord.registerWork("w-t", "gc-t", 1);
    coord.tick("w-t");

    const snap = buildStatusBoard(paths);
    expect(snap.kind).toBe("StatusBoardSnapshot");
    expect(snap.works).toHaveLength(1);
    expect(snap.works[0]!.work_id).toBe("w-t");
    expect(snap.works[0]!.ledger?.entry_count).toBeGreaterThan(0);
    expect(snap.adapters_summary).toHaveLength(4);
    expect(snap.limitation).toMatch(/machine is off/i);

    const text = renderStatusBoardText(snap);
    expect(text).toContain("work w-t");
    expect(text).toContain("adapters:");
    expect(text).toContain("cursor");
  });
});
