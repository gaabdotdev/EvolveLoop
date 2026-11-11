/**
 * Git worktree helper for agent isolation.
 * Best-effort: requires a git repo; does not claim sandbox OS isolation.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { V3DataPaths } from "../paths.js";

export interface WorktreeRecord {
  kind: "WorktreeRecord";
  worktree_id: string;
  work_id: string;
  agent_id?: string;
  path: string;
  branch: string;
  created_at: string;
  status: "active" | "removed" | "failed";
  error?: string;
  limitations: string[];
}

export interface WorktreeManagerSnapshot {
  kind: "WorktreeManagerSnapshot";
  work_id: string;
  repo_root: string;
  worktrees: WorktreeRecord[];
  updated_at: string;
  limitations: string[];
}

const LIMITATIONS = [
  "Git worktree isolation only — not a full OS sandbox",
  "Requires writable git repository; fails closed outside git",
  "Does not prevent host agent from editing the primary checkout",
];

function nowIso(): string {
  return new Date().toISOString();
}

function git(cwd: string, args: string[]): { ok: boolean; stdout: string; stderr: string; status: number | null } {
  const run = spawnSync("git", args, { cwd, encoding: "utf-8" });
  return {
    ok: run.status === 0,
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? "",
    status: run.status,
  };
}

export class WorktreeManager {
  private readonly baseDir: string;

  constructor(paths: V3DataPaths, private readonly repoRoot: string) {
    this.baseDir = paths.worktreesDir;
    mkdirSync(this.baseDir, { recursive: true });
  }

  private metaPath(workId: string): string {
    return join(this.baseDir, `${workId}.json`);
  }

  load(workId: string): WorktreeManagerSnapshot {
    const path = this.metaPath(workId);
    if (!existsSync(path)) {
      return {
        kind: "WorktreeManagerSnapshot",
        work_id: workId,
        repo_root: this.repoRoot,
        worktrees: [],
        updated_at: nowIso(),
        limitations: [...LIMITATIONS],
      };
    }
    return JSON.parse(readFileSync(path, "utf-8")) as WorktreeManagerSnapshot;
  }

  private save(snap: WorktreeManagerSnapshot): void {
    snap.updated_at = nowIso();
    snap.limitations = [...LIMITATIONS];
    const path = this.metaPath(snap.work_id);
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(snap, null, 2));
    renameSync(tmp, path);
  }

  ensureGitRepo(): { ok: boolean; reason?: string } {
    const r = git(this.repoRoot, ["rev-parse", "--is-inside-work-tree"]);
    if (!r.ok || r.stdout.trim() !== "true") {
      return { ok: false, reason: "not_a_git_repository" };
    }
    return { ok: true };
  }

  create(input: {
    work_id: string;
    agent_id?: string;
    branch_prefix?: string;
  }): WorktreeRecord {
    const check = this.ensureGitRepo();
    const snap = this.load(input.work_id);
    const worktree_id = `wt-${input.work_id}-${Date.now()}`;
    const branch = `${input.branch_prefix ?? "evolveloop"}/${input.work_id}/${worktree_id}`;
    const path = resolve(this.baseDir, input.work_id, worktree_id);

    if (!check.ok) {
      const failed: WorktreeRecord = {
        kind: "WorktreeRecord",
        worktree_id,
        work_id: input.work_id,
        agent_id: input.agent_id,
        path,
        branch,
        created_at: nowIso(),
        status: "failed",
        error: check.reason,
        limitations: [...LIMITATIONS],
      };
      snap.worktrees.push(failed);
      this.save(snap);
      return failed;
    }

    mkdirSync(join(this.baseDir, input.work_id), { recursive: true });
    const add = git(this.repoRoot, ["worktree", "add", "-b", branch, path]);
    const rec: WorktreeRecord = {
      kind: "WorktreeRecord",
      worktree_id,
      work_id: input.work_id,
      agent_id: input.agent_id,
      path,
      branch,
      created_at: nowIso(),
      status: add.ok ? "active" : "failed",
      error: add.ok ? undefined : add.stderr.trim() || `git_status_${add.status}`,
      limitations: [...LIMITATIONS],
    };
    snap.worktrees.push(rec);
    this.save(snap);
    return rec;
  }

  remove(workId: string, worktreeId: string, opts?: { force?: boolean }): WorktreeRecord {
    const snap = this.load(workId);
    const rec = snap.worktrees.find((w) => w.worktree_id === worktreeId);
    if (!rec) {
      throw new WorktreeError("NOT_FOUND", worktreeId);
    }
    if (rec.status === "active" && existsSync(rec.path)) {
      const args = ["worktree", "remove", rec.path];
      if (opts?.force) args.push("--force");
      const rm = git(this.repoRoot, args);
      if (!rm.ok) {
        git(this.repoRoot, ["worktree", "prune"]);
        try {
          rmSync(rec.path, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    }
    rec.status = "removed";
    this.save(snap);
    return rec;
  }

  list(workId: string): WorktreeRecord[] {
    return this.load(workId).worktrees;
  }
}

export class WorktreeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "WorktreeError";
  }
}
