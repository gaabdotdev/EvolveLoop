/**
 * V2-ORCH-02 — Deterministic Merge Queue + pre-merge integrated-test gate.
 * Serializes merges onto a target branch. FIFO by (enqueue_seq | created_at | task_id).
 * Never invents semantic resolutions; does not commit unless explicitly opted in
 * (tests use temp git fixtures — production path leaves commit to the caller).
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { astAwareMerge, type AstMergeResult } from "./ast-aware-merge.js";
import { detectMergiraf } from "./mergiraf-adapter.js";

export type MergeQueueItemStatus =
  | "QUEUED"
  | "MERGING"
  | "MERGED"
  | "NEEDS_SEMANTIC_TASK"
  | "TESTS_FAILED"
  | "FAILED";

export interface MergeFileTriple {
  path: string;
  base: string;
  ours: string;
  theirs: string;
}

export interface MergeQueueEnqueueInput {
  task_id: string;
  created_at?: string;
  target_branch: string;
  files: MergeFileTriple[];
  /** Working directory for integrated tests / optional file apply. */
  cwd?: string;
}

export interface MergeQueueItem extends MergeQueueEnqueueInput {
  enqueue_seq: number;
  created_at: string;
  status: MergeQueueItemStatus;
  merged_files?: Record<string, string>;
  merge_results?: Record<string, AstMergeResult>;
  last_error?: string;
}

export interface MergeMetrics {
  syntactic_resolved: number;
  semantic_needed: number;
  /** syntactic / (syntactic + semantic); 1 when no conflicts classified. */
  syntactic_ratio: number;
}

export interface IntegratedTestResult {
  ok: boolean;
  output?: string;
  exit_code?: number | null;
}

export type IntegratedTestRunner = (cwd: string) => Promise<IntegratedTestResult>;

/** Default no-op success — unit tests inject failures explicitly. */
export async function runIntegratedTests(cwd: string): Promise<IntegratedTestResult> {
  void cwd;
  return { ok: true, output: "noop", exit_code: 0 };
}

export interface ProcessNextOptions {
  runIntegratedTests?: IntegratedTestRunner;
  /** When true, write merged file contents under item.cwd. Default true if cwd set. */
  apply_files?: boolean;
  /**
   * When true, run `git add` + `git commit` in item.cwd after tests pass.
   * Default false — tests must opt in on temp fixtures only.
   */
  commit?: boolean;
  commit_message?: string;
  /** On TESTS_FAILED: requeue at end (true) or leave as TESTS_FAILED (false). Default false. */
  requeue_on_test_failure?: boolean;
  prefer_mergiraf?: boolean;
}

export interface ProcessNextResult {
  item: MergeQueueItem | null;
  metrics: MergeMetrics;
  blocked_by_tests: boolean;
  mergiraf_available: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function compareQueueItems(a: MergeQueueItem, b: MergeQueueItem): number {
  if (a.enqueue_seq !== b.enqueue_seq) return a.enqueue_seq - b.enqueue_seq;
  const byCreated = a.created_at.localeCompare(b.created_at);
  if (byCreated !== 0) return byCreated;
  return a.task_id.localeCompare(b.task_id);
}

function computeRatio(syntactic: number, semantic: number): number {
  const denom = syntactic + semantic;
  if (denom === 0) return 1;
  return syntactic / denom;
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

/**
 * Deterministic FIFO merge queue. One merge at a time per queue instance
 * (serialize onto target_branch by processing head only).
 */
export class MergeQueue {
  private seq = 0;
  private readonly items: MergeQueueItem[] = [];
  private readonly metricsState = {
    syntactic_resolved: 0,
    semantic_needed: 0,
  };

  get metrics(): MergeMetrics {
    return {
      syntactic_resolved: this.metricsState.syntactic_resolved,
      semantic_needed: this.metricsState.semantic_needed,
      syntactic_ratio: computeRatio(
        this.metricsState.syntactic_resolved,
        this.metricsState.semantic_needed,
      ),
    };
  }

  /** Snapshot of pending QUEUED items in deterministic order. */
  listQueued(): MergeQueueItem[] {
    return this.items
      .filter((i) => i.status === "QUEUED")
      .slice()
      .sort(compareQueueItems);
  }

  /** All items (any status), deterministic order. */
  listAll(): MergeQueueItem[] {
    return this.items.slice().sort(compareQueueItems);
  }

  enqueue(input: MergeQueueEnqueueInput): MergeQueueItem {
    this.seq += 1;
    const item: MergeQueueItem = {
      ...input,
      enqueue_seq: this.seq,
      created_at: input.created_at ?? nowIso(),
      status: "QUEUED",
      files: input.files.map((f) => ({ ...f })),
    };
    this.items.push(item);
    return item;
  }

  /**
   * Process the head QUEUED item for the given target_branch (or global head if omitted).
   * Serial: only one item advances per call.
   */
  async processNext(
    targetBranch?: string,
    opts: ProcessNextOptions = {},
  ): Promise<ProcessNextResult> {
    const mergiraf = detectMergiraf();
    const queued = this.listQueued().filter((i) =>
      targetBranch ? i.target_branch === targetBranch : true,
    );
    const head = queued[0] ?? null;
    if (!head) {
      return {
        item: null,
        metrics: this.metrics,
        blocked_by_tests: false,
        mergiraf_available: mergiraf.available,
      };
    }

    head.status = "MERGING";
    const merge_results: Record<string, AstMergeResult> = {};
    const merged_files: Record<string, string> = {};
    let needsSemantic = false;

    for (const file of head.files) {
      const result = astAwareMerge({
        path: file.path,
        base: file.base,
        ours: file.ours,
        theirs: file.theirs,
        prefer_mergiraf: opts.prefer_mergiraf,
      });
      merge_results[file.path] = result;

      if (result.syntactic_resolved) {
        this.metricsState.syntactic_resolved += 1;
      }
      if (result.semantic_needed || result.status === "NEEDS_SEMANTIC_TASK") {
        this.metricsState.semantic_needed += 1;
        needsSemantic = true;
      }

      if (result.status === "MERGED" && result.content !== undefined) {
        merged_files[file.path] = result.content;
      }
    }

    head.merge_results = merge_results;
    head.merged_files = merged_files;

    if (needsSemantic) {
      head.status = "NEEDS_SEMANTIC_TASK";
      head.last_error = "semantic_conflict";
      return {
        item: head,
        metrics: this.metrics,
        blocked_by_tests: false,
        mergiraf_available: mergiraf.available,
      };
    }

    const cwd = head.cwd;
    // Apply merged content to the worktree before the test gate (still pre-commit).
    const applyFiles = opts.apply_files ?? Boolean(cwd);
    if (applyFiles && cwd) {
      for (const [rel, content] of Object.entries(merged_files)) {
        const abs = join(cwd, rel);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content, "utf-8");
      }
    }

    // Pre-merge / pre-commit gate: integrated tests must pass before finalize.
    const runner = opts.runIntegratedTests ?? runIntegratedTests;
    if (cwd) {
      const testResult = await runner(cwd);
      if (!testResult.ok) {
        head.status = "TESTS_FAILED";
        head.last_error = testResult.output ?? "integrated_tests_failed";
        if (opts.requeue_on_test_failure) {
          head.status = "QUEUED";
          // Move to end by bumping enqueue_seq while preserving created_at/task_id tie-break.
          this.seq += 1;
          head.enqueue_seq = this.seq;
        }
        return {
          item: head,
          metrics: this.metrics,
          blocked_by_tests: true,
          mergiraf_available: mergiraf.available,
        };
      }
    }

    if (opts.commit && cwd) {
      if (!existsSync(join(cwd, ".git"))) {
        head.status = "FAILED";
        head.last_error = "commit_requested_but_not_a_git_repo";
        return {
          item: head,
          metrics: this.metrics,
          blocked_by_tests: false,
          mergiraf_available: mergiraf.available,
        };
      }
      for (const rel of Object.keys(merged_files)) {
        git(cwd, ["add", "--", rel]);
      }
      const msg = opts.commit_message ?? `merge-queue: ${head.task_id}`;
      const committed = git(cwd, ["commit", "-m", msg, "--allow-empty-message"]);
      if (!committed.ok) {
        head.status = "FAILED";
        head.last_error = committed.stderr || "git_commit_failed";
        return {
          item: head,
          metrics: this.metrics,
          blocked_by_tests: false,
          mergiraf_available: mergiraf.available,
        };
      }
    }

    head.status = "MERGED";
    return {
      item: head,
      metrics: this.metrics,
      blocked_by_tests: false,
      mergiraf_available: mergiraf.available,
    };
  }
}
