import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyCliApprovalStoreFallback,
  F02_STORE_FALLBACK_REFUSED,
  V37PolicyAdapter,
  V4_CLI_STORE_FALLBACK,
} from "../../../src/v4/adapters/v37/policy.js";
import {
  applyDaemonApprovalActorWrite,
  F02_DAEMON_ACTOR_REFUSED,
} from "../../../src/v4/api/daemon-approvals.js";
import { CALLER_ASSERTED_IDENTITY_KEYS, InMemoryOperatorAuthn } from "../../../src/v4/policy/authn.js";
import { DenyByDefaultPolicyEngine, InMemoryWorkContext } from "../../../src/v4/policy/engine.js";
import { PolicyStore } from "../../../src/v4/policy/store.js";
import { CoordinatorDaemon } from "../../../src/v3/coordinator/daemon.js";
import { ipcCall } from "../../../src/v3/coordinator/ipc.js";
import { allowRule, basePolicy, FakeClock, request, workCtx } from "../policy/fixtures.js";

function setupAdapter() {
  const store = new PolicyStore();
  store.put(
    basePolicy({
      autonomy_ceiling: "L2_SUPERVISED",
      rules: [
        allowRule({
          rule_id: "rule_deploy",
          actions: ["deploy.publish"],
          resources: ["prod"],
        }),
      ],
    }),
  );
  const contexts = new InMemoryWorkContext();
  contexts.set(workCtx({ autonomy: "L2_SUPERVISED" }));
  const engine = new DenyByDefaultPolicyEngine({
    store,
    policy_id: "pol_default0001",
    contexts,
    clock: new FakeClock(),
  });
  const authn = new InMemoryOperatorAuthn();
  const human = authn.issue("operator-gaab");
  const adapter = new V37PolicyAdapter(engine, authn);
  return { engine, authn, human, adapter };
}

describe("M15 F02 — daemon actor is not identity under V4 posture", () => {
  it("does not regress the M10 CLI store-fallback gate", () => {
    expect(V4_CLI_STORE_FALLBACK).toBe(false);
    const write = vi.fn(() => ({ state: "APPROVED" }));
    expect(() => applyCliApprovalStoreFallback("approve", write)).toThrow(F02_STORE_FALLBACK_REFUSED);
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses daemon approve/reject with asserted actor without invoking the V3 writer", () => {
    const write = vi.fn((actor: string) => ({ state: "APPROVED", actor }));
    expect(() =>
      applyDaemonApprovalActorWrite("approve", { approval_id: "apr-1", actor: "cli" }, write),
    ).toThrow(F02_DAEMON_ACTOR_REFUSED);
    expect(write).not.toHaveBeenCalled();
    expect(() =>
      applyDaemonApprovalActorWrite("reject", { approval_id: "apr-1", actor: "operator-cli" }, write),
    ).toThrow(/approvals\.reject/);
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses the default actor \"cli\" when params omit actor (RR-W5-01 remainder)", () => {
    const write = vi.fn((actor: string) => ({ actor }));
    expect(() => applyDaemonApprovalActorWrite("approve", { approval_id: "apr-1" }, write)).toThrow(
      F02_DAEMON_ACTOR_REFUSED,
    );
    expect(write).not.toHaveBeenCalled();
    expect(() => applyDaemonApprovalActorWrite("approve", undefined, write)).toThrow(F02_DAEMON_ACTOR_REFUSED);
    expect(write).not.toHaveBeenCalled();
  });

  it("does not treat operator_token as a V3 store actor when no adapter is wired", () => {
    const write = vi.fn((actor: string) => ({ actor }));
    expect(() =>
      applyDaemonApprovalActorWrite(
        "approve",
        { approval_id: "apr-1", operator_token: "a".repeat(32) },
        write,
      ),
    ).toThrow(/V37PolicyAdapter/);
    expect(write).not.toHaveBeenCalled();
  });

  it("routes token-only approve/reject through V37PolicyAdapter (no frozen decided_by)", async () => {
    const { engine, adapter, human } = setupAdapter();
    const d = await engine.decide(request({ action: "deploy.publish", resource: "prod", risk: "high" }));
    const pending = engine.pendingForDecision(d.decision_id)!;
    const write = vi.fn((actor: string) => ({ actor }));
    const approved = applyDaemonApprovalActorWrite(
      "approve",
      { approval_id: pending.approval_id, operator_token: human.token },
      write,
      adapter,
    );
    expect(write).not.toHaveBeenCalled();
    expect(approved).toMatchObject({ ok: true });
    if (!("ok" in approved) || !approved.ok) throw new Error("expected V4 approve ok");
    expect(approved.approval.decided_by).toEqual({ kind: "HUMAN", id: "operator-gaab" });
    expect(approved.approval).not.toHaveProperty("actor");
  });

  it("refuses every caller-asserted identity key even when a token+adapter are present", async () => {
    const { engine, adapter, human } = setupAdapter();
    const d = await engine.decide(request({ action: "deploy.publish", resource: "prod", risk: "high" }));
    const pending = engine.pendingForDecision(d.decision_id)!;
    const write = vi.fn();
    for (const key of CALLER_ASSERTED_IDENTITY_KEYS) {
      const params = {
        approval_id: pending.approval_id,
        operator_token: human.token,
        [key]: key === "decided_by" ? { kind: "HUMAN", id: "executor_worker01" } : "executor_worker01",
      };
      expect(() => applyDaemonApprovalActorWrite("approve", params, write, adapter)).toThrow(
        F02_DAEMON_ACTOR_REFUSED,
      );
      expect(() => applyDaemonApprovalActorWrite("reject", params, write, adapter)).toThrow(
        F02_DAEMON_ACTOR_REFUSED,
      );
    }
    expect(write).not.toHaveBeenCalled();
    expect(engine.pendingForDecision(d.decision_id)?.state).toBe("PENDING");
  });

  it("locks daemon.ts approve/reject to the V4 actor gate (narrow F02 path)", () => {
    const src = readFileSync(new URL("../../../src/v3/coordinator/daemon.ts", import.meta.url), "utf8");
    expect(src).toContain('applyDaemonApprovalActorWrite("approve"');
    expect(src).toContain('applyDaemonApprovalActorWrite("reject"');
    expect(src).not.toMatch(/const actor = String\(req\.params\?\.actor \?\? "cli"\)/);
    expect(src).toMatch(/applyDaemonApprovalActorWrite\("approve", req\.params, \(actor\) =>/);
    expect(src).toMatch(/applyDaemonApprovalActorWrite\("reject", req\.params, \(actor\) =>/);
  });

  it("locks v35-commands to applyCliApprovalStoreFallback (M10 co-own, no regression)", () => {
    const src = readFileSync(new URL("../../../src/cli/v35-commands.ts", import.meta.url), "utf8");
    expect(src).toContain('applyCliApprovalStoreFallback("approve"');
    expect(src).toContain('applyCliApprovalStoreFallback("reject"');
  });
});

describe("M15 F02 — live V3 daemon IPC does not write with asserted actor", () => {
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

  it("refuses approvals.approve with actor and leaves the V3 record PENDING", async () => {
    dir = mkdtempSync(join(tmpdir(), "el-m15-f02-"));
    daemon = new CoordinatorDaemon(dir);
    await daemon.start();
    const pending = daemon.approvals.create({
      work_id: "work_f02daemon01",
      operation: "package.install",
      resource: "npm:noop-local",
      justification: "f02 daemon actor residual",
      test_provider: true,
    });
    expect(pending.state).toBe("PENDING");

    const via = await ipcCall(dir, "approvals.approve", {
      approval_id: pending.approval_id,
      actor: "operator-cli",
    });
    expect(via.ok).toBe(false);
    expect(String(via.error)).toContain(F02_DAEMON_ACTOR_REFUSED);

    const still = daemon.approvals.get(pending.approval_id);
    expect(still?.state).toBe("PENDING");
    expect(still?.decided_by).toBeUndefined();
  });

  it("refuses approvals.reject defaulting actor to cli", async () => {
    dir = mkdtempSync(join(tmpdir(), "el-m15-f02-rej-"));
    daemon = new CoordinatorDaemon(dir);
    await daemon.start();
    const pending = daemon.approvals.create({
      work_id: "work_f02daemon02",
      operation: "deploy.publish",
      resource: "prod",
      justification: "f02 daemon reject residual",
    });

    const via = await ipcCall(dir, "approvals.reject", { approval_id: pending.approval_id });
    expect(via.ok).toBe(false);
    expect(String(via.error)).toContain(F02_DAEMON_ACTOR_REFUSED);
    expect(daemon.approvals.get(pending.approval_id)?.state).toBe("PENDING");
  });
});
