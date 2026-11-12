import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { CoordinatorDaemon } from "../../src/v3/coordinator/daemon.js";
import { ipcCall, ipcSocketPath } from "../../src/v3/coordinator/ipc.js";
import { LeaderLock } from "../../src/v3/coordinator/leader-lock.js";

const evolveJs = resolve(fileURLToPath(new URL("../../dist/cli/evolve.js", import.meta.url)));

describe("V3.5 coordinator daemon", () => {
  const daemons: CoordinatorDaemon[] = [];
  afterEach(async () => {
    for (const d of daemons.splice(0)) {
      try {
        await d.stop("test_cleanup");
      } catch {
        /* */
      }
    }
  });

  it("starts with IPC and survives client disconnect semantics", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "el-daemon-"));
    const d = new CoordinatorDaemon(dataDir);
    daemons.push(d);
    const st = await d.start();
    expect(st.lifecycle).toBe("RUNNING");
    expect(st.fencing_token).toBeTruthy();

    const ping = await ipcCall(dataDir, "ping");
    expect(ping.ok).toBe(true);
    expect((ping.result as { pong: boolean }).pong).toBe(true);

    // Second leader must fail
    const d2 = new CoordinatorDaemon(dataDir);
    await expect(d2.start()).rejects.toThrow(/LEADER_EXISTS/);

    await d.stop("test");
    expect(d.loadDurable().lifecycle).toBe("STOPPED");
  });

  it("detects stale leader lock via starttime", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "el-lock-"));
    const lockPath = join(dataDir, "leader.lock");
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      lockPath,
      JSON.stringify({
        kind: "CoordinatorLeaderLock",
        pid: 1,
        starttime: "999999999999",
        generation: 1,
        acquired_at: new Date().toISOString(),
        fencing_token: "1:999999999999:1",
      }),
    );
    const lock = new LeaderLock(lockPath);
    const acquired = lock.tryAcquire(2);
    expect(acquired).not.toBeNull();
    lock.release();
  });

  it("CLI child process keeps workflow after parent exit (service start)", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "el-svc-"));
    const child = spawn(process.execPath, [evolveJs, "service", "foreground", "--data-dir", dataDir], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    const sock = ipcSocketPath(dataDir);
    let ready = false;
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        const st = await ipcCall(dataDir, "status");
        if (st.ok) {
          ready = true;
          break;
        }
      } catch {
        /* wait */
      }
    }
    expect(ready).toBe(true);
    // "Close CLI" — we never attached a TUI; status still works from new client
    const again = await ipcCall(dataDir, "ping");
    expect(again.ok).toBe(true);
    await ipcCall(dataDir, "shutdown");
    // give process time to exit
    await new Promise((r) => setTimeout(r, 300));
    void sock;
  }, 15000);
});
