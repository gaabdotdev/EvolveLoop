import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { WorkLockStore } from "../../src/v3/locks/store.js";

describe("WorkLock fencing", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "lock-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("acquires lock with fencing token and rejects conflict", () => {
    const paths = resolveV3DataPaths(tmp);
    const store = new WorkLockStore(paths.locksDir);
    const a = store.acquire({ work_id: "w1", holder_agent_id: "agent-a", lease_ms: 60_000 });
    expect(a.status).toBe("acquired");
    expect(a.lock?.fencing_token).toBe(1);

    const b = store.acquire({ work_id: "w1", holder_agent_id: "agent-b", lease_ms: 60_000 });
    expect(b.status).toBe("conflict");

    const fenceOk = store.checkFencing("w1", "work", undefined, 1, "agent-a");
    expect(fenceOk.allowed).toBe(true);
    const fenceStale = store.checkFencing("w1", "work", undefined, 0, "agent-a");
    expect(fenceStale.allowed).toBe(false);
    expect(fenceStale.reason).toBe("stale_fencing_token");
  });

  it("allows steal after expiry with higher fencing token", async () => {
    const paths = resolveV3DataPaths(tmp);
    const store = new WorkLockStore(paths.locksDir);
    const a = store.acquire({ work_id: "w1", holder_agent_id: "agent-a", lease_ms: 5 });
    expect(a.status).toBe("acquired");
    await new Promise((r) => setTimeout(r, 15));
    const b = store.acquire({ work_id: "w1", holder_agent_id: "agent-b", lease_ms: 60_000 });
    expect(b.status).toBe("acquired");
    expect(b.lock!.fencing_token).toBeGreaterThan(1);
    expect(store.checkFencing("w1", "work", undefined, 1, "agent-a").allowed).toBe(false);
  });

  it("documents non exactly-once limitation", () => {
    const paths = resolveV3DataPaths(tmp);
    const snap = new WorkLockStore(paths.locksDir).load("w1");
    expect(snap.limitations.some((l) => /exactly-once/i.test(l))).toBe(true);
  });
});
