/**
 * V3 finalization — multi-repo evaluation battery (≥3 repos, ≥10 tasks).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { runEvaluationBattery } from "../../src/v3/evaluation/index.js";
import { runEngineeringFailureBattery } from "../../src/v3/failure-injection/index.js";
import { exploreRepository } from "../../src/v3/evaluation/explore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

describe("V3 evaluation battery", () => {
  let tmp: string;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v3-eval-"));
  });

  afterAll(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it("explores unknown fixture repos", () => {
    const alpha = exploreRepository(path.join(repoRoot, "orchestrator/tests/fixtures/v3-eval/alpha-lib"));
    expect(alpha.languages).toContain("javascript");
    expect(alpha.test_files.length).toBeGreaterThan(0);
    expect(alpha.entrypoints.length).toBeGreaterThan(0);
  });

  it("runs 10 tasks across 3 repos with verified pass + recovery", () => {
    const paths = resolveV3DataPaths(path.join(tmp, "data"));
    const report = runEvaluationBattery({
      repoRoot,
      paths,
      recovery_task_id: "T04",
      keep_workspaces: false,
    });

    const failedTasks = report.results.filter((r) => !r.true_full_pass);
    expect(
      failedTasks.map((r) => ({
        id: r.task_id,
        reasons: r.reasons,
        post: r.post_exit,
        files: r.files_changed,
      })),
    ).toEqual([]);
    expect(report.repo_count).toBeGreaterThanOrEqual(3);
    expect(report.task_count).toBeGreaterThanOrEqual(10);
    expect(report.passed).toBe(true);
    expect(report.aggregates.verified_completion_rate).toBe(1);
    expect(report.aggregates.multi_file_tasks).toBeGreaterThanOrEqual(5);
    expect(report.results.every((r) => r.baseline_tests_pass)).toBe(true);
    expect(report.results.every((r) => r.post_tests_pass)).toBe(true);
    expect(report.results.every((r) => r.implementer_agent_id !== r.reviewer_agent_id)).toBe(true);
    const recovered = report.results.find((r) => r.task_id === "T04");
    expect(recovered?.recovery_used).toBe(true);
    const held = report.results.filter((r) => r.split === "held_out");
    expect(held.length).toBe(2);
    expect(held.every((r) => r.true_full_pass)).toBe(true);
    expect(report.aggregates.cost_per_verified_completion).not.toBeNull();
  }, 120_000);

  it("engineering failure battery passes", () => {
    const paths = resolveV3DataPaths(path.join(tmp, "fail-data"));
    const report = runEngineeringFailureBattery(paths, path.join(tmp, "fail-ws"));
    const failed = report.scenarios.filter((s) => !s.passed);
    expect(failed).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.scenarios.length).toBeGreaterThanOrEqual(8);
  }, 60_000);
});
