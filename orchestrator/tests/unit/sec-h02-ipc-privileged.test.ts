import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";
import { randomBytes } from "node:crypto";
import { CoordinatorDaemon } from "../../src/v3/coordinator/daemon.js";
import {
  ensureIpcToken,
  ensureIpcPrivilegedToken,
  ipcSocketPath,
  IPC_PRIVILEGED_METHODS,
} from "../../src/v3/coordinator/ipc.js";

async function rawIpc(
  dataDir: string,
  method: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const sockPath = ipcSocketPath(dataDir);
  const id = randomBytes(4).toString("hex");
  return new Promise((resolve, reject) => {
    const socket = createConnection(sockPath);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("timeout"));
    }, 3000);
    let buf = "";
    socket.on("connect", () => {
      socket.write(JSON.stringify({ id, method, params: {}, token }) + "\n");
    });
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf-8");
      if (buf.includes("\n")) {
        clearTimeout(timer);
        resolve(JSON.parse(buf.split("\n")[0]!));
        socket.end();
      }
    });
    socket.on("error", reject);
  });
}

describe("ISSUE-SEC-H02-IPC privileged method split", () => {
  let dir: string | undefined;
  let daemon: CoordinatorDaemon | undefined;

  afterEach(async () => {
    if (daemon) {
      try {
        await daemon.stop("test_cleanup");
      } catch {
        /* already stopped */
      }
      daemon = undefined;
    }
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it("lists privileged methods", () => {
    expect(IPC_PRIVILEGED_METHODS.has("approvals.approve")).toBe(true);
    expect(IPC_PRIVILEGED_METHODS.has("shutdown")).toBe(true);
    expect(IPC_PRIVILEGED_METHODS.has("ping")).toBe(false);
  });

  it("rejects operator token on privileged methods; accepts privileged token", async () => {
    dir = mkdtempSync(join(tmpdir(), "el-h02-"));
    daemon = new CoordinatorDaemon(dir);
    await daemon.start();
    const op = ensureIpcToken(dir);
    const priv = ensureIpcPrivilegedToken(dir);
    expect(op).not.toBe(priv);

    const denied = await rawIpc(dir, "shutdown", op);
    expect(denied.ok).toBe(false);
    expect(denied.error).toBe("unauthorized_privileged_method");

    const ping = await rawIpc(dir, "ping", op);
    expect(ping.ok).toBe(true);

    const allowed = await rawIpc(dir, "approvals.list", op);
    expect(allowed.ok).toBe(true);

    // Privileged approve path auth (empty id may error in handler, but must not be unauthorized)
    const privGate = await rawIpc(dir, "approvals.approve", priv);
    expect(privGate.error).not.toBe("unauthorized_privileged_method");
    expect(privGate.error).not.toBe("unauthorized");
  });
});
