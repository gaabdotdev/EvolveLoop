import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ControlPlaneService } from "../../../src/v3/fabric/control-plane/service.js";
import { generateNodeIdentity } from "../../../src/v3/fabric/trust/identity.js";
import { discoverCapabilities, sampleResources } from "../../../src/v3/fabric/capability/inventory.js";
import { FabricProtocolClient } from "../../../src/v3/fabric/protocol/client.js";
import { envelope } from "../../../src/v3/fabric/protocol/messages.js";

describe("V3.7 protocol flow", () => {
  it("full flow", async () => {
    const dir = mkdtempSync(join(tmpdir(), "el-dbg2-"));
    const cp = new ControlPlaneService(dir);
    const state = await cp.startServer("127.0.0.1", 0, { insecurePlaintext: true });
    const km = generateNodeIdentity();
    const caps = discoverCapabilities();
    const resources = sampleResources(2);
    const pending = cp.nodes.submitEnrollment({
      kind: "EnrollmentRequest",
      request_id: "e1",
      public_key_spki_b64: km.public_key_spki_b64,
      owner: "test",
      fleet: "lab",
      protocol_versions: ["1.0"],
      version: "3.7",
      capabilities: caps,
      resources,
      advertise_endpoints: [],
      requested_at: new Date().toISOString(),
    });
    const auth = cp.nodes.authorizeEnrollment(pending.worker_node_id!);
    const client = new FabricProtocolClient({
      host: "127.0.0.1",
      port: state.listen!.port,
      tls: false,
      sessionToken: auth.session_token!,
      worker_node_id: pending.worker_node_id!,
    });
    await client.connect();
    await client.request(
      envelope("health", "health.heartbeat", { capabilities: caps, resources }),
      "health.heartbeat_ack",
      5000,
    );
    cp.nodes.heartbeat(pending.worker_node_id!, caps, resources);
    const dispatched = cp.dispatchTask({
      workflow_id: "wf1",
      task_id: "task1",
      required_capabilities: ["git"],
      project_id: "p1",
    });
    expect(dispatched.contract).toBeTruthy();
    

    const accepted = await client.request(
      envelope(
        "task",
        "task.result",
        {
          task_id: "task1",
          lease_id: dispatched.lease_id,
          fencing_epoch: dispatched.contract!.fencing_epoch,
        },
        { worker_node_id: pending.worker_node_id },
      ),
      "task.result_accepted",
      5000,
    );
    expect(accepted.type).toBe("task.result_accepted");
    cp.nodes.revoke(pending.worker_node_id!, "test");
    expect(cp.verifyWorkerSession(auth.session_token!).ok).toBe(false);
    client.close();
    await cp.stop();
  }, 30_000);
});
