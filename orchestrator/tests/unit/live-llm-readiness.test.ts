import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import {
  probeLiveLlmReadiness,
  runLiveEngineeringCase,
  runLiveValidationSuite,
} from "../../src/v3/evaluation/live/index.js";
import { buildReviewerPrompt, buildWorkerPrompt, LIVE_TASK_BRIEFS } from "../../src/v3/evaluation/live/prompts.js";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");

describe("Live LLM path (consent-aware)", () => {
  it("probes readiness without inventing consent or keys", () => {
    const prev = process.env.EVOLVELOOP_HARNESS_CONSENT;
    delete process.env.EVOLVELOOP_HARNESS_CONSENT;
    const r = probeLiveLlmReadiness();
    expect(r.kind).toBe("LiveLlmReadiness");
    expect(r.consent).toBe(false);
    expect(r.blockers.some((b) => b.includes("EVOLVELOOP_HARNESS_CONSENT"))).toBe(true);
    expect(r.state === "BLOCKED" || r.state === "PARTIAL").toBe(true);
    if (prev !== undefined) process.env.EVOLVELOOP_HARNESS_CONSENT = prev;
  });

  it("worker/reviewer prompts do not embed solver solutions", () => {
    const w = buildWorkerPrompt(LIVE_TASK_BRIEFS.T01, "/tmp/ws");
    const r = buildReviewerPrompt({
      objective: LIVE_TASK_BRIEFS.T01.objective,
      acceptance: LIVE_TASK_BRIEFS.T01.acceptance,
      diffSummary: "src/math.js",
      testSummary: "exit=1",
      implementerClaim: "done",
    });
    expect(w).not.toMatch(/if \(n < min\)/);
    expect(w).not.toMatch(/DETERMINISTIC_SOLVER/);
    expect(r).toMatch(/Do NOT trust/);
    expect(r).toMatch(/untrusted/i);
  });

  it("live case records BLOCKED dry plumbing without claiming TRUE_FULL_PASS", () => {
    const tmp = mkdtempSync(join(tmpdir(), "live-llm-"));
    try {
      delete process.env.EVOLVELOOP_HARNESS_CONSENT;
      const paths = resolveV3DataPaths(join(tmp, "data"));
      const result = runLiveEngineeringCase({
        repoRoot,
        paths,
        fixtureRel: "orchestrator/tests/fixtures/v3-eval/alpha-lib",
        taskId: "T01",
        strategy: "A_single_agent",
      });
      expect(result.mode === "BLOCKED" || result.mode === "DRY_PLUMBING").toBe(true);
      expect(result.true_full_pass).toBe(false);
      expect(result.limitations.some((l) => l.includes("LIVE_LLM_NOT_EXECUTED") || l.includes("consent"))).toBe(
        true,
      );
      expect(result.review.session_separated).toBe(true);
      expect(result.review.independent).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("live suite with recovery injection stays BLOCKED without live auth", () => {
    const tmp = mkdtempSync(join(tmpdir(), "live-suite-"));
    try {
      delete process.env.EVOLVELOOP_HARNESS_CONSENT;
      const paths = resolveV3DataPaths(join(tmp, "data"));
      const report = runLiveValidationSuite({ repoRoot, paths });
      expect(report.gate_l_state).toBe("BLOCKED");
      expect(report.results.length).toBe(3);
      expect(report.results.some((r) => r.recovery?.used)).toBe(true);
      expect(report.results.every((r) => r.true_full_pass === false)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
