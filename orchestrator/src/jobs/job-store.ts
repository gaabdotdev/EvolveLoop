import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import {
  copySanitizedEvidenceToJobsDir,
  relativeJobsEvidencePath,
} from "../evidence/evidence-bus.js";
import {
  API_VERSION,
  ALG,
  CANONICAL,
  ENVELOPE_VERSION,
  CheckpointError,
  macHex,
  macsMatch,
  refuseSymlink,
  resolveKey,
  isRecord,
} from "./checkpoint.js";

import type { GateBundleFields, ContextRetrievalEntry } from "../context/types.js";

export interface SkillJob {
  apiVersion: string;
  kind: "SkillJob";
  run_id: string;
  provider_id: string;
  skill_path: string;
  capability: string;
  node_id: string;
  briefing: string;
  definition_of_done: unknown[];
  inputs: unknown[];
  status: "pending" | "completed" | "failed";
  /** PDA spawn — ADR-0013 / V22-GOAL-006 */
  feature_id?: string;
  gate_bundle?: GateBundleFields;
  context_retrieval?: ContextRetrievalEntry[];
  evidence_paths?: string[];
  spawn_metadata?: Record<string, unknown>;
}

export interface SkillJobResult {
  run_id: string;
  success: boolean;
  evidence_path?: string;
  error?: string;
  completed_at: string;
}

export const ENVELOPE_KIND_JOB = "JobEnvelope";
export const ENVELOPE_KIND_RESULT = "JobResultEnvelope";

export interface JobEnvelope<T> {
  apiVersion: typeof API_VERSION;
  kind: string;
  envelope_version: typeof ENVELOPE_VERSION;
  alg: typeof ALG;
  canonical: typeof CANONICAL;
  payload: T;
  mac: string;
}

export function assertRunId(runId: string): void {
  if (
    !runId ||
    runId.length === 0 ||
    runId.includes("/") ||
    runId.includes("\\") ||
    runId.includes("..") ||
    runId.includes("\0")
  ) {
    throw new CheckpointError("JOB_PATH_DENIED", "run_id is not a safe job name");
  }
}

function jobFilePath(jobsDir: string, filename: string): string {
  const dir = resolve(jobsDir);
  const path = join(dir, filename);
  const root = dir.endsWith(sep) ? dir : dir + sep;
  if (!path.startsWith(root)) {
    throw new CheckpointError("JOB_PATH_DENIED", "job path escapes the jobs directory");
  }
  return path;
}

export class JobStore {
  constructor(private jobsDir: string) {}

  listPending(options?: { key?: Buffer }): SkillJob[] {
    if (!existsSync(this.jobsDir)) return [];
    return readdirSync(this.jobsDir)
      // Job artifacts only: `{run_id}.json`. Sibling sidecars
      // (`*.result.json`, `*.evidence.json`) live in the same directory but are
      // not JobEnvelopes — reading them as jobs yields SIGNATURE_ABSENT.
      .filter(
        (f) =>
          f.endsWith(".json") &&
          !f.endsWith(".result.json") &&
          !f.endsWith(".evidence.json") &&
          !f.startsWith("."),
      )
      .map((f) => this.readJob(f.replace(/\.json$/, ""), options))
      .filter((j): j is SkillJob => j !== null && j.status === "pending");
  }

  readJob(runId: string, options?: { key?: Buffer }): SkillJob | null {
    assertRunId(runId);
    const path = jobFilePath(this.jobsDir, `${runId}.json`);
    if (!existsSync(path)) return null;
    refuseSymlink(path);
    const text = readFileSync(path, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new CheckpointError("CORRUPT", "job JSON is truncated or invalid");
    }
    if (!isRecord(parsed)) {
      throw new CheckpointError("CORRUPT", "job JSON is not an object");
    }
    if (parsed.kind === "SkillJob" || typeof parsed.mac !== "string") {
      throw new CheckpointError("SIGNATURE_ABSENT", "job has no integrity envelope");
    }
    if (parsed.kind !== ENVELOPE_KIND_JOB && parsed.kind !== "SkillJobEnvelope") {
      throw new CheckpointError("UNSUPPORTED_INTEGRITY", "job integrity envelope is not supported");
    }
    if (
      parsed.envelope_version !== ENVELOPE_VERSION ||
      parsed.alg !== ALG ||
      parsed.canonical !== CANONICAL ||
      parsed.apiVersion !== API_VERSION
    ) {
      throw new CheckpointError("UNSUPPORTED_INTEGRITY", "job integrity envelope is not supported");
    }
    if (!isRecord(parsed.payload)) {
      throw new CheckpointError("CORRUPT", "job payload is not an object");
    }
    const key = resolveKey(options?.key);
    const expected = macHex(key, parsed.payload);
    if (!macsMatch(expected, parsed.mac)) {
      throw new CheckpointError("SIGNATURE_INVALID", "job MAC does not match the payload");
    }
    return parsed.payload as unknown as SkillJob;
  }

  writeJob(job: SkillJob, options?: { key?: Buffer }): string {
    assertRunId(job.run_id);
    const key = resolveKey(options?.key);
    const path = jobFilePath(this.jobsDir, `${job.run_id}.json`);
    refuseSymlink(path);
    mkdirSync(this.jobsDir, { recursive: true, mode: 0o700 });
    const payload = JSON.parse(JSON.stringify(job)) as SkillJob;
    const envelope: JobEnvelope<SkillJob> = {
      apiVersion: API_VERSION,
      kind: ENVELOPE_KIND_JOB,
      envelope_version: ENVELOPE_VERSION,
      alg: ALG,
      canonical: CANONICAL,
      payload,
      mac: macHex(key, payload),
    };
    const tmp = join(this.jobsDir, `.${job.run_id}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
    writeFileSync(tmp, `${JSON.stringify(envelope)}\n`, { encoding: "utf-8", mode: 0o600 });
    renameSync(tmp, path);
    return path;
  }

  readResult(runId: string, options?: { key?: Buffer }): SkillJobResult | null {
    assertRunId(runId);
    const path = jobFilePath(this.jobsDir, `${runId}.result.json`);
    if (!existsSync(path)) return null;
    refuseSymlink(path);
    const text = readFileSync(path, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new CheckpointError("CORRUPT", "job result JSON is truncated or invalid");
    }
    if (!isRecord(parsed)) {
      throw new CheckpointError("CORRUPT", "job result JSON is not an object");
    }
    if (parsed.kind === "SkillJobResult" || typeof parsed.mac !== "string") {
      throw new CheckpointError("SIGNATURE_ABSENT", "job result has no integrity envelope");
    }
    if (parsed.kind !== ENVELOPE_KIND_RESULT && parsed.kind !== "SkillJobResultEnvelope") {
      throw new CheckpointError("UNSUPPORTED_INTEGRITY", "job result integrity envelope is not supported");
    }
    if (
      parsed.envelope_version !== ENVELOPE_VERSION ||
      parsed.alg !== ALG ||
      parsed.canonical !== CANONICAL ||
      parsed.apiVersion !== API_VERSION
    ) {
      throw new CheckpointError("UNSUPPORTED_INTEGRITY", "job result integrity envelope is not supported");
    }
    if (!isRecord(parsed.payload)) {
      throw new CheckpointError("CORRUPT", "job result payload is not an object");
    }
    const key = resolveKey(options?.key);
    const expected = macHex(key, parsed.payload);
    if (!macsMatch(expected, parsed.mac)) {
      throw new CheckpointError("SIGNATURE_INVALID", "job result MAC does not match the payload");
    }
    return parsed.payload as unknown as SkillJobResult;
  }

  writeResult(result: SkillJobResult, options?: { key?: Buffer }): string {
    assertRunId(result.run_id);
    const key = resolveKey(options?.key);
    const path = jobFilePath(this.jobsDir, `${result.run_id}.result.json`);
    refuseSymlink(path);
    mkdirSync(this.jobsDir, { recursive: true, mode: 0o700 });
    const payload = JSON.parse(JSON.stringify(result)) as SkillJobResult;
    const envelope: JobEnvelope<SkillJobResult> = {
      apiVersion: API_VERSION,
      kind: ENVELOPE_KIND_RESULT,
      envelope_version: ENVELOPE_VERSION,
      alg: ALG,
      canonical: CANONICAL,
      payload,
      mac: macHex(key, payload),
    };
    const tmp = join(this.jobsDir, `.${result.run_id}.result.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
    writeFileSync(tmp, `${JSON.stringify(envelope)}\n`, { encoding: "utf-8", mode: 0o600 });
    renameSync(tmp, path);
    return path;
  }

  hasCompletedResult(runId: string, options?: { key?: Buffer }): boolean {
    const job = this.readJob(runId, options);
    const result = this.readResult(runId, options);
    return !!job && !!result && (job.status === "completed" || job.status === "failed");
  }

  completeJob(
    runId: string,
    result: Omit<SkillJobResult, "run_id" | "completed_at">,
    options?: { key?: Buffer },
  ): void {
    const job = this.readJob(runId, options);
    if (!job) throw new Error(`Job not found: ${runId}`);

    job.status = result.success ? "completed" : "failed";
    this.writeJob(job, options);

    let evidence_path = result.evidence_path;
    if (result.success && evidence_path && existsSync(resolve(evidence_path))) {
      copySanitizedEvidenceToJobsDir(this.jobsDir, runId, evidence_path);
      evidence_path = relativeJobsEvidencePath(runId);
    }

    const full: SkillJobResult = {
      run_id: runId,
      completed_at: new Date().toISOString(),
      ...result,
      evidence_path,
    };
    this.writeResult(full, options);
  }

  deleteResult(runId: string): void {
    assertRunId(runId);
    const path = jobFilePath(this.jobsDir, `${runId}.result.json`);
    if (existsSync(path)) {
      refuseSymlink(path);
      unlinkSync(path);
    }
  }

  reopenJob(runId: string, options?: { key?: Buffer }): SkillJob {
    const job = this.readJob(runId, options);
    if (!job) throw new Error(`Job not found: ${runId}`);
    if (job.status === "pending") {
      throw new Error(
        `REOPEN_NOT_ALLOWED: job ${runId} is already pending; reopen only applies to completed or failed jobs`,
      );
    }
    this.deleteResult(runId);
    job.status = "pending";
    this.writeJob(job, options);
    return job;
  }
}
