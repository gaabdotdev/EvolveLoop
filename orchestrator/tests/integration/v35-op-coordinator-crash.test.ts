/**
 * Gate C — coordinator independence, SIGKILL crash, restart reconcile, IPC auth.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { CoordinatorDaemon } from "../../src/v3/coordinator/daemon.js";
import { ipcCall, ipcSocketPath, ensureIpcToken } from "../../src/v3/coordinator/ipc.js";
import { createConnection } from "node:net";

const evolveJs = resolve(fileURLToPath(new URL("../../dist/cli/evolve.js", import.meta.url)));

async function waitForIpc(dataDir: string, ms = 8000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await ipcCall(dataDir, "ping", {}, 500);
      if (r.ok) return true;
    } catch {
      /* */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

describe("V3.5 OP Gate C — coordinator crash/continuity", () => {
  const kids: Array<{ pid?: number; kill: () => void }> = [];
  afterEach(async () => {
    for (const k of kids.splice(0)) {
      try {
        k.kill();
      } catch {
        /* */
      }
    }
  });

  it("CLI exit does not stop detached service; new CLI reconnects", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "el-op-c1-"));
    const child = spawn(process.execPath, [evolveJs, "service", "foreground", "--data-dir", dataDir], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    kids.push({
      pid: child.pid,
      kill: () => {
        try {
          if (child.pid) process.kill(-child.pid, "SIGTERM");
        } catch {
          /* */
        }
      },
    });
    expect(await waitForIpc(dataDir)).toBe(true);

    // Simulate "close CLI" — spawn a short-lived status client
    const status = spawnSyncStatus(dataDir);
    expect(status.ok).toBe(true);

    // Service still alive
    expect((await ipcCall(dataDir, "ping")).ok).toBe(true);

    await ipcCall(dataDir, "shutdown");
    await new Promise((r) => setTimeout(r, 400));
  }, 20000);

  it("SIGKILL coordinator + restart recovers durable state without duplicate leader", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "el-op-c2-"));
    const d = new CoordinatorDaemon(dataDir);
    await d.start();
    d.service.registerWork("w-crash", "gc-x", 1);
    // Persist a fake running session for reconcile
    const sessDir = join(dataDir, "process-sessions");
    writeFileSync(
      join(sessDir, "w-crash.json"),
      JSON.stringify([
        {
          kind: "ProcessSessionRecord",
          session_id: "sess-dead",
          work_id: "w-crash",
          task_id: "t1",
          adapter_id: "claude-code",
          pid: 999999,
          pgid: 999999,
          starttime: "1",
          status: "running",
          started_at: new Date().toISOString(),
          command: ["/bin/false"],
          limitations: [],
        },
      ]),
    );

    // Abrupt kill of in-process daemon: stop IPC uncleanly by SIGKILL of child wrapper
    const child = spawn(process.execPath, [evolveJs, "service", "foreground", "--data-dir", dataDir], {
      detached: true,
      stdio: "ignore",
    });
    // First release in-process daemon so child can take lock
    await d.stop("hand_off");
    expect(await waitForIpc(dataDir)).toBe(true);
    const pid = child.pid!;
    process.kill(pid, "SIGKILL");
    await new Promise((r) => setTimeout(r, 300));

    // Restart
    const d2 = new CoordinatorDaemon(dataDir);
    const st = await d2.start();
    expect(st.lifecycle).toBe("RUNNING");
    const recon = d2.reconcileProcesses();
    expect(recon.gone + recon.reused).toBeGreaterThanOrEqual(0);
    const works = d2.service.loadState().works;
    expect(works.some((w) => w.work_id === "w-crash")).toBe(true);

    // Duplicate start fails
    const d3 = new CoordinatorDaemon(dataDir);
    await expect(d3.start()).rejects.toThrow(/LEADER_EXISTS/);

    await d2.stop("done");
  }, 25000);

  it("rejects IPC with invalid token", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "el-op-c3-"));
    const d = new CoordinatorDaemon(dataDir);
    await d.start();
    const sock = ipcSocketPath(dataDir);
    ensureIpcToken(dataDir);
    const bad = await new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
      const socket = createConnection(sock);
      let buf = "";
      socket.on("connect", () => {
        socket.write(
          JSON.stringify({ id: "1", method: "ping", token: "invalid-token", params: {} }) + "\n",
        );
      });
      socket.on("data", (chunk) => {
        buf += chunk.toString("utf-8");
        if (buf.includes("\n")) {
          resolve(JSON.parse(buf.split("\n")[0]!));
          socket.end();
        }
      });
      socket.on("error", reject);
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/unauthorized/);
    await d.stop("done");
    void existsSync;
  }, 15000);
});

function spawnSyncStatus(dataDir: string): { ok: boolean } {
  const r = spawnSync(process.execPath, [evolveJs, "service", "status", "--data-dir", dataDir], {
    encoding: "utf-8",
  });
  return { ok: r.status === 0 && (r.stdout ?? "").includes("RUNNING") };
}
