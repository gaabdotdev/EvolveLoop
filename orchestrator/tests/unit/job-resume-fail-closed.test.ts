import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { jobResultToExecuteResult, loadEvidenceFile } from "../../src/jobs/job-resume.js";
import type { SkillJob, SkillJobResult } from "../../src/jobs/job-store.js";
import type { Evidence, GraphNode } from "../../src/types/index.js";

function makeJob(runId = "run-test"): SkillJob {
  return {
    run_id: runId,
    feature_id: "feat-test",
    node_id: "node-1",
    provider_id: "test-provider",
    manifest: {
      apiVersion: "capability-orchestrator.io/v2",
      kind: "SkillPluginManifest",
      metadata: { name: "test-plugin", version: "1.0.0" },
      spec: {
        plugin: { type: "cursor-skill" },
        capabilities: { "test.action": { default_risk: "low" } },
      },
    },
    briefing: "Execute test task",
    memory_scope: "feat-test",
    knowledge_hits: [],
    inputs: [],
    definition_of_done: [{ id: "dod-1", check: "must pass", verification: "automated" }],
    policy: { retries_remaining: 1 },
    status: "dispatched",
    created_at: new Date().toISOString(),
  };
}

function makeNode(): GraphNode {
  return {
    id: "node-1",
    capability: "test.action",
    type: "worker",
    dependencies: [],
    definition_of_done: [{ id: "dod-1", check: "must pass", verification: "automated" }],
    status: "waiting",
    retry_count: 0,
  };
}

function validEvidence(runId = "run-test"): Evidence {
  return {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "Evidence",
    metadata: {
      node_id: "node-1",
      run_id: runId,
      emitter: "worker",
      provider_id: "test-provider",
      capability: "test.action",
      submitted_at: new Date().toISOString(),
    },
    spec: {
      status: "complete",
      confidence: 0.95,
      coverage: 1.0,
      assumptions: [],
      known_gaps: [],
      verdict: null,
      checks: [
        {
          dod_id: "dod-1",
          result: "pass",
          verification: "automated",
          details: "Verified via physical artifact",
        },
      ],
      payload: {
        type: "worker",
        artifacts: [{ id: "art-1", path: "/tmp/out.txt", sha256: "abc" }],
        checks: [],
        side_effects: { files_created: ["/tmp/out.txt"], files_modified: [], commands_run: [] },
      },
    },
  };
}

describe("TASK-P0-05: jobResultToExecuteResult fail-closed behavior", () => {
  it("fails explicitly when external job result has success: false", () => {
    const job = makeJob();
    const node = makeNode();
    const result: SkillJobResult = {
      run_id: job.run_id,
      success: false,
      error: "Worker process exited with code 1",
    };

    const execResult = jobResultToExecuteResult(job, result, node);
    expect(execResult.success).toBe(false);
    expect(execResult.status).toBe("failed");
    expect(execResult.verdict).toBe("rejected");
    expect(execResult.error?.code).toBe("JOB_FAILED");
    expect(execResult.error?.message).toContain("Worker process exited with code 1");
    expect(execResult.evidence).toBeUndefined();
  });

  it("fails closed when success: true but evidence_path is absent (never fabricates virtual claims)", () => {
    const job = makeJob();
    const node = makeNode();
    const result: SkillJobResult = {
      run_id: job.run_id,
      success: true,
      // evidence_path omitted
    };

    const execResult = jobResultToExecuteResult(job, result, node);
    expect(execResult.success).toBe(false);
    expect(execResult.status).toBe("failed");
    expect(execResult.verdict).toBe("rejected");
    expect(execResult.error?.code).toBe("EVIDENCE_MISSING_OR_CORRUPT");
    expect(execResult.evidence).toBeUndefined();
  });

  it("fails closed when evidence_path points to non-existent file on disk", () => {
    const job = makeJob();
    const node = makeNode();
    const nonExistentPath = join(tmpdir(), `non-existent-evidence-${Date.now()}.json`);
    const result: SkillJobResult = {
      run_id: job.run_id,
      success: true,
      evidence_path: nonExistentPath,
    };

    const execResult = jobResultToExecuteResult(job, result, node);
    expect(execResult.success).toBe(false);
    expect(execResult.status).toBe("failed");
    expect(execResult.verdict).toBe("rejected");
    expect(execResult.error?.code).toBe("EVIDENCE_MISSING_OR_CORRUPT");
    expect(execResult.error?.message).toContain("Evidence file not found");
    expect(execResult.evidence).toBeUndefined();
  });

  it("fails closed when evidence file is corrupted or truncated JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "corrupt-evidence-"));
    const corruptPath = join(dir, "evidence.json");
    writeFileSync(corruptPath, '{"apiVersion": "capability-orchestrator.io/v2", "kind": "Evid');

    const job = makeJob();
    const node = makeNode();
    const result: SkillJobResult = {
      run_id: job.run_id,
      success: true,
      evidence_path: corruptPath,
    };

    const execResult = jobResultToExecuteResult(job, result, node);
    expect(execResult.success).toBe(false);
    expect(execResult.status).toBe("failed");
    expect(execResult.verdict).toBe("rejected");
    expect(execResult.error?.code).toBe("EVIDENCE_MISSING_OR_CORRUPT");
    expect(execResult.evidence).toBeUndefined();
  });

  it("succeeds and preserves real evidence when evidence file is intact and valid", () => {
    const dir = mkdtempSync(join(tmpdir(), "valid-evidence-"));
    const validPath = join(dir, "evidence.json");
    const originalEvidence = validEvidence("run-ok");
    writeFileSync(validPath, JSON.stringify(originalEvidence, null, 2));

    const job = makeJob("run-ok");
    const node = makeNode();
    const result: SkillJobResult = {
      run_id: job.run_id,
      success: true,
      evidence_path: validPath,
    };

    const execResult = jobResultToExecuteResult(job, result, node);
    expect(execResult.success).toBe(true);
    expect(execResult.status).toBe("completed");
    expect(execResult.verdict).toBe("passed");
    expect(execResult.evidence).toEqual(originalEvidence);
    expect(execResult.error).toBeUndefined();
  });

  it("loadEvidenceFile throws informative errors on missing or invalid files", () => {
    expect(() => loadEvidenceFile("/path/to/missing/file.json")).toThrow(
      "Evidence file not found",
    );

    const dir = mkdtempSync(join(tmpdir(), "invalid-json-"));
    const badJsonPath = join(dir, "bad.json");
    writeFileSync(badJsonPath, "{not-json");
    expect(() => loadEvidenceFile(badJsonPath)).toThrow();
  });
});
