import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { buildContextView } from "../../src/v3/context/views.js";
import { measureCompactionSavings } from "../../src/v3/context/savings.js";

describe("Compaction savings", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sav-"));
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-sav",
      objective: "savings",
      criteria: [
        {
          id: "c-sav",
          description: "keep",
          mandatory: true,
          verification: [{ id: "v1", kind: "manual", description: "m" }],
          evidence_required: ["e"],
        },
      ],
    });
    new CoordinatorService(paths).registerWork("w-sav", "gc-sav", 1);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("reports line metrics and never invents token status", () => {
    const paths = resolveV3DataPaths(tmp);
    const view = buildContextView(paths, { work_id: "w-sav", role: "master" });
    const report = measureCompactionSavings(view);
    expect(report.kind).toBe("CompactionSavingsReport");
    expect(report.fidelity_status).toBe("PASS");
    expect(report.lines_before).toBeGreaterThan(0);
    expect(["PASS", "LIMITED", "NOT_MEASURED"]).toContain(report.savings_status);
    expect(["MEASURED", "PROXY", "UNAVAILABLE"]).toContain(report.tokenizer_status);
    if (report.tokenizer_status === "UNAVAILABLE") {
      expect(report.tokens_before).toBe("NOT_MEASURED");
    }
    expect(report.limitations.some((l) => /never invented|not invented/i.test(l))).toBe(true);
  });
});
