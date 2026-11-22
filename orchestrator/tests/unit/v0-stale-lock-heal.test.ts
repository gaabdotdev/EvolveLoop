/**
 * Fase 4 — auto-cura de stale lock (shell-<pid> morto) vs bloqueio com PID vivo.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StateDb, StateDbError } from "../../src/v3/state-db/store.js";
import {
  extractShellHolderPid,
  isPidAlive,
  isStaleShellHolder,
} from "../../src/v3/state-db/process-alive.js";

describe("stale workspace lock auto-heal", () => {
  let tmp: string;
  let db: StateDb;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-stale-lock-"));
    db = new StateDb(path.join(tmp, "state.db"));
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("extractShellHolderPid + liveness helpers", () => {
    expect(extractShellHolderPid("shell-4242")).toBe(4242);
    expect(extractShellHolderPid("mso-1")).toBeUndefined();
    expect(isPidAlive(process.pid)).toBe(true);
    expect(isPidAlive(999_999_999)).toBe(false);
    expect(isStaleShellHolder("shell-999999999")).toBe(true);
    expect(isStaleShellHolder(`shell-${process.pid}`)).toBe(false);
  });

  it("dead shell PID → reassume lock + increment fencing + on_stale_cleared", () => {
    const deadHolder = "shell-999999999";
    const first = db.acquireWorkspaceLease({
      workspace_id: "ws-stale",
      holder_id: deadHolder,
      lease_ms: 60_000,
    });
    expect(first.fencing_token).toBe(1);

    const logs: string[] = [];
    const stolen = db.acquireWorkspaceLease({
      workspace_id: "ws-stale",
      holder_id: `shell-${process.pid}`,
      lease_ms: 60_000,
      on_stale_cleared: (info) => logs.push(info.message),
    });
    expect(stolen.holder_id).toBe(`shell-${process.pid}`);
    expect(stolen.fencing_token).toBe(2);
    expect(logs[0]).toMatch(/Lock órfão de PID 999999999 limpo automaticamente/);
  });

  it("live shell PID → LEASE_HELD (no steal)", () => {
    const live = `shell-${process.pid}`;
    db.acquireWorkspaceLease({
      workspace_id: "ws-live",
      holder_id: live,
      lease_ms: 60_000,
    });
    expect(() =>
      db.acquireWorkspaceLease({
        workspace_id: "ws-live",
        holder_id: "shell-1",
        lease_ms: 60_000,
      }),
    ).toThrow(StateDbError);
  });

  it("non-shell holder without PID pattern still blocks (legacy mso-*)", () => {
    db.acquireWorkspaceLease({
      workspace_id: "ws-mso",
      holder_id: "mso-1",
      lease_ms: 60_000,
    });
    expect(() =>
      db.acquireWorkspaceLease({
        workspace_id: "ws-mso",
        holder_id: "mso-2",
        lease_ms: 60_000,
      }),
    ).toThrow(/held by mso-1/);
  });
});
