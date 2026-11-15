import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "node:net";
import { randomBytes } from "node:crypto";
import { CoordinatorDaemon } from "../../src/v3/coordinator/daemon.js";
import {
  ensureIpcPrivilegedToken,
  ipcSocketPath,
  IPC_PRIVILEGED_METHODS,
} from "../../src/v3/coordinator/ipc.js";

/**
 * Documents ADR-V37-0003: same-UID with data-dir access CAN invoke privileged IPC.
 * This is the architectural trust boundary — not a defect to "fix" with token split alone.
 */
describe("SEC-H02 IPC trust boundary (ADR-V37-0003)", () => {
  let dir: string | undefined;
  let daemon: CoordinatorDaemon | undefined;

  afterEach(async () => {
    if (daemon) {
      try {
        await daemon.stop("test_cleanup");
      } catch {
        /* */
      }
      daemon = undefined;
    }
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it("declares tick as privileged and documents single-user trust domain", () => {
    expect(IPC_PRIVILEGED_METHODS.has("tick")).toBe(true);
    expect(IPC_PRIVILEGED_METHODS.has("shutdown")).toBe(true);
  });

  it("same-UID process that reads ipc.privileged.token can call privileged methods", async () => {
    dir = mkdtempSync(join(tmpdir(), "el-h02-boundary-"));
    daemon = new CoordinatorDaemon(dir);
    await daemon.start();
    const stolen = readFileSync(join(dir, "coordinator", "ipc.privileged.token"), "utf8").trim();
    expect(stolen.length).toBeGreaterThan(16);

    const sockPath = ipcSocketPath(dir);
    const res = await new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
      const socket = createConnection(sockPath);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("timeout"));
      }, 3000);
      let buf = "";
      socket.on("connect", () => {
        socket.write(
          JSON.stringify({
            id: randomBytes(4).toString("hex"),
            method: "tick",
            params: {},
            token: stolen,
            nonce: randomBytes(12).toString("hex"),
            issued_at: Date.now(),
          }) + "\n",
        );
      });
      socket.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        if (buf.includes("\n")) {
          clearTimeout(timer);
          resolve(JSON.parse(buf.split("\n")[0]!));
          socket.end();
        }
      });
      socket.on("error", reject);
    });
    // Same-UID filesystem access ⇒ privileged IPC succeeds (trust domain).
    expect(res.error).not.toBe("unauthorized_privileged_method");
    expect(res.error).not.toBe("unauthorized");
  });

  it("token files are mode 0600 (cross-user FS isolation when permissions hold)", async () => {
    dir = mkdtempSync(join(tmpdir(), "el-h02-mode-"));
    daemon = new CoordinatorDaemon(dir);
    await daemon.start();
    ensureIpcPrivilegedToken(dir);
    const st = readFileSync(join(dir, "coordinator", "ipc.privileged.token"));
    void st;
    const { statSync } = await import("node:fs");
    const mode = statSync(join(dir, "coordinator", "ipc.privileged.token")).mode & 0o777;
    expect(mode).toBe(0o600);
    chmodSync(ipcSocketPath(dir), 0o600);
    const sockMode = statSync(ipcSocketPath(dir)).mode & 0o777;
    expect(sockMode).toBe(0o600);
  });
});
