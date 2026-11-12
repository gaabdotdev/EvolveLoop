/**
 * Gate A — approval concurrency, scope, restart recovery, replay.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalStore } from "../../src/v3/approvals/store.js";
import { ApprovalBroker } from "../../src/v3/approvals/broker.js";
import { agentWorkspaceProfile } from "../../src/v3/security/index.js";
import { CoordinatorDaemon } from "../../src/v3/coordinator/daemon.js";
import { ipcCall } from "../../src/v3/coordinator/ipc.js";

describe("V3.5 OP Gate A — approvals concurrency", () => {
  it("concurrent approve/reject — only one decision wins", () => {
    const dir = mkdtempSync(join(tmpdir(), "el-op-apr-"));
    const store = new ApprovalStore(dir);
    const apr = store.create({
      work_id: "w1",
      operation: "package.install",
      resource: "npm:left-pad",
      justification: "test",
      test_provider: true,
      scope: { workspace: "/tmp/ws", max_uses: 1 },
    });

    const a = store.decideOnce(apr.approval_id, "APPROVED", "actor-a");
    const b = store.decideOnce(apr.approval_id, "REJECTED", "actor-b");
    const winners = [a, b].filter((x) => x.won);
    expect(winners.length).toBe(1);
    const final = store.get(apr.approval_id)!;
    expect(["APPROVED", "REJECTED"]).toContain(final.state);
    expect(final.state).toBe(winners[0]!.approval.state);
  });

  it("approval does not authorize different resource or expand scope", () => {
    const dir = mkdtempSync(join(tmpdir(), "el-op-apr2-"));
    const store = new ApprovalStore(dir);
    const apr = store.create({
      work_id: "w1",
      operation: "package.install",
      resource: "npm:left-pad",
      justification: "local dep",
      test_provider: true,
      scope: { workspace: "/tmp/ws-a", path_prefix: "/tmp/ws-a/", max_uses: 1 },
    });
    store.approve(apr.approval_id, "op");
    expect(store.consume(apr.approval_id, "package.install", "npm:left-pad").ok).toBe(true);
    expect(store.consume(apr.approval_id, "package.install", "npm:left-pad").ok).toBe(false); // replay
    const apr2 = store.create({
      work_id: "w1",
      operation: "package.install",
      resource: "npm:left-pad",
      justification: "local",
      test_provider: true,
      scope: { max_uses: 1 },
    });
    store.approve(apr2.approval_id, "op");
    expect(store.consume(apr2.approval_id, "package.install", "npm:other").ok).toBe(false);
    expect(store.consume(apr2.approval_id, "deploy.publish", "npm:left-pad").ok).toBe(false);
  });

  it("expired approval blocks pending execution", () => {
    const dir = mkdtempSync(join(tmpdir(), "el-op-apr3-"));
    const store = new ApprovalStore(dir);
    const apr = store.create({
      work_id: "w1",
      operation: "network.egress",
      resource: "https://registry.npmjs.org",
      justification: "install",
      ttl_ms: 1,
      test_provider: true,
    });
    // force expire
    const rec = store.get(apr.approval_id)!;
    rec.expires_at = new Date(Date.now() - 5000).toISOString();
    writeFileSync(join(dir, `${apr.approval_id}.json`), JSON.stringify(rec, null, 2));
    store.expireIfNeeded(store.get(apr.approval_id)!);
    expect(store.get(apr.approval_id)!.state).toBe("EXPIRED");
    expect(() => store.approve(apr.approval_id, "late")).toThrow();
  });

  it("pending approvals survive coordinator restart via durable store", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "el-op-apr4-"));
    const d = new CoordinatorDaemon(dataDir);
    await d.start();
    const broker = new ApprovalBroker(d.approvals);
    const ws = mkdtempSync(join(tmpdir(), "el-op-ws-"));
    const pending = broker.evaluateAndMaybeRequest(agentWorkspaceProfile(ws), "package.install", {
      work_id: "w1",
      resource: "npm:x",
      justification: "need",
      test_provider: true,
    });
    expect(pending.status).toBe("pending_approval");
    if (pending.status !== "pending_approval") throw new Error("expected pending");
    const id = pending.approval.approval_id;
    await d.stop("restart");

    const d2 = new CoordinatorDaemon(dataDir);
    await d2.start();
    const listed = await ipcCall(dataDir, "approvals.list", { work_id: "w1" });
    expect(listed.ok).toBe(true);
    const items = listed.result as Array<{ approval_id: string; state: string }>;
    expect(items.some((a) => a.approval_id === id && a.state === "PENDING")).toBe(true);
    await d2.stop("done");
  }, 15000);
});
