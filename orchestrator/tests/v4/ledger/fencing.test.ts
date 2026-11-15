import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { FencingWatermarkStore } from "../../../src/v4/ledger/index.js";
import { WORK, draft, fakeLeases, runtime, workCreated } from "./helpers.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("M02 fencing — caller epoch is not authority (R7 / F13)", () => {
  it("rejects a caller-supplied epoch that does not match the lease manager", async () => {
    const leases = fakeLeases({ lease_id: "lease_not_a_path", fencing_epoch: 3, status: "active" });
    const opened = runtime({ leases });
    roots.push(opened.root);
    const ledger = opened.rt.ledger;
    await ledger.append(WORK, [workCreated()], { expected_head_seq: 0 });
    const fenced = draft("work.state_changed", { state: "RUNNING" }, {
      fencing: { lease_id: "lease_not_a_path", fencing_epoch: 99 },
    });
    const out = await ledger.append(WORK, [fenced], { expected_head_seq: 1 });
    expect(out).toMatchObject({ status: "FENCED", reason: "caller_epoch_rejected", head_seq: 1 });
  });

  it("returns FENCED for a stale epoch below the durable watermark", async () => {
    const leases = fakeLeases({ lease_id: "lease_not_a_path", fencing_epoch: 5, status: "active" });
    const opened = runtime({ leases });
    roots.push(opened.root);
    const ledger = opened.rt.ledger;
    await ledger.append(WORK, [workCreated()], { expected_head_seq: 0 });
    const ok = draft("work.state_changed", { state: "RUNNING" }, {
      fencing: { lease_id: "lease_not_a_path", fencing_epoch: 5 },
    });
    const appended = await ledger.append(WORK, [ok], { expected_head_seq: 1 });
    expect(appended.status).toBe("APPENDED");
    expect(ledger.watermarkStore().get(WORK).epoch_hwm).toBe(5);

    const staleLeases = fakeLeases({ lease_id: "lease_not_a_path", fencing_epoch: 2, status: "active" });
    const opened2 = runtime({ root: opened.root, leases: staleLeases });
    const stale = draft("work.state_changed", { state: "SUSPENDED" }, {
      fencing: { lease_id: "lease_not_a_path", fencing_epoch: 2 },
    });
    const out = await opened2.rt.ledger.append(WORK, [stale], { expected_head_seq: 2 });
    expect(out).toMatchObject({ status: "FENCED", reason: "stale_epoch" });
  });

  it("merges watermarks monotonically on restore (F13)", () => {
    const liveRoot = runtime().root;
    const restoredRoot = runtime().root;
    roots.push(liveRoot, restoredRoot);
    const live = new FencingWatermarkStore(liveRoot);
    const restored = new FencingWatermarkStore(restoredRoot);
    live.bump(WORK, 7, "2026-11-15T12:00:00.000Z");
    restored.bump(WORK, 3, "2026-11-15T11:00:00.000Z");
    const merged = live.mergeFrom(restored, WORK, "2026-11-15T13:00:00.000Z");
    expect(merged.epoch_hwm).toBe(7);
  });

  it("does not use lease_id as a filesystem path (R5)", async () => {
    const leases = fakeLeases({ lease_id: "lease_not_a_path", fencing_epoch: 1, status: "active" });
    const opened = runtime({ leases });
    roots.push(opened.root);
    await opened.rt.ledger.append(WORK, [workCreated()], { expected_head_seq: 0 });
    const { readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const names: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir, { withFileTypes: true })) {
        names.push(n.name);
        if (n.isDirectory()) walk(join(dir, n.name));
      }
    };
    walk(opened.root);
    expect(names.some((n) => n.includes("lease_not_a_path"))).toBe(false);
    expect(names).toContain("fencing");
    expect(names).toContain(WORK);
  });
});
