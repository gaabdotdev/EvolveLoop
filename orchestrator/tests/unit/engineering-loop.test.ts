import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { EngineeringLoopService } from "../../src/v3/engineering/index.js";
import { buildHarnessMatrix } from "../../src/v3/engineering/harness-matrix.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";

describe("V3.4 Engineering Loop", () => {
  let tmp: string;
  let workspace: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "eng-"));
    workspace = path.join(tmp, "ws");
    await fs.mkdir(workspace, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("runs intake→plan→implement→fail test→fix→review→TRUE_FULL_PASS with real files", () => {
    const paths = resolveV3DataPaths(path.join(tmp, "data"));
    const result = new EngineeringLoopService(paths).run({
      work_id: "w-eng",
      workspace_root: workspace,
      objective: "Implement add(a,b) correctly",
      domain: "backend",
    });

    expect(result.true_full_pass).toBe(true);
    expect(result.review_passed).toBe(true);
    expect(result.test_exit_code).toBe(0);
    expect(result.run.replan_count).toBeGreaterThanOrEqual(1);
    expect(result.workspace_changes.some((p) => p.includes("solution"))).toBe(true);

    const evaluation = new GoalContractStore(paths.goalContractsDir).evaluate(
      result.run.goal_contract_id,
    );
    expect(evaluation.eligible).toBe(true);
    expect(evaluation.work_state).toBe("TRUE_FULL_PASS");
  });

  it("harness matrix never marks dry-run as SUPPORTED", () => {
    const matrix = buildHarnessMatrix();
    expect(matrix).toHaveLength(4);
    for (const entry of matrix) {
      if (entry.class === "DRY_RUN") {
        expect(entry.class).not.toBe("SUPPORTED");
      }
      expect(["SUPPORTED", "PARTIAL", "PROBE_ONLY", "DRY_RUN", "BLOCKED", "UNSUPPORTED"]).toContain(
        entry.class,
      );
    }
    expect(matrix.find((m) => m.adapter_id === "cursor")?.class).toBe("PARTIAL");
  });
});
