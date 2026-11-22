/**
 * V5-M02 — Attempt ↔ ProcessSession / ExecutionRunnerResult binding.
 * Real ProcessSession records + live fixture process where POSIX /proc exists.
 */
import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProcessSessionStore } from "../../src/v3/adapters/drivers/process-sessions.js";
import {
  identifyProcess,
  sameProcess,
  sleepMs,
} from "../../src/v3/sandbox/process-supervisor.js";
import { STATE_DB_SCHEMA_VERSION } from "../../src/v3/state-db/schema.js";
import {
  PersistentWorkRuntime,
  WorkRuntimeError,
  attemptStatusFromRunnerResult,
} from "../../src/v3/work-runtime/index.js";

const POSIX_PROC = existsSync("/proc/self/stat");

function spawnFixture(): ChildProcess {
  const child = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 250)"],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  return child;
}

function forceKillSafe(pid: number | undefined, starttime?: string): void {
  if (pid == null) return;
  if (starttime) {
    if (
      !sameProcess({
        pid,
        pgid: pid,
        starttime,
        cmdline: "",
      })
    ) {
      return;
    }
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

describe("V5-M02 Attempt binding", () => {
  const dirs: string[] = [];
  const children: Array<{ pid?: number; starttime?: string }> = [];

  afterEach(() => {
    for (const c of children.splice(0)) {
      forceKillSafe(c.pid, c.starttime);
    }
    for (const d of dirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  function freshWorkspace(tag: string): string {
    const ws = mkdtempSync(join(tmpdir(), `v5-m02-${tag}-`));
    dirs.push(ws);
    return ws;
  }

  it("schema v8 exposes executor_id + adapter_id; create/list/get", () => {
    expect(STATE_DB_SCHEMA_VERSION).toBe("8");
    const ws = freshWorkspace("crud");
    const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
    rt.open({
      work_id: "w-crud",
      objective: "attempt crud",
      tasks: [{ task_id: "t1", title: "T1" }],
    });
    const a = rt.createAttempt({
      work_id: "w-crud",
      task_id: "t1",
      agent_id: "ag-1",
      executor_id: "ag-1",
      adapter_id: "claude-code",
      execution_mode: "harness",
      status: "pending",
      idempotency_key: "k-crud",
    });
    expect(a.executor_id).toBe("ag-1");
    expect(a.adapter_id).toBe("claude-code");
    expect(a.execution_mode).toBe("harness");
    expect(rt.getAttempt(a.attempt_id).attempt_id).toBe(a.attempt_id);
    expect(rt.listAttempts("w-crud")).toHaveLength(1);
    expect(() => rt.getAttempt("missing")).toThrow(WorkRuntimeError);
    rt.close();
  });

  it("bindProcessSession links real ProcessSession (harness mode)", () => {
    const ws = freshWorkspace("sess");
    const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
    rt.open({
      work_id: "w-sess",
      objective: "session bind",
      tasks: [{ task_id: "t-run", title: "Run" }],
    });
    const store = new ProcessSessionStore(rt.paths.processSessionsDir);
    const session_id = "sess-bind-1";
    store.upsert({
      kind: "ProcessSessionRecord",
      session_id,
      work_id: "w-sess",
      task_id: "t-run",
      adapter_id: "claude-code",
      agent_id: "ag-sess",
      status: "running",
      started_at: new Date().toISOString(),
      command: ["echo", "fixture"],
      limitations: [],
    });

    const attempt = rt.createAttempt({
      work_id: "w-sess",
      task_id: "t-run",
      execution_mode: "unknown",
      status: "pending",
    });
    const bound = rt.bindProcessSession({
      attempt_id: attempt.attempt_id,
      process_session_id: session_id,
    });
    expect(bound.process_session_id).toBe(session_id);
    expect(bound.execution_mode).toBe("harness");
    expect(bound.status).toBe("running");
    expect(bound.adapter_id).toBe("claude-code");
    expect(bound.executor_id).toBe("ag-sess");
    expect(bound.payload.binding).toBe("process_session");

    const viaCreate = rt.createAttemptForSession(store.load("w-sess")[0]!, {
      idempotency_key: "for-sess",
    });
    expect(viaCreate.process_session_id).toBe(session_id);
    expect(viaCreate.execution_mode).toBe("harness");
    rt.close();
  });

  it.skipIf(!POSIX_PROC)(
    "bindProcessSession with live owned process identity (real /proc)",
    () => {
      const ws = freshWorkspace("live");
      const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
      rt.open({
        work_id: "w-live",
        objective: "live session",
        tasks: [{ task_id: "t-live", title: "Live" }],
      });
      const child = spawnFixture();
      expect(child.pid).toBeTruthy();
      sleepMs(40);
      const id = identifyProcess(child.pid!);
      expect(id).toBeTruthy();
      children.push({ pid: child.pid, starttime: id!.starttime });

      const store = new ProcessSessionStore(rt.paths.processSessionsDir);
      const session_id = `sess-live-${child.pid}`;
      store.upsert({
        kind: "ProcessSessionRecord",
        session_id,
        work_id: "w-live",
        task_id: "t-live",
        adapter_id: "claude-code",
        agent_id: "ag-live",
        status: "running",
        started_at: new Date().toISOString(),
        command: [process.execPath, "-e", "setInterval(() => {}, 250)"],
        limitations: [],
        pid: id!.pid,
        pgid: id!.pgid,
        starttime: id!.starttime,
      });
      const sessions = store.load("w-live");
      expect(sessions[0]?.pid).toBe(child.pid);

      const attempt = rt.createAttemptForSession(sessions[0]!);
      expect(attempt.process_session_id).toBe(session_id);
      expect(attempt.status).toBe("running");
      expect(rt.read("w-live").liveness.has_live_process_session).toBe(true);
      rt.close();
    },
  );

  it("bindExecutionResult maps runner status; Attempt fail ≠ Work fail", () => {
    const ws = freshWorkspace("runner");
    const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
    rt.open({
      work_id: "w-run",
      objective: "runner bind",
      tasks: [{ task_id: "t-n", title: "Native" }],
    });
    const attempt = rt.createAttempt({
      work_id: "w-run",
      task_id: "t-n",
      executor_id: "native-exec-1",
      execution_mode: "native",
      status: "running",
    });
    expect(attemptStatusFromRunnerResult("ok")).toBe("succeeded");
    expect(attemptStatusFromRunnerResult("blocked")).toBe("failed");

    const failed = rt.bindExecutionResult({
      attempt_id: attempt.attempt_id,
      run_id: "run-42",
      result: {
        status: "failed",
        exit_code: 1,
        code: "EXIT_NONZERO",
        duration_ms: 12,
        limitations: ["fixture"],
      },
    });
    expect(failed.status).toBe("failed");
    expect(failed.run_id).toBe("run-42");
    expect(failed.execution_mode).toBe("native");
    expect(failed.payload.binding).toBe("execution_runner_result");

    const work = rt.read("w-run");
    expect(work.work_state).toBe("IN_PROGRESS");
    expect(work.work_state).not.toBe("TRUE_FULL_PASS");

    const { attempt: failed2, work: work2 } = rt.failAttempt(
      attempt.attempt_id,
      "explicit_fail",
    );
    expect(failed2.status).toBe("failed");
    expect(work2.work_state).toBe("IN_PROGRESS");
    rt.close();
  });

  it("bindProcessSession refuses unknown or task-mismatched session", () => {
    const ws = freshWorkspace("refuse");
    const rt = new PersistentWorkRuntime({ workspaceRoot: ws });
    rt.open({
      work_id: "w-ref",
      objective: "refuse",
      tasks: [
        { task_id: "t-a", title: "A" },
        { task_id: "t-b", title: "B" },
      ],
    });
    const store = new ProcessSessionStore(rt.paths.processSessionsDir);
    store.upsert({
      kind: "ProcessSessionRecord",
      session_id: "sess-b",
      work_id: "w-ref",
      task_id: "t-b",
      adapter_id: "cursor",
      status: "running",
      started_at: new Date().toISOString(),
      command: ["true"],
      limitations: [],
    });
    const attempt = rt.createAttempt({
      work_id: "w-ref",
      task_id: "t-a",
      status: "pending",
    });
    try {
      rt.bindProcessSession({
        attempt_id: attempt.attempt_id,
        process_session_id: "missing",
      });
      expect.fail("expected SESSION_NOT_FOUND");
    } catch (e) {
      expect(e).toBeInstanceOf(WorkRuntimeError);
      expect((e as WorkRuntimeError).code).toBe("SESSION_NOT_FOUND");
    }
    try {
      rt.bindProcessSession({
        attempt_id: attempt.attempt_id,
        process_session_id: "sess-b",
      });
      expect.fail("expected SESSION_TASK_MISMATCH");
    } catch (e) {
      expect(e).toBeInstanceOf(WorkRuntimeError);
      expect((e as WorkRuntimeError).code).toBe("SESSION_TASK_MISMATCH");
    }
    rt.close();
  });
});
