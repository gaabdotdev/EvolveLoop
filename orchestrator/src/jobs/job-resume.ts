import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Evidence, ExecuteResult, GraphNode } from "../types/index.js";
import type { SkillJob, SkillJobResult } from "./job-store.js";

export function loadEvidenceFile(path: string): Evidence {
  const abs = resolve(path);
  if (!existsSync(abs)) {
    throw new Error(`Evidence file not found: ${abs}`);
  }
  const content = readFileSync(abs, "utf-8");
  return JSON.parse(content) as Evidence;
}

export function jobResultToExecuteResult(
  job: SkillJob,
  result: SkillJobResult,
  _node?: GraphNode,
): ExecuteResult {
  if (!result.success) {
    return {
      run_id: job.run_id,
      success: false,
      status: "failed",
      verdict: "rejected",
      provider_id: job.provider_id,
      duration_ms: 0,
      error: { code: "JOB_FAILED", message: result.error ?? "External job failed" },
    };
  }

  if (!result.evidence_path) {
    return {
      run_id: job.run_id,
      success: false,
      status: "failed",
      verdict: "rejected",
      provider_id: job.provider_id,
      duration_ms: 0,
      error: {
        code: "EVIDENCE_MISSING_OR_CORRUPT",
        message: "Evidence file path is missing from successful job result",
      },
    };
  }

  let evidence: Evidence;
  try {
    evidence = loadEvidenceFile(result.evidence_path);
  } catch (err) {
    return {
      run_id: job.run_id,
      success: false,
      status: "failed",
      verdict: "rejected",
      provider_id: job.provider_id,
      duration_ms: 0,
      error: {
        code: "EVIDENCE_MISSING_OR_CORRUPT",
        message: err instanceof Error ? err.message : `Evidence file at ${result.evidence_path} is missing or invalid`,
      },
    };
  }

  return {
    run_id: job.run_id,
    success: true,
    status: "completed",
    verdict: "passed",
    provider_id: job.provider_id,
    duration_ms: 0,
    evidence,
  };
}
