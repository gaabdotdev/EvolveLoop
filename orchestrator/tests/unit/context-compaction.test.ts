import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { CoordinatorService } from "../../src/v3/coordinator/service.js";
import { buildContextView } from "../../src/v3/context/views.js";
import { compactContextView, reinjectCompactedView } from "../../src/v3/context/compaction.js";

describe("Context View compaction", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "cmp-"));
    const paths = resolveV3DataPaths(tmp);
    new GoalContractStore(paths.goalContractsDir).create({
      goal_contract_id: "gc-cmp",
      objective: "compact",
      criteria: [
        {
          id: "c-pass",
          description: "must keep criterion",
          mandatory: true,
          verification: [{ id: "v1", kind: "manual", description: "m" }],
          evidence_required: ["e1"],
        },
      ],
    });
    new CoordinatorService(paths).registerWork("w-cmp", "gc-cmp", 1);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("preserves anchors and allows reinject only on fidelity PASS", () => {
    const paths = resolveV3DataPaths(tmp);
    const view = buildContextView(paths, { work_id: "w-cmp", role: "master" });
    const compacted = compactContextView(view);
    expect(compacted.kind).toBe("CompactedContextView");
    expect(compacted.must_keep).toContain("gc-cmp");
    expect(compacted.must_keep).toContain("c-pass");
    expect(compacted.fidelity_status).toBe("PASS");
    expect(compacted.reinject_allowed).toBe(true);
    expect(compacted.lines_after).toBeLessThanOrEqual(compacted.lines_before);

    const reinject = reinjectCompactedView(compacted);
    expect(reinject.allowed).toBe(true);
    expect(reinject.working_context).toContain("gc-cmp");
  });

  it("denies reinject when fidelity fails", () => {
    const paths = resolveV3DataPaths(tmp);
    const view = buildContextView(paths, { work_id: "w-cmp", role: "master" });
    const compacted = compactContextView(view);
    const forced = {
      ...compacted,
      fidelity_status: "FAIL" as const,
      reinject_allowed: false,
      missing_must_keep: ["forced-missing"],
      fidelity: 0,
    };
    const reinject = reinjectCompactedView(forced);
    expect(reinject.allowed).toBe(false);
    expect(reinject.reason).toMatch(/fidelity_fail/i);
  });
});
