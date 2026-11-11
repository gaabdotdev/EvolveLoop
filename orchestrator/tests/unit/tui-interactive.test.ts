import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { runInteractiveTui } from "../../src/v3/tui/interactive.js";

describe("Interactive TUI", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tui-i-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("runs scripted commands without claiming supervisor ownership", async () => {
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-i",
      objective: "interactive",
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
    new CoordinatorService(paths).registerWork("w-i", "gc-i", 1);

    const { lines } = await runInteractiveTui({
      paths,
      workId: "w-i",
      inputLines: ["status", "detail", "context master", "route", "stuck", "budgets", "quit"],
      output: () => {},
    });

    const joined = lines.join("\n");
    expect(joined).toMatch(/Status Board|work w-i/i);
    expect(joined).toMatch(/ContextView|goal_contract|disposable/);
    expect(joined).toMatch(/RouteDecision|selected|candidates/);
    expect(joined).toMatch(/StuckDetectionReport|BudgetReport/);
    expect(joined).toMatch(/bye — supervised/);
  });
});
