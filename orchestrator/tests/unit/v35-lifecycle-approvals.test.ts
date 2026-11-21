import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ServiceLifecycle,
  LifecycleError,
  allowedTransitions,
} from "../../src/v3/coordinator/lifecycle.js";
import { ApprovalStore } from "../../src/v3/approvals/store.js";
import { ApprovalBroker } from "../../src/v3/approvals/broker.js";
import { agentWorkspaceProfile } from "../../src/v3/security/index.js";
import { OwnershipLedger } from "../../src/v3/workspace/ownership.js";

describe("V3.5 lifecycle FSM", () => {
  it("allows STARTING→RUNNING→STOPPING→STOPPED", () => {
    const lc = new ServiceLifecycle();
    expect(lc.transition("STARTING")).toBe("STARTING");
    expect(lc.getGeneration()).toBe(1);
    expect(lc.transition("RUNNING")).toBe("RUNNING");
    expect(lc.transition("STOPPING")).toBe("STOPPING");
    expect(lc.transition("STOPPED")).toBe("STOPPED");
  });

  it("rejects illegal transitions", () => {
    const lc = new ServiceLifecycle();
    expect(() => lc.transition("RUNNING")).toThrow(LifecycleError);
  });

  it("restore maps live states to RECOVERING", () => {
    const lc = new ServiceLifecycle();
    expect(lc.restore("RUNNING")).toBe("RECOVERING");
    expect(allowedTransitions().RECOVERING).toContain("RUNNING");
  });
});

describe("V3.5 approvals", () => {
  it("approve/reject/expire/consume scoped", async () => {
    const dir = mkdtempSync(join(tmpdir(), "el-apr-"));
    const store = new ApprovalStore(dir);
    const apr = store.create({
      work_id: "w1",
      operation: "package.install",
      resource: "npm:lodash",
      justification: "need dep",
      ttl_ms: 60_000,
      test_provider: true,
      scope: { max_uses: 1 },
    });
    expect(apr.state).toBe("PENDING");
    store.approve(apr.approval_id, "tester");
    const ok = store.consume(apr.approval_id, "package.install", "npm:lodash");
    expect(ok.ok).toBe(true);
    const replay = store.consume(apr.approval_id, "package.install", "npm:lodash");
    expect(replay.ok).toBe(false);

    const apr2 = store.create({
      work_id: "w1",
      operation: "network.egress",
      resource: "https://evil",
      justification: "no",
      ttl_ms: 1,
      test_provider: true,
    });
    // force expire
    const loaded = store.get(apr2.approval_id)!;
    loaded.expires_at = new Date(Date.now() - 1000).toISOString();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, `${apr2.approval_id}.json`), JSON.stringify(loaded));
    store.expireIfNeeded(store.get(apr2.approval_id)!);
    expect(store.get(apr2.approval_id)!.state).toBe("EXPIRED");

    const apr3 = store.create({
      work_id: "w1",
      operation: "deploy.publish",
      resource: "prod",
      justification: "x",
      test_provider: true,
    });
    store.reject(apr3.approval_id, "tester");
    expect(store.get(apr3.approval_id)!.state).toBe("REJECTED");
  });

  it("rejects wrong resource / operation", () => {
    const dir = mkdtempSync(join(tmpdir(), "el-apr2-"));
    const store = new ApprovalStore(dir);
    const apr = store.create({
      work_id: "w1",
      operation: "package.install",
      resource: "npm:left",
      justification: "x",
      test_provider: true,
    });
    store.approve(apr.approval_id, "t");
    expect(store.consume(apr.approval_id, "package.install", "npm:right").ok).toBe(false);
    expect(store.consume(apr.approval_id, "deploy.publish", "npm:left").ok).toBe(false);
  });

  it("broker creates pending approval for require_approval", () => {
    const dir = mkdtempSync(join(tmpdir(), "el-apr3-"));
    const broker = new ApprovalBroker(new ApprovalStore(dir));
    const ws = mkdtempSync(join(tmpdir(), "el-ws-"));
    const r = broker.evaluateAndMaybeRequest(agentWorkspaceProfile(ws), "package.install", {
      work_id: "w1",
      resource: "npm:x",
      justification: "need",
      test_provider: true,
    });
    expect(r.status).toBe("pending_approval");
  });
});

describe("V3.5 ownership", () => {
  it("detects concurrent claim conflict", () => {
    const dir = mkdtempSync(join(tmpdir(), "el-own-"));
    const ledger = new OwnershipLedger(dir);
    expect(
      ledger.claim({
        path: "src/a.ts",
        work_id: "w1",
        agent_id: "agent-a",
        workspace_id: "ws-a",
        claimed_at: new Date().toISOString(),
      }).ok,
    ).toBe(true);
    const conflict = ledger.claim({
      path: "src/a.ts",
      work_id: "w1",
      agent_id: "agent-b",
      workspace_id: "ws-b",
      claimed_at: new Date().toISOString(),
    });
    expect(conflict.ok).toBe(false);
  });
});
