/**
 * V1-ORCH-01 — Unix Domain Socket daemon with temp sock path.
 */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createEvolveDaemon,
  createEvolveDaemonClient,
} from "../../src/v3/daemon/index.js";

describe("V1-ORCH-01 daemon UDS", () => {
  let tmp: string;
  const daemons: Array<{ stop: () => Promise<void> }> = [];

  afterEach(async () => {
    for (const d of daemons.splice(0)) {
      await d.stop();
    }
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it("listens on temp sock; multiple clients; Ctrl+D disconnect keeps runs", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-orch01-"));
    const sock_path = path.join(tmp, "runtime.sock");
    const daemon = createEvolveDaemon({ sock_path });
    daemons.push(daemon);
    await daemon.start();
    expect(existsSync(sock_path)).toBe(true);

    const c1 = createEvolveDaemonClient(sock_path);
    const c2 = createEvolveDaemonClient(sock_path);
    const c3 = createEvolveDaemonClient(sock_path);
    // Connect sequentially so each accept registers before the next connect
    await c1.connect();
    await c2.connect();
    await c3.connect();
    const deadline = Date.now() + 2000;
    while (daemon.clientCount() < 3 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(daemon.clientCount()).toBeGreaterThanOrEqual(3);

    // Concurrent inbox messages from ≥2 clients (after all terminals attached)
    const concurrent = await Promise.all([
      c1.request({ type: "ping", id: "p1" }),
      c2.request({ type: "ping", id: "p2" }),
      c1.request({ type: "run_start", run_id: "run-keep-alive", id: "r1" }),
      c2.request({ type: "run_start", run_id: "run-peer", id: "r2" }),
      c3.request({ type: "ping", id: "p3" }),
    ]);
    expect(concurrent.every((m) => m.type === "pong" || m.type === "run_started")).toBe(true);
    expect(daemon.activeRuns().map((r) => r.run_id).sort()).toEqual([
      "run-keep-alive",
      "run-peer",
    ]);

    const pong = concurrent.find((m) => m.type === "pong");
    expect(pong?.type).toBe("pong");
    if (pong?.type === "pong") expect(pong.server_id).toBe(daemon.server_id);

    // Simulate Ctrl+D — half-close / disconnect owner of run-keep-alive without killing runs
    c1.sendEof();
    await new Promise((r) => setTimeout(r, 50));
    await c1.disconnect().catch(() => undefined);
    const detachDeadline = Date.now() + 2000;
    while (
      daemon.activeRuns().find((r) => r.run_id === "run-keep-alive")?.owner_client_id != null &&
      Date.now() < detachDeadline
    ) {
      await new Promise((r) => setTimeout(r, 10));
    }

    // Runs must still be alive after client disconnect
    expect(daemon.activeRuns().some((r) => r.run_id === "run-keep-alive")).toBe(true);
    expect(daemon.activeRuns().some((r) => r.run_id === "run-peer")).toBe(true);
    const owner = daemon.activeRuns().find((r) => r.run_id === "run-keep-alive");
    expect(owner?.owner_client_id).toBeNull();

    const status = await c2.request({ type: "status" });
    expect(status.type).toBe("status_ok");
    if (status.type === "status_ok") {
      expect(status.runs).toBeGreaterThanOrEqual(2);
      expect(status.sock_path).toBe(sock_path);
      expect(status.clients).toBeGreaterThanOrEqual(2);
    }

    // Third terminal still operational after peer disconnect
    const still = await c3.request({ type: "ping", id: "alive" });
    expect(still.type).toBe("pong");

    await c2.request({ type: "run_complete", run_id: "run-keep-alive" });
    await c3.request({ type: "run_complete", run_id: "run-peer" });
    expect(daemon.activeRuns().length).toBe(0);
    await c2.disconnect();
    await c3.disconnect();
  });
});
