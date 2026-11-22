/**
 * V0-ORCH-04/05/06/07 — TaskGraph worktree topo, boot reconciler, circuit breaker, inbox.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { StateDb } from "../../src/v3/state-db/index.js";
import {
  assertNotBlindRetry,
  assertStrictlyDisjoint,
  canAttempt,
  classifyFailure,
  CIRCUIT_BREAKER_MAX_ATTEMPTS,
  createCircuitBreaker,
  decideReconcile,
  executeTaskGraph,
  mayAutoRetryTask,
  pathsOverlap,
  receiveInboxMessage,
  reconcileWorkOnBoot,
  recordCircuitFailure,
  topologicalOrder,
  MsoError,
} from "../../src/v3/mso/index.js";

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
}

async function initRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "v0-orch-repo-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@evolveloop.local"]);
  git(root, ["config", "user.name", "EvolveLoop Test"]);
  writeFileSync(path.join(root, "README.md"), "# fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "init"]);
  return root;
}

describe("V0-ORCH-04 topo + worktree execution", () => {
  let repo: string;
  let tmp: string;
  let db: StateDb;

  beforeEach(async () => {
    repo = await initRepo();
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-orch-rt-"));
    db = new StateDb(path.join(tmp, ".evolveloop", "state.db"));
  });

  afterEach(async () => {
    db.close();
    // Best-effort cleanup; avoid rm -rf of paths outside tmp/repo.
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(repo, { recursive: true, force: true }).catch(() => undefined);
  });

  it("topologicalOrder is deterministic and rejects cycles", () => {
    expect(
      topologicalOrder([
        { task_id: "c", depends_on: ["a", "b"] },
        { task_id: "b", depends_on: ["a"] },
        { task_id: "a" },
      ]),
    ).toEqual(["a", "b", "c"]);

    expect(() =>
      topologicalOrder([
        { task_id: "a", depends_on: ["b"] },
        { task_id: "b", depends_on: ["a"] },
      ]),
    ).toThrow(MsoError);
  });

  it("strictly disjoint rejects overlapping touch_paths", () => {
    expect(pathsOverlap("src/a", "src/a/b")).toBe(true);
    expect(pathsOverlap("src/a", "src/b")).toBe(false);
    try {
      assertStrictlyDisjoint([
        { task_id: "t1", touch_paths: ["src/foo"] },
        { task_id: "t2", touch_paths: ["src/foo/bar"] },
      ]);
      expect.fail("expected DISJOINT_OVERLAP");
    } catch (err) {
      expect(err).toBeInstanceOf(MsoError);
      expect((err as MsoError).code).toBe("DISJOINT_OVERLAP");
    }
    assertStrictlyDisjoint([
      { task_id: "t1", touch_paths: ["src/foo"] },
      { task_id: "t2", touch_paths: ["src/bar"] },
    ]);
  });

  it("executes TaskGraph sequentially with dedicated worktree per task", async () => {
    const seen: string[] = [];
    const report = await executeTaskGraph({
      db,
      workspace_id: "ws-1",
      work_id: "w-topo",
      repo_root: repo,
      worktrees_base: path.join(tmp, "wts"),
      mode: "sequential",
      tasks: [
        { task_id: "t-a" },
        { task_id: "t-b", depends_on: ["t-a"] },
      ],
      runTask: async (ctx) => {
        seen.push(ctx.task_id);
        expect(existsSync(ctx.worktree_path)).toBe(true);
        expect(ctx.worktree_path).toContain(ctx.task_id);
        writeFileSync(path.join(ctx.worktree_path, `${ctx.task_id}.txt`), "ok\n");
        return { ok: true, pgid: process.pid };
      },
    });

    expect(report.order).toEqual(["t-a", "t-b"]);
    expect(seen).toEqual(["t-a", "t-b"]);
    expect(report.tasks.every((t) => t.state === "TRUE_PASS")).toBe(true);
    expect(report.tasks[0]!.worktree_path).not.toBe(report.tasks[1]!.worktree_path);

    const nodes = db.listTaskGraphNodes("w-topo");
    expect(nodes.map((n) => n.state)).toEqual(["TRUE_PASS", "TRUE_PASS"]);
  });
});

describe("V0-ORCH-05 boot reconciler — UNKNOWN never auto-retried", () => {
  let tmp: string;
  let db: StateDb;
  let repo: string;

  beforeEach(async () => {
    repo = await initRepo();
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-orch-rec-"));
    db = new StateDb(path.join(tmp, ".evolveloop", "state.db"));
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(repo, { recursive: true, force: true }).catch(() => undefined);
  });

  it("dead pgid + dirty worktree → UNKNOWN; auto_retry_allowed=false", () => {
    const wt = path.join(tmp, "dirty-wt");
    mkdirSync(wt, { recursive: true });
    git(repo, ["worktree", "add", "--detach", wt, "HEAD"]);
    writeFileSync(path.join(wt, "partial.txt"), "partial effect\n");

    const decision = decideReconcile({
      work_id: "w1",
      task_id: "t-partial",
      state: "IN_PROGRESS",
      payload: { pgid: 999999999, worktree_path: wt },
    });
    expect(decision.next_state).toBe("UNKNOWN");
    expect(decision.auto_retry_allowed).toBe(false);
    expect(decision.worktree_dirty).toBe(true);
    expect(mayAutoRetryTask("UNKNOWN")).toBe(false);
    expect(() => assertNotBlindRetry("UNKNOWN", "t-partial")).toThrow(/BLIND_RETRY_FORBIDDEN/);
  });

  it("reconcileWorkOnBoot persists UNKNOWN and executor skips it", async () => {
    const wt = path.join(tmp, "boot-wt");
    mkdirSync(wt, { recursive: true });
    git(repo, ["worktree", "add", "--detach", wt, "HEAD"]);
    writeFileSync(path.join(wt, "leftover.txt"), "x\n");

    db.upsertTaskGraphNode({
      work_id: "w-boot",
      task_id: "t-unk",
      state: "IN_PROGRESS",
      payload: { pgid: 999999999, worktree_path: wt },
    });
    db.upsertTaskGraphNode({
      work_id: "w-boot",
      task_id: "t-ok",
      state: "PENDING",
      payload: {},
    });

    const report = reconcileWorkOnBoot(db, "w-boot");
    expect(report.unknown_tasks).toContain("t-unk");
    expect(db.listTaskGraphNodes("w-boot").find((n) => n.task_id === "t-unk")?.state).toBe("UNKNOWN");

    let ran: string[] = [];
    const exec = await executeTaskGraph({
      db,
      workspace_id: "ws-boot",
      work_id: "w-boot",
      repo_root: repo,
      worktrees_base: path.join(tmp, "wts"),
      tasks: [{ task_id: "t-unk" }, { task_id: "t-ok" }],
      runTask: async (ctx) => {
        ran.push(ctx.task_id);
        return { ok: true };
      },
    });

    expect(ran).toEqual(["t-ok"]);
    expect(exec.tasks.find((t) => t.task_id === "t-unk")?.state).toBe("UNKNOWN");
    expect(db.listTaskGraphNodes("w-boot").find((n) => n.task_id === "t-unk")?.state).toBe("UNKNOWN");
  });
});

describe("V0-ORCH-06 failure buckets + circuit breaker (3)", () => {
  it("classifies into exactly three rigid buckets", () => {
    expect(classifyFailure({ code: "ETIMEDOUT" })).toBe("INFRA_QUOTA");
    expect(classifyFailure({ message: "rate_limit exceeded", http_status: 429 })).toBe("INFRA_QUOTA");
    expect(classifyFailure({ code: "AUTHORITY_DENIED" })).toBe("POLICY_AUTHORITY");
    expect(classifyFailure({ http_status: 403 })).toBe("POLICY_AUTHORITY");
    expect(classifyFailure({ exit_code: 1, message: "assert failed" })).toBe("EXEC_CODE");
  });

  it("opens circuit at 3 attempts", () => {
    let cb = createCircuitBreaker("t1");
    expect(CIRCUIT_BREAKER_MAX_ATTEMPTS).toBe(3);
    expect(canAttempt(cb)).toBe(true);
    cb = recordCircuitFailure(cb, "EXEC_CODE", "fail-1");
    cb = recordCircuitFailure(cb, "EXEC_CODE", "fail-2");
    expect(cb.open).toBe(false);
    expect(canAttempt(cb)).toBe(true);
    cb = recordCircuitFailure(cb, "EXEC_CODE", "fail-3");
    expect(cb.attempts).toBe(3);
    expect(cb.open).toBe(true);
    expect(canAttempt(cb)).toBe(false);
  });

  it("executeTaskGraph opens CIRCUIT_OPEN after 3 failures", async () => {
    const repo = await initRepo();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-orch-cb-"));
    const db = new StateDb(path.join(tmp, ".evolveloop", "state.db"));
    try {
      let calls = 0;
      const report = await executeTaskGraph({
        db,
        workspace_id: "ws-cb",
        work_id: "w-cb",
        repo_root: repo,
        worktrees_base: path.join(tmp, "wts"),
        tasks: [{ task_id: "flaky" }],
        runTask: async () => {
          calls += 1;
          return { ok: false, failure: { code: "ASSERT", message: `boom-${calls}` } };
        },
      });
      expect(calls).toBe(3);
      expect(report.tasks[0]?.state).toBe("CIRCUIT_OPEN");
      expect(report.tasks[0]?.circuit_open).toBe(true);
      expect(report.tasks[0]?.attempts).toBe(3);
      expect(db.listTaskGraphNodes("w-cb")[0]?.state).toBe("CIRCUIT_OPEN");
      expect(mayAutoRetryTask("CIRCUIT_OPEN")).toBe(false);
    } finally {
      db.close();
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
      await fs.rm(repo, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});

describe("V0-ORCH-07 inbox_messages during execution", () => {
  it("persists inbox messages received mid-execution", async () => {
    const repo = await initRepo();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-orch-inbox-"));
    const db = new StateDb(path.join(tmp, ".evolveloop", "state.db"));
    try {
      const report = await executeTaskGraph({
        db,
        workspace_id: "ws-inbox",
        session_id: "sess-1",
        work_id: "w-inbox",
        repo_root: repo,
        worktrees_base: path.join(tmp, "wts"),
        tasks: [{ task_id: "t1" }],
        runTask: async (ctx) => {
          ctx.receiveInbox("status_query", { text: "como vai?" });
          receiveInboxMessage(db, {
            workspace_id: "ws-inbox",
            session_id: "sess-1",
            kind: "operational_directive",
            body: { text: "pausar após esta tarefa" },
          });
          return { ok: true };
        },
      });

      expect(report.inbox_received).toBe(1);
      const msgs = db.listInboxMessages("ws-inbox");
      expect(msgs.length).toBe(2);
      expect(msgs[0]?.kind).toBe("status_query");
      expect(msgs[0]?.body.during_execution).toBe(true);
      expect(msgs[1]?.kind).toBe("operational_directive");
      expect(msgs[1]?.body.received_during_execution).toBe(true);

      // Survive reopen
      db.close();
      const db2 = new StateDb(path.join(tmp, ".evolveloop", "state.db"));
      expect(db2.listInboxMessages("ws-inbox")).toHaveLength(2);
      db2.close();
    } finally {
      try {
        db.close();
      } catch {
        /* already closed */
      }
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
      await fs.rm(repo, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
