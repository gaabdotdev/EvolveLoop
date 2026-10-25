import { readdirSync, readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { assertPathConfined } from "../knowledge/uks/storage-core.js";

export function assertRunIdConfined(runId: string): string {
  if (!runId || typeof runId !== "string") {
    throw new Error("SECURITY_PATH_TRAVERSAL_VIOLATION: Invalid runId: empty or non-string");
  }
  if (runId.includes("..") || runId.includes("/") || runId.includes("\\") || /[\0\r\n\t]/.test(runId)) {
    throw new Error(`SECURITY_PATH_TRAVERSAL_VIOLATION: Illegal traversal characters in runId: '${runId}'`);
  }
  return runId;
}

export function writeAtomicJsonSync<T>(filePath: string, data: T): void {
  const targetPath = resolve(filePath);
  const targetDir = dirname(targetPath);
  mkdirSync(targetDir, { recursive: true });
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmpPath, targetPath);
}

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
}

export interface SkillJobResult {
  run_id: string;
  success: boolean;
  evidence_path?: string;
  error?: string;
  completed_at: string;
}

export class JobStore {
  constructor(private jobsDir: string) {}

  jobPath(runId: string): string {
    assertRunIdConfined(runId);
    const target = join(this.jobsDir, `${runId}.json`);
    assertPathConfined(target, this.jobsDir);
    return target;
  }

  resultPath(runId: string): string {
    assertRunIdConfined(runId);
    const target = join(this.jobsDir, `${runId}.result.json`);
    assertPathConfined(target, this.jobsDir);
    return target;
  }

  listPending(): SkillJob[] {
    if (!existsSync(this.jobsDir)) return [];
    return readdirSync(this.jobsDir)
      .filter((f) => f.endsWith(".json") && !f.endsWith(".result.json"))
      .map((f) => {
        const id = f.replace(/\.json$/, "");
        try {
          return this.readJob(id);
        } catch {
          return null;
        }
      })
      .filter((j): j is SkillJob => j !== null && j.status === "pending");
  }

  readJob(runId: string): SkillJob | null {
    const path = this.jobPath(runId);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as SkillJob;
  }

  readResult(runId: string): SkillJobResult | null {
    const path = this.resultPath(runId);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as SkillJobResult;
  }

  hasCompletedResult(runId: string): boolean {
    const job = this.readJob(runId);
    const result = this.readResult(runId);
    return !!job && !!result && (job.status === "completed" || job.status === "failed");
  }

  completeJob(runId: string, result: Omit<SkillJobResult, "run_id" | "completed_at">): void {
    const job = this.readJob(runId);
    if (!job) throw new Error(`Job not found: ${runId}`);

    const fullResult: SkillJobResult = {
      run_id: runId,
      completed_at: new Date().toISOString(),
      ...result,
    };

    // Atomic write 1: Result file FIRST
    writeAtomicJsonSync(this.resultPath(runId), fullResult);

    // Atomic write 2: Job status SECOND
    job.status = result.success ? "completed" : "failed";
    writeAtomicJsonSync(this.jobPath(runId), job);
  }

  deleteResult(runId: string): void {
    const path = this.resultPath(runId);
    if (existsSync(path)) unlinkSync(path);
  }
}
