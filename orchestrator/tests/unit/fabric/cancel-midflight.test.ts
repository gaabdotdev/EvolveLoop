import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkerRuntime, buildContract } from "../../../src/v3/fabric/worker-runtime/runtime.js";
import { ControlPlaneService } from "../../../src/v3/fabric/control-plane/service.js";
import { generateNodeIdentity } from "../../../src/v3/fabric/trust/identity.js";
import { discoverCapabilities, sampleResources } from "../../../src/v3/fabric/capability/inventory.js";
import { randomUUID } from "node:crypto";

function sleepContract(workerNodeId: string, taskId: string, leaseId: string, epoch: number, ms: number) {
  return buildContract({
    workflow_id: "wf-cancel",
    task_id: taskId,
    inputs: {},
    dependency_refs: [],
    artifact_refs: [],
    required_capabilities: ["bubblewrap"],
    permissions: [],
    budget: {},
    deadline_at: new Date(Date.now() + 120_000).toISOString(),
    sandbox_profile: "agent-workspace",
    network_policy: "default-deny",
    worker_node_id: workerNodeId,
    lease_id: leaseId,
    fencing_epoch: epoch,
    evidence_requirements: [],
    retry_policy: { max_retries: 0, backoff_ms: 0 },
    cancel_policy: { graceful_ms: 500, force_after_ms: 1500 },
  });
}

describe("V3.7 cancel mid-flight", () => {
  it("cancels before start when signal already aborted", async () => {
    const root = mkdtempSync(join(tmpdir(), "el-cancel-pre-"));
    const rt = new WorkerRuntime({ worker_node_id: "wn_c", workRoot: root, slots: 1 });
    const ac = new AbortController();
    ac.abort();
    const contract = sleepContract("wn_c", "t-pre", "lease_pre", 1, 5000);
    const result = await rt.execute(contract, {
      signal: ac.signal,
      command: [process.execPath, "-e", "setTimeout(()=>{}, 5000)"],
    });
    expect(result.status).toBe("cancelled");
  });

  it("cancels during sandbox execution and kills the process tree", async () => {
    const root = mkdtempSync(join(tmpdir(), "el-cancel-mid-"));
    const rt = new WorkerRuntime({ worker_node_id: "wn_c", workRoot: root, slots: 1 });
    const contract = sleepContract("wn_c", "t-mid", "lease_mid", 1, 5000);
    const started = Date.now();
    const run = rt.execute(contract, {
      cancel_grace_ms: 400,
      command: [
        process.execPath,
        "-e",
        "setInterval(()=>{}, 1000); setTimeout(()=>{}, 30000)",
      ],
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(rt.cancel("t-mid")).toBe(true);
    const result = await run;
    expect(result.status).toBe("cancelled");
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(result.supervision.tree_state).toBe("killed");
  });

  it("cancels near completion still reports cancelled when abort wins", async () => {
    const root = mkdtempSync(join(tmpdir(), "el-cancel-near-"));
    const rt = new WorkerRuntime({
      worker_node_id: "wn_c",
      workRoot: root,
      slots: 1,
      allowHostFallback: true,
      requireOsSandbox: false,
    });
    const contract = buildContract({
      workflow_id: "wf",
      task_id: "t-near",
      inputs: {},
      dependency_refs: [],
      artifact_refs: [],
      required_capabilities: [],
      permissions: [],
      budget: {},
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
      sandbox_profile: "none",
      network_policy: "deny",
      worker_node_id: "wn_c",
      lease_id: "lease_near",
      fencing_epoch: 1,
      evidence_requirements: [],
      retry_policy: { max_retries: 0, backoff_ms: 0 },
      cancel_policy: { graceful_ms: 200, force_after_ms: 500 },
    });
    const run = rt.execute(contract, {
      command: [process.execPath, "-e", "setTimeout(()=>console.log('done'), 800)"],
    });
    await new Promise((r) => setTimeout(r, 50));
    rt.cancel("t-near", true);
    const result = await run;
    expect(["cancelled", "completed", "failed"]).toContain(result.status);
    // If cancel landed before exit, must be cancelled; if process finished first, completed is honest.
    if (result.supervision.tree_state === "killed") {
      expect(result.status).toBe("cancelled");
    }
  });

  it("escalates to SIGKILL when process ignores SIGTERM", async () => {
    const root = mkdtempSync(join(tmpdir(), "el-cancel-ign-"));
    const rt = new WorkerRuntime({
      worker_node_id: "wn_c",
      workRoot: root,
      slots: 1,
      allowHostFallback: true,
      requireOsSandbox: false,
    });
    const contract = buildContract({
      workflow_id: "wf",
      task_id: "t-ign",
      inputs: {},
      dependency_refs: [],
      artifact_refs: [],
      required_capabilities: [],
      permissions: [],
      budget: {},
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
      sandbox_profile: "none",
      network_policy: "deny",
      worker_node_id: "wn_c",
      lease_id: "lease_ign",
      fencing_epoch: 1,
      evidence_requirements: [],
      retry_policy: { max_retries: 0, backoff_ms: 0 },
      cancel_policy: { graceful_ms: 200, force_after_ms: 400 },
    });
    const run = rt.execute(contract, {
      cancel_grace_ms: 300,
      command: [
        process.execPath,
        "-e",
        "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)",
      ],
    });
    await new Promise((r) => setTimeout(r, 100));
    rt.cancel("t-ign", false);
    const result = await run;
    expect(result.status).toBe("cancelled");
  });

  it("honors cancel force timeout (grace then kill) within force_after_ms bound", async () => {
    const root = mkdtempSync(join(tmpdir(), "el-cancel-to-"));
    const rt = new WorkerRuntime({
      worker_node_id: "wn_c",
      workRoot: root,
      slots: 1,
      allowHostFallback: true,
      requireOsSandbox: false,
    });
    const contract = buildContract({
      workflow_id: "wf",
      task_id: "t-to",
      inputs: {},
      dependency_refs: [],
      artifact_refs: [],
      required_capabilities: [],
      permissions: [],
      budget: {},
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
      sandbox_profile: "none",
      network_policy: "deny",
      worker_node_id: "wn_c",
      lease_id: "lease_to",
      fencing_epoch: 1,
      evidence_requirements: [],
      retry_policy: { max_retries: 0, backoff_ms: 0 },
      cancel_policy: { graceful_ms: 100, force_after_ms: 250 },
    });
    const started = Date.now();
    const run = rt.execute(contract, {
      cancel_grace_ms: 250,
      command: [
        process.execPath,
        "-e",
        "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)",
      ],
    });
    await new Promise((r) => setTimeout(r, 80));
    rt.cancel("t-to", false);
    const result = await run;
    const elapsed = Date.now() - started;
    expect(result.status).toBe("cancelled");
    expect(elapsed).toBeGreaterThanOrEqual(200);
    expect(elapsed).toBeLessThan(8_000);
  });

  it("cancels while worker is disconnected: lease revoked, cancel_pushed false, late commit fenced", async () => {
    const dir = mkdtempSync(join(tmpdir(), "el-cancel-disc-"));
    const cp = new ControlPlaneService(dir);
    await cp.startServer("127.0.0.1", 0, { insecurePlaintext: true });
    try {
      const km = generateNodeIdentity();
      const pending = cp.nodes.submitEnrollment({
        kind: "EnrollmentRequest",
        request_id: randomUUID(),
        public_key_spki_b64: km.public_key_spki_b64,
        owner: "t",
        fleet: "lab",
        protocol_versions: ["1.0"],
        version: "3.7.0-test",
        capabilities: discoverCapabilities({ slots: 1 }),
        resources: sampleResources(1),
        advertise_endpoints: [],
        requested_at: new Date().toISOString(),
      });
      cp.nodes.authorizeEnrollment(pending.worker_node_id!);
      const placed = cp.dispatchTask({
        workflow_id: "wf",
        task_id: "t-disc",
        required_capabilities: ["git"],
        project_id: "local",
      });
      expect(placed.lease_id).toBeTruthy();
      expect(cp.connectedWorkers()).toEqual([]);
      const cancelled = cp.cancelTask({
        lease_id: placed.lease_id!,
        task_id: "t-disc",
        worker_node_id: pending.worker_node_id!,
        reason: "worker_offline",
      });
      expect(cancelled.lease_status).toBe("revoked");
      expect(cancelled.cancel_pushed).toBe(false);
      const fence = cp.leases.assertFencing({
        lease_id: placed.lease_id!,
        worker_node_id: pending.worker_node_id!,
        fencing_epoch: placed.contract!.fencing_epoch,
        operation: "submit_result",
      });
      expect(fence.allowed).toBe(false);
      if (!fence.allowed) expect(fence.reason).toBe("lease_revoked");
    } finally {
      await cp.stop();
    }
  });

  it("rejects late result commit after lease revoke/cancel at control plane", async () => {
    const dir = mkdtempSync(join(tmpdir(), "el-cancel-cp-"));
    const cp = new ControlPlaneService(dir);
    await cp.startServer("127.0.0.1", 0, { insecurePlaintext: true });
    try {
      const km = generateNodeIdentity();
      const pending = cp.nodes.submitEnrollment({
        kind: "EnrollmentRequest",
        request_id: randomUUID(),
        public_key_spki_b64: km.public_key_spki_b64,
        owner: "t",
        fleet: "lab",
        protocol_versions: ["1.0"],
        version: "3.7.0-test",
        capabilities: discoverCapabilities({ slots: 1 }),
        resources: sampleResources(1),
        advertise_endpoints: [],
        requested_at: new Date().toISOString(),
      });
      cp.nodes.authorizeEnrollment(pending.worker_node_id!);
      const placed = cp.dispatchTask({
        workflow_id: "wf",
        task_id: "t-late",
        required_capabilities: ["git"],
        project_id: "local",
      });
      expect(placed.lease_id).toBeTruthy();
      const cancelled = cp.cancelTask({
        lease_id: placed.lease_id!,
        task_id: "t-late",
        worker_node_id: pending.worker_node_id!,
      });
      expect(cancelled.lease_status).toBe("revoked");
      const fence = cp.leases.assertFencing({
        lease_id: placed.lease_id!,
        worker_node_id: pending.worker_node_id!,
        fencing_epoch: placed.contract!.fencing_epoch,
        operation: "submit_result",
      });
      expect(fence.allowed).toBe(false);
      if (!fence.allowed) expect(fence.reason).toBe("lease_revoked");
    } finally {
      await cp.stop();
    }
  });
});
