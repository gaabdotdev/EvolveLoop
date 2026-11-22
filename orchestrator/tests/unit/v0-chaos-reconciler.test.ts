/**
 * V0-TEST-C / V0-EXIT-03 — Chaos: SIGKILL mid-run → Reconciler invariants.
 * - zero orphans outside owned pgid after tree kill
 * - dirty worktree → UNKNOWN never blind retry
 * - clean worktree → FAILED with safe requeue (auto_retry_allowed)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { StateDb } from "../../src/v3/state-db/index.js";
import {
  assertNotBlindRetry,
  decideReconcile,
  mayAutoRetryTask,
  reconcileWorkOnBoot,
} from "../../src/v3/mso/index.js";
import {
  cancelProcessTreeEscalating,
  listOrphans,
  spawnSupervised,
} from "../../src/v3/sandbox/process-supervisor.js";

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
}

async function initRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v0-chaos-repo-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@evolveloop.local"]);
  git(root, ["config", "user.name", "EvolveLoop Test"]);
  writeFileSync(path.join(root, "README.md"), "# chaos fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "init"]);
  return root;
}

describe("V0-TEST-C chaos — SIGKILL + Reconciler", () => {
  let tmp: string;
  let repo: string;
  let db: StateDb;

  beforeEach(async () => {
    repo = await initRepo();
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-chaos-"));
    db = new StateDb(path.join(tmp, ".evolveloop", "state.db"));
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(repo, { recursive: true, force: true }).catch(() => undefined);
  });

  it("SIGKILL mid RUNNING: escalates kill; zero orphans in owned pgid", async () => {
    // Detached group with a long-running child (simulates DELEGATING/RUNNING worker).
    const { child, identity } = spawnSupervised({
      argv: [
        "bash",
        "-lc",
        "sleep 120 & sleep 120 & wait",
      ],
    });
    expect(identity).toBeTruthy();
    const owned = [identity!];

    const kill = await cancelProcessTreeEscalating(identity!, { grace_ms: 100 });
    expect(kill.signalled).toBe(true);

    // Wait briefly for /proc to settle.
    await new Promise((r) => setTimeout(r, 150));
    const orphans = listOrphans(owned);
    expect(orphans.live).toHaveLength(0);
    expect(orphans.live.every((id) => id.pgid === identity!.pgid)).toBe(true);

    await new Promise<void>((resolve) => {
      if (child.exitCode != null || child.killed) resolve();
      else child.once("exit", () => resolve());
      setTimeout(resolve, 2000);
    });
  });

  it("dead pgid + dirty worktree → UNKNOWN; never blind retry", () => {
    const wt = path.join(tmp, "dirty-wt");
    mkdirSync(wt, { recursive: true });
    git(repo, ["worktree", "add", "--detach", wt, "HEAD"]);
    writeFileSync(path.join(wt, "partial-effect.txt"), "dirty\n");

    const decision = decideReconcile({
      work_id: "w-chaos",
      task_id: "t-running",
      state: "IN_PROGRESS",
      payload: { pgid: 999999991, worktree_path: wt, mso_phase: "DELEGATING" },
    });
    expect(decision.next_state).toBe("UNKNOWN");
    expect(decision.auto_retry_allowed).toBe(false);
    expect(decision.worktree_dirty).toBe(true);
    expect(mayAutoRetryTask("UNKNOWN")).toBe(false);
    expect(() => assertNotBlindRetry("UNKNOWN", "t-running")).toThrow(/BLIND_RETRY_FORBIDDEN/);
  });

  it("dead pgid + clean worktree → FAILED; safely requeued (auto_retry_allowed)", () => {
    const wt = path.join(tmp, "clean-wt");
    mkdirSync(wt, { recursive: true });
    git(repo, ["worktree", "add", "--detach", wt, "HEAD"]);
    expect(existsSync(wt)).toBe(true);

    const decision = decideReconcile({
      work_id: "w-chaos",
      task_id: "t-clean",
      state: "IN_PROGRESS",
      payload: { pgid: 999999992, worktree_path: wt, mso_phase: "RUNNING" },
    });
    expect(decision.next_state).toBe("FAILED");
    expect(decision.worktree_dirty).toBe(false);
    expect(decision.auto_retry_allowed).toBe(true);
    expect(mayAutoRetryTask("FAILED")).toBe(true);
    expect(() => assertNotBlindRetry("FAILED", "t-clean")).not.toThrow();

    db.upsertTaskGraphNode({
      work_id: "w-chaos",
      task_id: "t-clean",
      state: "IN_PROGRESS",
      payload: { pgid: 999999992, worktree_path: wt },
    });
    const report = reconcileWorkOnBoot(db, "w-chaos");
    const node = db.listTaskGraphNodes("w-chaos").find((n) => n.task_id === "t-clean");
    expect(node?.state).toBe("FAILED");
    expect(node?.payload.auto_retry_allowed).toBe(true);
    expect(report.unknown_tasks).not.toContain("t-clean");
  });
});
