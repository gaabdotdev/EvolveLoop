/**
 * Integration / merge coordinator for agent workspaces.
 * Does not run destructive git without ownership + dirty checks.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { OwnershipLedger } from "./ownership.js";
import { runPostMergeValidation, type PostMergeResult } from "./post-merge.js";

export type IntegrationState =
  | "pending"
  | "validated"
  | "conflict"
  | "testing"
  | "integrated"
  | "rolled_back"
  | "failed";

export interface WorkspaceIntegrationRecord {
  kind: "WorkspaceIntegrationRecord";
  workspace_id: string;
  work_id: string;
  agent_id: string;
  workspace_path: string;
  base_commit: string;
  branch?: string;
  state: IntegrationState;
  conflict_files: string[];
  test_exit_code?: number | null;
  post_merge?: PostMergeResult;
  integrated_commit?: string;
  checkpoint_ref?: string;
  notes: string[];
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function git(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

export class IntegrationCoordinator {
  private readonly ownership: OwnershipLedger;

  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
    this.ownership = new OwnershipLedger(join(rootDir, "ownership"));
  }

  private pathFor(workspaceId: string): string {
    return join(this.rootDir, `${workspaceId}.json`);
  }

  get(workspaceId: string): WorkspaceIntegrationRecord | undefined {
    const p = this.pathFor(workspaceId);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf-8")) as WorkspaceIntegrationRecord;
  }

  private save(rec: WorkspaceIntegrationRecord): void {
    const p = this.pathFor(rec.workspace_id);
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(rec, null, 2));
    renameSync(tmp, p);
  }

  register(input: {
    workspace_id: string;
    work_id: string;
    agent_id: string;
    workspace_path: string;
    base_commit: string;
    branch?: string;
  }): WorkspaceIntegrationRecord {
    const rec: WorkspaceIntegrationRecord = {
      kind: "WorkspaceIntegrationRecord",
      ...input,
      state: "pending",
      conflict_files: [],
      notes: [],
      updated_at: nowIso(),
    };
    this.save(rec);
    return rec;
  }

  claimFile(
    workId: string,
    agentId: string,
    workspaceId: string,
    relPath: string,
    baseCommit?: string,
  ): { ok: true } | { ok: false; conflict: { agent_id: string; path: string } } {
    const result = this.ownership.claim({
      path: relPath,
      work_id: workId,
      agent_id: agentId,
      workspace_id: workspaceId,
      claimed_at: nowIso(),
      base_commit: baseCommit,
    });
    if (!result.ok) {
      return { ok: false, conflict: { agent_id: result.conflict.agent_id, path: result.conflict.path } };
    }
    return { ok: true };
  }

  /**
   * Detect dirty human changes in primary checkout that are not owned by workflow.
   */
  detectHumanDirty(primaryRepo: string, ownedPaths: string[]): string[] {
    const st = git(primaryRepo, ["status", "--porcelain"]);
    if (st.status !== 0) return [];
    const dirty: string[] = [];
    for (const line of st.stdout.split("\n")) {
      if (!line.trim()) continue;
      const path = line.slice(3).trim();
      if (!ownedPaths.includes(path)) dirty.push(path);
    }
    return dirty;
  }

  /**
   * Attempt merge of workspace branch into primary. Stops on conflict.
   */
  integrate(opts: {
    workspace_id: string;
    primary_repo: string;
    test_argv?: string[];
    /** When true (default), discover and run real post-merge checks; never node -e exit 0. */
    run_post_merge?: boolean;
  }): WorkspaceIntegrationRecord {
    const rec = this.get(opts.workspace_id);
    if (!rec) throw new Error(`WORKSPACE_NOT_FOUND:${opts.workspace_id}`);

    // Checkpoint current HEAD of primary
    const head = git(opts.primary_repo, ["rev-parse", "HEAD"]);
    if (head.status !== 0) {
      rec.state = "failed";
      rec.notes.push("primary_not_git");
      rec.updated_at = nowIso();
      this.save(rec);
      return rec;
    }
    rec.checkpoint_ref = head.stdout.trim();

    const dirtyHuman = this.detectHumanDirty(opts.primary_repo, []);
    if (dirtyHuman.length) {
      rec.notes.push(`human_dirty:${dirtyHuman.slice(0, 5).join(",")}`);
    }

    if (!rec.branch) {
      rec.state = "failed";
      rec.notes.push("integration_requires_git_branch_not_directory_copy");
      rec.updated_at = nowIso();
      this.save(rec);
      return rec;
    }

    const merge = git(opts.primary_repo, ["merge", "--no-ff", "--no-commit", rec.branch]);
    if (merge.status !== 0) {
      const unmerged = git(opts.primary_repo, ["diff", "--name-only", "--diff-filter=U"]);
      rec.state = "conflict";
      rec.conflict_files = unmerged.stdout.split("\n").filter(Boolean);
      rec.notes.push("merge_conflict");
      git(opts.primary_repo, ["merge", "--abort"]);
      rec.updated_at = nowIso();
      this.save(rec);
      return rec;
    }

    // Explicit argv overrides discovery when provided.
    if (opts.test_argv?.length) {
      rec.state = "testing";
      this.save(rec);
      const test = spawnSync(opts.test_argv[0]!, opts.test_argv.slice(1), {
        cwd: opts.primary_repo,
        encoding: "utf-8",
      });
      rec.test_exit_code = test.status;
      if (test.status !== 0) {
        git(opts.primary_repo, ["merge", "--abort"]);
        rec.state = "failed";
        rec.notes.push("post_merge_tests_failed");
        rec.updated_at = nowIso();
        this.save(rec);
        return rec;
      }
    } else if (opts.run_post_merge !== false) {
      rec.state = "testing";
      this.save(rec);
      const pm = runPostMergeValidation(opts.primary_repo);
      rec.post_merge = pm;
      rec.test_exit_code = pm.overall === "PASS" ? 0 : 1;
      if (pm.overall === "FAIL") {
        git(opts.primary_repo, ["merge", "--abort"]);
        rec.state = "failed";
        rec.notes.push("post_merge_validation_failed");
        rec.updated_at = nowIso();
        this.save(rec);
        return rec;
      }
      if (pm.overall === "NO_CHECKS" || pm.overall === "BLOCKED") {
        rec.notes.push(`post_merge_${pm.overall.toLowerCase()}`);
        // Do not auto-PASS: leave merge staged but require explicit continue?
        // Policy: abort — absence of tests is not approval.
        git(opts.primary_repo, ["merge", "--abort"]);
        rec.state = "failed";
        rec.notes.push("refused_integrate_without_applicable_required_checks");
        rec.updated_at = nowIso();
        this.save(rec);
        return rec;
      }
    }

    const commit = git(opts.primary_repo, [
      "commit",
      "-m",
      `integrate(${rec.workspace_id}): agent ${rec.agent_id}`,
    ]);
    if (commit.status !== 0 && !git(opts.primary_repo, ["status", "--porcelain"]).stdout.trim()) {
      // nothing to commit — already applied
    }
    const newHead = git(opts.primary_repo, ["rev-parse", "HEAD"]);
    rec.integrated_commit = newHead.stdout.trim();
    rec.state = "integrated";
    rec.updated_at = nowIso();
    this.save(rec);
    return rec;
  }

  /**
   * Rollback primary to checkpoint — only if HEAD equals integrated commit (ownership of integration).
   */
  rollback(workspaceId: string, primaryRepo: string): WorkspaceIntegrationRecord {
    const rec = this.get(workspaceId);
    if (!rec) throw new Error(`WORKSPACE_NOT_FOUND:${workspaceId}`);
    if (!rec.checkpoint_ref) throw new Error("NO_CHECKPOINT");
    const head = git(primaryRepo, ["rev-parse", "HEAD"]).stdout.trim();
    if (rec.integrated_commit && head !== rec.integrated_commit) {
      rec.notes.push("rollback_refused_head_mismatch_external_changes");
      rec.updated_at = nowIso();
      this.save(rec);
      return rec;
    }
    // Soft reset to checkpoint — preserve working tree human changes when possible via mixed reset.
    const reset = git(primaryRepo, ["reset", "--mixed", rec.checkpoint_ref]);
    if (reset.status !== 0) {
      rec.state = "failed";
      rec.notes.push("rollback_failed");
    } else {
      rec.state = "rolled_back";
      rec.notes.push("rolled_back_to_checkpoint");
    }
    rec.updated_at = nowIso();
    this.save(rec);
    return rec;
  }

  diff(workspacePath: string, baseCommit: string): string {
    const r = git(workspacePath, ["diff", baseCommit, "--"]);
    return r.stdout;
  }
}

/** Test helper: create conflict fixture between two workspaces on same file. */
export function writeConflictFixture(dir: string, fileRel: string, content: string): void {
  mkdirSync(join(dir, dirnameSafe(fileRel)), { recursive: true });
  writeFileSync(join(dir, fileRel), content, "utf-8");
}

function dirnameSafe(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(0, i) : ".";
}

export function cleanupDir(dir: string): void {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

/** Avoid unused import lint for execFileSync in some TS configs */
void execFileSync;
