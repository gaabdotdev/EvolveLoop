import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ControlPlaneService } from "../../../src/v3/fabric/control-plane/service.js";
import { FabricProtocolClient } from "../../../src/v3/fabric/protocol/client.js";
import { envelope } from "../../../src/v3/fabric/protocol/messages.js";
import { generateNodeIdentity } from "../../../src/v3/fabric/trust/identity.js";
import { discoverCapabilities, sampleResources } from "../../../src/v3/fabric/capability/inventory.js";
import { WorkerRuntime } from "../../../src/v3/fabric/worker-runtime/runtime.js";
import { fabricAdminCall } from "../../../src/v3/fabric/control-plane/admin-ipc.js";

describe("V3.7 remote task delivery", () => {
  const cps: ControlPlaneService[] = [];
  const dirs: string[] = [];

  afterEach(async () => {
    for (const cp of cps.splice(0)) await cp.stop().catch(() => undefined);
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  async function bootWithWorker(opts?: { mtls?: boolean }) {
    const dir = mkdtempSync(join(tmpdir(), "el-deliver-"));
    dirs.push(dir);
    const cp = new ControlPlaneService(dir);
    cps.push(cp);
    const insecure = opts?.mtls !== true;
    const state = await cp.startServer("127.0.0.1", 0, insecure ? { insecurePlaintext: true } : undefined);
    const km = generateNodeIdentity();
    const pending = cp.nodes.submitEnrollment({
      kind: "EnrollmentRequest",
      request_id: randomUUID(),
      public_key_spki_b64: km.public_key_spki_b64,
      owner: "test",
      fleet: "lab",
      protocol_versions: ["1.0"],
      version: "3.7.0-test",
      capabilities: discoverCapabilities({ slots: 2 }),
      resources: sampleResources(2),
      advertise_endpoints: [],
      requested_at: new Date().toISOString(),
    });
    const decision = cp.nodes.authorizeEnrollment(pending.worker_node_id!);
    const work = join(dir, "workers", pending.worker_node_id!);
    mkdirSync(work, { recursive: true });
    writeFileSync(join(work, "session.token"), decision.session_token!, { mode: 0o600 });
    if (!insecure) {
      writeFileSync(join(work, "client-cert.pem"), decision.client_cert_pem!, { mode: 0o600 });
      writeFileSync(join(work, "client-key.pem"), decision.client_key_pem!, { mode: 0o600 });
      writeFileSync(join(work, "ca-cert.pem"), decision.ca_cert_pem!);
    }
    const rt = new WorkerRuntime({
      worker_node_id: pending.worker_node_id!,
      workRoot: work,
      slots: 2,
      allowHostFallback: true,
      requireOsSandbox: false,
    });
    const client = new FabricProtocolClient({
      host: state.listen!.host,
      port: state.listen!.port,
      tls: !insecure,
      ca: insecure ? undefined : readFileSync(join(work, "ca-cert.pem")),
      cert: insecure ? undefined : readFileSync(join(work, "client-cert.pem")),
      key: insecure ? undefined : readFileSync(join(work, "client-key.pem")),
      rejectUnauthorized: !insecure,
      sessionToken: decision.session_token!,
      worker_node_id: pending.worker_node_id!,
    });
    await client.connect();
    const inv = rt.inventory();
    await client.request(
      envelope("health", "health.heartbeat", {
        capabilities: inv.caps,
        resources: inv.resources,
      }),
      "health.heartbeat_ack",
    );
    let lastExec: Promise<unknown> = Promise.resolve();
    let lastError: unknown;
    client.onMessage((msg) => {
      if (msg.type !== "task.offer") return;
      const payload = msg.payload as { contract: any };
      lastExec = (async () => {
        client.send(
          envelope(
            "task",
            "task.ack",
            { task_id: payload.contract.task_id, lease_id: payload.contract.lease_id },
            { ack_of: msg.request_id, worker_node_id: pending.worker_node_id! },
          ),
        );
        client.send(
          envelope(
            "task",
            "task.progress",
            { task_id: payload.contract.task_id, phase: "executing" },
            { worker_node_id: pending.worker_node_id! },
          ),
        );
        const result = await rt.execute(payload.contract, {
          command: [process.execPath, "-e", "console.log('delivered:'+process.env.EL_TASK_ID)"],
        });
        if (result.status !== "completed") {
          throw new Error(`worker_exec_failed:${result.status}:${result.stdout ?? ""}`);
        }
        const reply = await client.request(
          envelope(
            "task",
            "task.result",
            {
              task_id: payload.contract.task_id,
              lease_id: payload.contract.lease_id,
              fencing_epoch: payload.contract.fencing_epoch,
              status: result.status,
            },
            { worker_node_id: pending.worker_node_id! },
          ),
          "task.result_accepted",
          30_000,
        );
        if (reply.type !== "task.result_accepted") {
          throw new Error(`unexpected_result_reply:${reply.type}`);
        }
      })().catch((err) => {
        lastError = err;
        throw err;
      });
    });
    return {
      cp,
      state,
      client,
      workerNodeId: pending.worker_node_id!,
      dir,
      drain: async () => {
        await lastExec;
        if (lastError) throw lastError;
      },
    };
  }

  it("delivers offer and awaits result_accepted", async () => {
    const { cp, workerNodeId, drain, client } = await bootWithWorker();
    expect(cp.connectedWorkers()).toContain(workerNodeId);
    const delivered = await cp.deliverTask({
      workflow_id: `wf_${randomUUID()}`,
      task_id: `task_${randomUUID()}`,
      required_capabilities: ["git"],
      project_id: "local",
      inputs: { objective: "deliver-unit" },
      wait_for_result: true,
    });
    expect(delivered.contract).toBeTruthy();
    expect(delivered.delivery?.status).toBe("result_accepted");
    await drain();
    client.close();
  });

  it("admin IPC deliver reaches live control plane with result_accepted", async () => {
    const { cp, dir, workerNodeId, drain, client } = await bootWithWorker();
    expect(cp.connectedWorkers()).toContain(workerNodeId);
    const res = await fabricAdminCall(
      dir,
      "deliver",
      {
        workflow_id: `wf_${randomUUID()}`,
        task_id: `task_${randomUUID()}`,
        required_capabilities: ["git"],
        project_id: "local",
        inputs: { objective: "admin-deliver" },
        wait_for_result: true,
      },
      "fabric.deliver",
      cp.state.epoch,
      30_000,
    );
    expect(res.ok).toBe(true);
    const body = res.result as { delivery?: { status: string } };
    expect(body.delivery?.status).toBe("result_accepted");
    await drain();
    client.close();
  });

  it("completes offer→result under mTLS", async () => {
    const { cp, workerNodeId, drain, client } = await bootWithWorker({ mtls: true });
    expect(cp.connectedWorkers()).toContain(workerNodeId);
    const delivered = await cp.deliverTask({
      workflow_id: `wf_${randomUUID()}`,
      task_id: `task_${randomUUID()}`,
      required_capabilities: ["git"],
      project_id: "local",
      wait_for_result: true,
    });
    expect(delivered.delivery?.status).toBe("result_accepted");
    await drain();
    client.close();
  });

  it("fails deliver when worker is not connected", async () => {
    const dir = mkdtempSync(join(tmpdir(), "el-deliver-offline-"));
    dirs.push(dir);
    const cp = new ControlPlaneService(dir);
    cps.push(cp);
    await cp.startServer("127.0.0.1", 0, { insecurePlaintext: true });
    const km = generateNodeIdentity();
    const pending = cp.nodes.submitEnrollment({
      kind: "EnrollmentRequest",
      request_id: randomUUID(),
      public_key_spki_b64: km.public_key_spki_b64,
      owner: "test",
      fleet: "lab",
      protocol_versions: ["1.0"],
      version: "3.7.0-test",
      capabilities: discoverCapabilities({ slots: 1 }),
      resources: sampleResources(1),
      advertise_endpoints: [],
      requested_at: new Date().toISOString(),
    });
    cp.nodes.authorizeEnrollment(pending.worker_node_id!);
    await expect(
      cp.deliverTask({
        workflow_id: "wf",
        task_id: "t1",
        required_capabilities: ["git"],
        project_id: "local",
      }),
    ).rejects.toThrow(/worker_not_connected/);
  });
});
