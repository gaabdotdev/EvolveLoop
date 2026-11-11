/**
 * V3.4 E2E: real workspace mutations + Engineering Loop → TRUE_FULL_PASS.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evolveCli = path.join(__dirname, "../../dist/cli/evolve.js");

function evolve(args: string[], dataDir: string): unknown {
  const out = execFileSync(process.execPath, [evolveCli, ...args, "--data-dir", dataDir], {
    encoding: "utf-8",
    env: { ...process.env, EVOLVELOOP_HARNESS_CONSENT: "false" },
  });
  return JSON.parse(out);
}

describe("V3.4 engineering loop E2E", () => {
  let tmp: string;
  let workspace: string;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v34e2e-"));
    workspace = path.join(tmp, "project");
    await fs.mkdir(workspace, { recursive: true });
  });

  afterAll(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it("CLI engineering run produces files, passes tests, review, TRUE_FULL_PASS", async () => {
    const dataDir = path.join(tmp, "data");
    const result = evolve(
      [
        "engineering",
        "run",
        "--work-id",
        "w-v34",
        "--workspace",
        workspace,
        "--objective",
        "Ship correct add()",
        "--domain",
        "backend",
      ],
      dataDir,
    ) as {
      true_full_pass: boolean;
      review_passed: boolean;
      test_exit_code: number;
      workspace_changes: string[];
      run: { run_id: string; replan_count: number; stages: Array<{ stage_id: string; status: string }> };
    };

    expect(result.true_full_pass).toBe(true);
    expect(result.review_passed).toBe(true);
    expect(result.test_exit_code).toBe(0);
    expect(result.run.replan_count).toBeGreaterThanOrEqual(1);

    const solution = await fs.readFile(path.join(workspace, "src/solution.js"), "utf-8");
    expect(solution).toContain("return a + b");
    expect(solution).not.toContain("return a - b");

    const review = await fs.readFile(path.join(workspace, ".evolveloop/review-report.md"), "utf-8");
    expect(review).toMatch(/verdict: PASS/);

    const stageIds = result.run.stages.map((s) => s.stage_id);
    for (const required of ["CONTRACT", "PLAN", "IMPLEMENT", "TEST", "FIX", "REVIEW", "VERIFY"]) {
      expect(stageIds).toContain(required);
    }

    const matrix = evolve(["harness", "matrix"], dataDir) as {
      adapters: Array<{ adapter_id: string; class: string }>;
    };
    expect(matrix.adapters).toHaveLength(4);
    // No adapter is falsely marked SUPPORTED without verified live harness control
    expect(matrix.adapters.filter((a) => a.class === "SUPPORTED")).toEqual([]);
  });
});

