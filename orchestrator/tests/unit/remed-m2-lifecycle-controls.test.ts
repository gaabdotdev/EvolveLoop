/**
 * REMED-M2 — Real pause / resume / cancel against live fixture processes.
 * No mocks of SIGSTOP/SIGCONT/SIGTERM; identity fence required.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cancelOwnedRuns,
  pauseOwnedRuns,
  registerOwnedProcessSession,
  resumeOwnedRuns,
} from "../../src/v3/lifecycle/run-controls.js";
import { ProcessSessionStore } from "../../src/v3/adapters/drivers/process-sessions.js";
import {
  identifyProcess,
  isProcessLive,
  isProcessStopped,
  sameProcess,
  sleepMs,
} from "../../src/v3/sandbox/process-supervisor.js";
import {
  clearJourneyPauseOnCancel,
  getJourneyPause,
  pauseJourneyTask,
  resumeJourneyTask,
} from "../../src/cli/tui/journey-pause.js";
import { taskControlMessage } from "../../src/cli/tui/task-controls.js";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { defaultWorkspaceV3DataDir } from "../../src/v3/agent-handles/list-view.js";

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

describe.skipIf(!POSIX_PROC)("REMED-M2 real execution lifecycle", () => {
  let ws: string;
  let workId: string;
  let sessionId: string;
  let child: ChildProcess | undefined;
  let starttime: string | undefined;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), "remed-m2-"));
    workId = `work-m2-${Date.now()}`;
    sessionId = `sess-m2-${Date.now()}`;
    child = undefined;
    starttime = undefined;
  });

  afterEach(() => {
    try {
      if (child?.pid) forceKillSafe(child.pid, starttime);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("1–8 start→running→pause→stopped→resume→running→cancel→dead", () => {
    // 1 start
    child = spawnFixture();
    expect(child.pid).toBeTruthy();
    sleepMs(40);
    const id = identifyProcess(child.pid!);
    expect(id).toBeTruthy();
    starttime = id!.starttime;

    // register owned (maps Task/Work → ProcessSession + PID fence)
    const rec = registerOwnedProcessSession({
      workspace: ws,
      work_id: workId,
      task_id: "task-m2",
      session_id: sessionId,
      adapter_id: "cursor",
      agent_id: "agent-fixture",
      pid: child.pid!,
      command: [process.execPath, "-e", "fixture"],
    });
    expect(rec.status).toBe("running");
    expect(rec.starttime).toBeTruthy();
    starttime = rec.starttime;

    // 2 running
    expect(sameProcess(id!)).toBe(true);
    expect(isProcessStopped(id!)).toBe(false);

    // 3 pause
    const paused = pauseOwnedRuns({ workspace: ws, work_id: workId });
    expect(paused.ok).toBe(true);
    expect(paused.sessions[0]?.ok).toBe(true);
    expect(paused.sessions[0]?.operational_stopped).toBe(true);

    // 4 stopped
    expect(isProcessStopped(id!)).toBe(true);
    const store = new ProcessSessionStore(
      resolveV3DataPaths(defaultWorkspaceV3DataDir(ws)).processSessionsDir,
    );
    expect(store.load(workId).find((s) => s.session_id === sessionId)?.status).toBe(
      "paused",
    );

    // 5 resume
    const resumed = resumeOwnedRuns({ workspace: ws, work_id: workId });
    expect(resumed.ok).toBe(true);
    expect(resumed.sessions[0]?.ok).toBe(true);

    // 6 running
    sleepMs(40);
    expect(sameProcess(id!)).toBe(true);
    expect(isProcessStopped(id!)).toBe(false);
    expect(store.reconcile(workId).find((s) => s.session_id === sessionId)?.status).toBe(
      "running",
    );

    // 7 cancel
    const cancelled = cancelOwnedRuns({ workspace: ws, work_id: workId });
    expect(cancelled.ok).toBe(true);
    expect(cancelled.sessions[0]?.ok).toBe(true);
    expect(cancelled.sessions[0]?.status).toBe("cancelled");

    // 8 dead (zombie unreaped still has /proc — not live)
    sleepMs(50);
    expect(isProcessLive(id!)).toBe(false);
    child = undefined; // terminated — afterEach forceKill is no-op if gone/zombie
  });

  it("9 resume processo inexistente → fail", () => {
    const store = new ProcessSessionStore(
      resolveV3DataPaths(defaultWorkspaceV3DataDir(ws)).processSessionsDir,
    );
    expect(() => store.resume(workId, "sess-does-not-exist")).toThrow(
      /SESSION_NOT_FOUND/,
    );
    const r = resumeOwnedRuns({ workspace: ws, work_id: workId });
    expect(r.ok).toBe(false);
    expect(r.no_live_targets).toBe(true);
  });

  it("10 PID/identidade inválida → rejeita", () => {
    child = spawnFixture();
    sleepMs(40);
    const id = identifyProcess(child.pid!);
    expect(id).toBeTruthy();
    starttime = id!.starttime;

    const store = new ProcessSessionStore(
      resolveV3DataPaths(defaultWorkspaceV3DataDir(ws)).processSessionsDir,
    );
    store.upsert({
      kind: "ProcessSessionRecord",
      session_id: sessionId,
      work_id: workId,
      task_id: "task-m2",
      adapter_id: "cursor",
      pid: child.pid,
      pgid: child.pid,
      starttime: "0", // wrong fence → reuse guard
      status: "running",
      started_at: new Date().toISOString(),
      command: ["fake"],
      limitations: ["test_bad_fence"],
    });

    const paused = store.pause(workId, sessionId);
    expect(paused.status).not.toBe("paused");
    expect(paused.limitations.some((l) => /pid_reuse|gone/.test(l))).toBe(true);
    // Fixture still alive — identity mismatch must not SIGSTOP the live process.
    expect(isProcessStopped(id!)).toBe(false);

    const resumed = store.resume(workId, sessionId);
    expect(resumed.status).not.toBe("running");
    expect(
      resumed.limitations.some((l) => /refused_status|pid_reuse|gone/.test(l)),
    ).toBe(true);
  });

  it("11 CLI restart com pause persistido", () => {
    const p1 = pauseJourneyTask(ws, "cli");
    expect(p1.paused).toBe(true);
    // Simulate other process / CLI reopen reading StateDb only
    const again = getJourneyPause(ws);
    expect(again.paused).toBe(true);
    expect(again.paused_at).toBe(p1.paused_at);
    const r = resumeJourneyTask(ws, "cli");
    expect(r.paused).toBe(false);
    expect(getJourneyPause(ws).paused).toBe(false);
  });

  it("12 detach ≠ cancel — processo overvive sem cancelOwnedRuns", () => {
    child = spawnFixture();
    sleepMs(40);
    const id = identifyProcess(child.pid!);
    expect(id).toBeTruthy();
    starttime = id!.starttime;

    registerOwnedProcessSession({
      workspace: ws,
      work_id: workId,
      task_id: "task-m2",
      session_id: sessionId,
      adapter_id: "cursor",
      pid: child.pid!,
      command: [process.execPath, "-e", "fixture"],
    });

    // Detach semantics: leave TUI without cancel (message contract).
    const detachMsg = taskControlMessage("detach");
    expect(detachMsg.destructive).toBe(false);
    expect(detachMsg.message_pt).toMatch(/≠|sem cancel|sem matar/i);
    const interruptMsg = taskControlMessage("interrupt");
    expect(interruptMsg.destructive).toBe(true);
    expect(interruptMsg.message_pt).toMatch(/Ctrl\+C/);

    // Explicitly NOT calling cancelOwnedRuns / clearJourneyPauseOnCancel.
    expect(sameProcess(id!)).toBe(true);
    const store = new ProcessSessionStore(
      resolveV3DataPaths(defaultWorkspaceV3DataDir(ws)).processSessionsDir,
    );
    expect(store.load(workId)[0]?.status).toBe("running");

    // Contrast: confirmed cancel kills.
    const cancelled = clearJourneyPauseOnCancel(ws, "tui");
    expect(cancelled.run_control?.ok).toBe(true);
    sleepMs(50);
    expect(isProcessLive(id!)).toBe(false);
    child = undefined;
  });
});
