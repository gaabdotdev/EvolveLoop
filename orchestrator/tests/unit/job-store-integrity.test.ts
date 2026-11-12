import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JobStore, type SkillJob, type SkillJobResult } from "../../src/jobs/job-store.js";
import { CheckpointError } from "../../src/jobs/checkpoint.js";

const KEY_ENV = "EVOLVELOOP_CHECKPOINT_HMAC_KEY";
const originalKey = process.env[KEY_ENV];

afterEach(() => {
  if (originalKey === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = originalKey;
});

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "job-store-integrity-"));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function sampleJob(runId = "run-job-1"): SkillJob {
  return {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "SkillJob",
    run_id: runId,
    provider_id: "testing",
    skill_path: ".cursor/skills/testing/SKILL.md",
    capability: "testing",
    node_id: "n1",
    briefing: "run tests",
    definition_of_done: [{ id: "d1", check: "pass" }],
    inputs: [],
    status: "pending",
  };
}

function errorCode(run: () => void): string {
  try {
    run();
  } catch (error) {
    if (error instanceof CheckpointError) return error.code;
    throw error;
  }
  return "NO_THROW";
}

describe("JobStore HMAC integrity", () => {
  it("round-trips a signed job and result with HMAC envelope and secure permissions", () => {
    const dir = workspace();
    const store = new JobStore(dir);
    const job = sampleJob();

    const jobPath = store.writeJob(job);
    expect((statSync(jobPath).mode & 0o777) === 0o600).toBe(true);

    const envelope = JSON.parse(readFileSync(jobPath, "utf-8")) as {
      kind: string;
      alg: string;
      envelope_version: number;
      mac: string;
      payload: SkillJob;
    };
    expect(envelope.kind).toBe("JobEnvelope");
    expect(envelope.alg).toBe("HMAC-SHA256");
    expect(envelope.envelope_version).toBe(1);
    expect(envelope.mac).toMatch(/^[0-9a-f]{64}$/);
    expect(envelope.payload.run_id).toBe(job.run_id);
    expect(envelope.payload).not.toHaveProperty("mac");

    const readJob = store.readJob(job.run_id);
    expect(readJob?.run_id).toBe(job.run_id);
    expect(readJob?.status).toBe("pending");

    store.completeJob(job.run_id, { success: true });
    const resultPath = join(dir, `${job.run_id}.result.json`);
    expect((statSync(resultPath).mode & 0o777) === 0o600).toBe(true);

    const resultEnvelope = JSON.parse(readFileSync(resultPath, "utf-8")) as {
      kind: string;
      alg: string;
      mac: string;
      payload: SkillJobResult;
    };
    expect(resultEnvelope.kind).toBe("JobResultEnvelope");
    expect(resultEnvelope.alg).toBe("HMAC-SHA256");
    expect(resultEnvelope.mac).toMatch(/^[0-9a-f]{64}$/);
    expect(resultEnvelope.payload.success).toBe(true);

    const readRes = store.readResult(job.run_id);
    expect(readRes?.success).toBe(true);
    expect(store.hasCompletedResult(job.run_id)).toBe(true);
  });

  it("rejects a tampered job payload and a tampered result payload", () => {
    const dir = workspace();
    const store = new JobStore(dir);
    const job = sampleJob();
    const jobPath = store.writeJob(job);

    const envelope = JSON.parse(readFileSync(jobPath, "utf-8")) as {
      payload: { briefing: string };
      mac: string;
    };
    envelope.payload.briefing = "TAMPERED BRIEFING";
    writeFileSync(jobPath, JSON.stringify(envelope));
    expect(errorCode(() => store.readJob(job.run_id))).toBe("SIGNATURE_INVALID");

    store.writeJob(job);
    store.completeJob(job.run_id, { success: true });
    const resultPath = join(dir, `${job.run_id}.result.json`);
    const resEnvelope = JSON.parse(readFileSync(resultPath, "utf-8")) as {
      payload: { success: boolean };
    };
    resEnvelope.payload.success = false;
    writeFileSync(resultPath, JSON.stringify(resEnvelope));
    expect(errorCode(() => store.readResult(job.run_id))).toBe("SIGNATURE_INVALID");
    expect(errorCode(() => store.hasCompletedResult(job.run_id))).toBe("SIGNATURE_INVALID");
  });

  it("rejects a replaced MAC on job and result", () => {
    const dir = workspace();
    const store = new JobStore(dir);
    const job = sampleJob();
    const jobPath = store.writeJob(job);

    const envelope = JSON.parse(readFileSync(jobPath, "utf-8")) as { mac: string };
    envelope.mac = `${"cd".repeat(32)}`;
    writeFileSync(jobPath, JSON.stringify(envelope));
    expect(errorCode(() => store.readJob(job.run_id))).toBe("SIGNATURE_INVALID");

    store.writeJob(job);
    store.completeJob(job.run_id, { success: true });
    const resultPath = join(dir, `${job.run_id}.result.json`);
    const resEnvelope = JSON.parse(readFileSync(resultPath, "utf-8")) as { mac: string };
    resEnvelope.mac = `${"ef".repeat(32)}`;
    writeFileSync(resultPath, JSON.stringify(resEnvelope));
    expect(errorCode(() => store.readResult(job.run_id))).toBe("SIGNATURE_INVALID");
  });

  it("rejects legacy unsigned job and result JSON", () => {
    const dir = workspace();
    const store = new JobStore(dir);
    const job = sampleJob();
    writeFileSync(join(dir, `${job.run_id}.json`), JSON.stringify(job));
    expect(errorCode(() => store.readJob(job.run_id))).toBe("SIGNATURE_ABSENT");

    const result: SkillJobResult = {
      run_id: job.run_id,
      success: true,
      completed_at: new Date().toISOString(),
    };
    writeFileSync(join(dir, `${job.run_id}.result.json`), JSON.stringify(result));
    expect(errorCode(() => store.readResult(job.run_id))).toBe("SIGNATURE_ABSENT");
  });

  it("rejects truncated JSON and unsupported envelope versions", () => {
    const dir = workspace();
    const store = new JobStore(dir);
    const job = sampleJob();
    const jobPath = store.writeJob(job);

    writeFileSync(jobPath, "{");
    expect(errorCode(() => store.readJob(job.run_id))).toBe("CORRUPT");

    store.writeJob(job);
    const badVersion = JSON.parse(readFileSync(jobPath, "utf-8")) as { envelope_version: number };
    badVersion.envelope_version = 42;
    writeFileSync(jobPath, JSON.stringify(badVersion));
    expect(errorCode(() => store.readJob(job.run_id))).toBe("UNSUPPORTED_INTEGRITY");

    store.writeJob(job);
    const badKind = JSON.parse(readFileSync(jobPath, "utf-8")) as { kind: string };
    badKind.kind = "UnknownEnvelope";
    writeFileSync(jobPath, JSON.stringify(badKind));
    expect(errorCode(() => store.readJob(job.run_id))).toBe("UNSUPPORTED_INTEGRITY");
  });

  it("fails closed when the key is missing or too short, but returns null for non-existent file", () => {
    const dir = workspace();
    const store = new JobStore(dir);
    const job = sampleJob();

    delete process.env[KEY_ENV];
    expect(store.readJob("does-not-exist")).toBeNull();
    expect(errorCode(() => store.writeJob(job))).toBe("KEY_ABSENT");

    process.env[KEY_ENV] = randomBytes(32).toString("base64");
    store.writeJob(job);

    delete process.env[KEY_ENV];
    expect(errorCode(() => store.readJob(job.run_id))).toBe("KEY_ABSENT");

    process.env[KEY_ENV] = "too-short-key";
    expect(errorCode(() => store.readJob(job.run_id))).toBe("KEY_INVALID");
  });

  it("rejects path traversal and symlinks", () => {
    const dir = workspace();
    const store = new JobStore(dir);
    const job = sampleJob("../outside");

    expect(errorCode(() => store.writeJob(job))).toBe("JOB_PATH_DENIED");
    expect(errorCode(() => store.readJob("../outside"))).toBe("JOB_PATH_DENIED");

    const legit = sampleJob("run-legit");
    store.writeJob(legit);

    const outside = join(dir, "outside.json");
    writeFileSync(outside, "untouched");
    const linkPath = join(dir, "run-symlink.json");
    symlinkSync(outside, linkPath);

    expect(errorCode(() => store.readJob("run-symlink"))).toBe("CHECKPOINT_PATH_DENIED");
    expect(readFileSync(outside, "utf-8")).toBe("untouched");
  });

  it("reopenJob preserves integrity by signing the pending job", () => {
    const dir = workspace();
    const store = new JobStore(dir);
    const job = sampleJob("run-reopen");

    store.writeJob(job);
    store.completeJob(job.run_id, { success: true });
    expect(store.readJob(job.run_id)?.status).toBe("completed");

    const reopened = store.reopenJob(job.run_id);
    expect(reopened.status).toBe("pending");
    expect(store.readJob(job.run_id)?.status).toBe("pending");
    expect(store.readResult(job.run_id)).toBeNull();
  });
});
