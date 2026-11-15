/**
 * V3.7 Fabric CLI surface — fleet ops (does not own execution).
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ControlPlaneService } from "../v3/fabric/control-plane/service.js";
import { generateNodeIdentity } from "../v3/fabric/trust/identity.js";
import { discoverCapabilities, sampleResources } from "../v3/fabric/capability/inventory.js";
import { WorkerRuntime } from "../v3/fabric/worker-runtime/runtime.js";
import { doctorControlPlane, doctorWorkerNode, summarizeDoctor } from "../v3/fabric/ops-center/doctor.js";
import { defaultFabricDir } from "../v3/fabric/paths.js";
import { randomUUID } from "node:crypto";

export const V37_USAGE_GROUPS: Record<string, string[]> = {
  fabric: [
    "cp-start",
    "cp-status",
    "enroll-request",
    "enroll-approve",
    "revoke",
    "pool-create",
    "pool-list",
    "dispatch",
    "doctor",
    "fleet-report",
    "worker-run",
    "worker-serve",
  ],
};

function fabricDir(args: Record<string, string>): string {
  return resolve(args["fabric-dir"] ?? process.env.EVOLVELOOP_FABRIC_DIR ?? defaultFabricDir());
}

export async function handleV37Command(args: Record<string, string>): Promise<boolean> {
  if (args.group !== "fabric") return false;
  const dir = fabricDir(args);

  if (args.command === "cp-start") {
    const cp = new ControlPlaneService(dir);
    const host = args.host ?? "127.0.0.1";
    const port = args.port ? Number(args.port) : 0;
    const state = await cp.startServer(host, port);
    console.log(JSON.stringify({ ok: true, state, fabric_dir: dir }, null, 2));
    // Keep process alive if --daemon false default for CLI demo: exit after print unless --serve
    if (args.serve === "true") {
      console.error("fabric control plane serving; Ctrl+C to stop");
      await new Promise(() => {});
    } else {
      await cp.stop();
    }
    return true;
  }

  if (args.command === "cp-status") {
    const cp = new ControlPlaneService(dir, { mode: "attach" });
    console.log(
      JSON.stringify(
        {
          state: cp.state,
          nodes: cp.nodes.list().map((n) => ({
            id: n.identity.worker_node_id,
            status: n.status,
            trust: n.trust,
          })),
          pools: cp.pools.list(),
          leases: cp.leases.list().map((l) => ({ id: l.lease_id, status: l.status, epoch: l.fencing_epoch })),
        },
        null,
        2,
      ),
    );
    return true;
  }

  if (args.command === "enroll-request") {
    const cp = new ControlPlaneService(dir, { mode: "attach" });
    const km = generateNodeIdentity();
    const work = resolve(args["worker-dir"] ?? join(dir, "workers", km.worker_node_id));
    mkdirSync(work, { recursive: true });
    writeFileSync(join(work, "identity.json"), JSON.stringify(km, null, 2), { mode: 0o600 });
    const caps = discoverCapabilities({ slots: Number(args.slots ?? "2") });
    const resources = sampleResources(Number(args.slots ?? "2"));
    const decision = cp.nodes.submitEnrollment({
      kind: "EnrollmentRequest",
      request_id: randomUUID(),
      public_key_spki_b64: km.public_key_spki_b64,
      owner: args.owner ?? "local",
      fleet: args.fleet ?? "default",
      protocol_versions: ["1.0"],
      version: args.version ?? "3.7.0-dev",
      capabilities: caps,
      resources,
      advertise_endpoints: args.endpoint ? [args.endpoint] : [],
      requested_at: new Date().toISOString(),
    });
    // align generated id with registry hash id
    const worker_node_id = decision.worker_node_id!;
    km.worker_node_id = worker_node_id;
    writeFileSync(join(work, "identity.json"), JSON.stringify(km, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ decision, worker_dir: work }, null, 2));
    return true;
  }

  if (args.command === "enroll-approve") {
    const cp = new ControlPlaneService(dir, { mode: "attach" });
    if (!args["worker-node-id"]) throw new Error("Required: --worker-node-id");
    const decision = cp.nodes.authorizeEnrollment(args["worker-node-id"]);
    const work = resolve(
      args["worker-dir"] ?? join(dir, "workers", args["worker-node-id"]),
    );
    mkdirSync(work, { recursive: true });
    if (decision.session_token) {
      writeFileSync(join(work, "session.token"), decision.session_token, { mode: 0o600 });
    }
    if (decision.client_cert_pem && decision.client_key_pem) {
      writeFileSync(join(work, "client-cert.pem"), decision.client_cert_pem, { mode: 0o600 });
      writeFileSync(join(work, "client-key.pem"), decision.client_key_pem, { mode: 0o600 });
    }
    if (decision.ca_cert_pem) {
      writeFileSync(join(work, "ca-cert.pem"), decision.ca_cert_pem);
    }
    // Do not print private key material to stdout in operator logs.
    const { client_key_pem: _k, ...safe } = decision;
    console.log(JSON.stringify({ ...safe, worker_dir: work, client_key_written: Boolean(_k) }, null, 2));
    return true;
  }

  if (args.command === "revoke") {
    const cp = new ControlPlaneService(dir, { mode: "attach" });
    if (!args["worker-node-id"]) throw new Error("Required: --worker-node-id");
    // Prefer live admin revoke so connected sockets are destroyed immediately (AUD-MTLS-03).
    if (cp.state.listen && existsSync(join(dir, "admin", "admin.sock"))) {
      const { fabricAdminCall } = await import("../v3/fabric/control-plane/admin-ipc.js");
      const res = await fabricAdminCall(
        dir,
        "revoke",
        { worker_node_id: args["worker-node-id"], reason: args.reason ?? "operator_revoke" },
        "fabric.revoke",
        cp.state.epoch,
      );
      if (!res.ok) throw new Error(`revoke_failed:${res.error}`);
      console.log(JSON.stringify(res.result, null, 2));
      return true;
    }
    console.log(
      JSON.stringify(cp.nodes.revoke(args["worker-node-id"], args.reason ?? "operator_revoke"), null, 2),
    );
    return true;
  }

  if (args.command === "pool-create") {
    const cp = new ControlPlaneService(dir, { mode: "attach" });
    const pool = cp.pools.create({
      name: args.name ?? "default",
      selectors: {
        capabilities_any: args.cap ? args.cap.split(",") : undefined,
        statuses: ["ONLINE", "DEGRADED"],
      },
      constraints: {},
      max_concurrency: Number(args["max-concurrency"] ?? "4"),
      budget: {},
      priority: Number(args.priority ?? "100"),
      draining: false,
    });
    cp.pools.reconcileMembership(cp.nodes.list());
    console.log(JSON.stringify(cp.pools.get(pool.pool_id), null, 2));
    return true;
  }

  if (args.command === "pool-list") {
    const cp = new ControlPlaneService(dir, { mode: "attach" });
    cp.pools.reconcileMembership(cp.nodes.list());
    console.log(JSON.stringify(cp.pools.list(), null, 2));
    return true;
  }

  if (args.command === "dispatch") {
    const cp = new ControlPlaneService(dir, { mode: "attach" });
    if (args.deliver === "true") {
      const { fabricAdminCall } = await import("../v3/fabric/control-plane/admin-ipc.js");
      if (!cp.state.listen) {
        throw new Error("control_plane_not_serving: start with fabric cp-start --serve true before --deliver");
      }
      const res = await fabricAdminCall(
        dir,
        "deliver",
        {
          workflow_id: args.workflow ?? `wf_${randomUUID()}`,
          task_id: args.task ?? `task_${randomUUID()}`,
          required_capabilities: args.caps ? args.caps.split(",") : ["git"],
          project_id: args.project ?? "local",
          inputs: { objective: args.objective ?? "noop" },
        },
        "fabric.deliver",
        cp.state.epoch,
      );
      if (!res.ok) throw new Error(`deliver_failed:${res.error}`);
      console.log(JSON.stringify(res.result, null, 2));
      return true;
    }
    const result = cp.dispatchTask({
      workflow_id: args.workflow ?? `wf_${randomUUID()}`,
      task_id: args.task ?? `task_${randomUUID()}`,
      required_capabilities: args.caps ? args.caps.split(",") : ["git"],
      project_id: args.project ?? "local",
      inputs: { objective: args.objective ?? "noop" },
    });
    console.log(JSON.stringify(result, null, 2));
    return true;
  }

  if (args.command === "doctor") {
    const cp = new ControlPlaneService(dir, { mode: "attach" });
    const checks = doctorControlPlane(cp);
    if (args["worker-dir"]) checks.push(...doctorWorkerNode(resolve(args["worker-dir"])));
    console.log(JSON.stringify({ summary: summarizeDoctor(checks), checks }, null, 2));
    return true;
  }

  if (args.command === "fleet-report") {
    const { buildFleetReport } = await import("../v3/fabric/ops-center/fleet-report.js");
    const cp = new ControlPlaneService(dir, { mode: "attach" });
    const report = buildFleetReport(cp);
    console.log(JSON.stringify(report, null, 2));
    return true;
  }

  if (args.command === "worker-run") {
    // Local subordinate run of a contract JSON (for single-host tests)
    if (!args.contract) throw new Error("Required: --contract path");
    const contract = JSON.parse(readFileSync(resolve(args.contract), "utf8"));
    const rt = new WorkerRuntime({
      worker_node_id: contract.worker_node_id,
      workRoot: resolve(args["worker-dir"] ?? join(dir, "workers", contract.worker_node_id)),
      slots: Number(args.slots ?? "2"),
    });
    const result = await rt.execute(contract);
    console.log(JSON.stringify(result, null, 2));
    return true;
  }

  if (args.command === "worker-serve") {
    const { FabricProtocolClient } = await import("../v3/fabric/protocol/client.js");
    const { envelope } = await import("../v3/fabric/protocol/messages.js");
    const work = resolve(args["worker-dir"] ?? "");
    if (!work) throw new Error("Required: --worker-dir");
    const workerNodeId = args["worker-node-id"] ?? JSON.parse(readFileSync(join(work, "identity.json"), "utf8")).worker_node_id;
    const sessionToken = readFileSync(join(work, "session.token"), "utf8").trim();
    const tlsInfo = JSON.parse(readFileSync(join(dir, "tls.json"), "utf8")) as {
      host: string;
      port: number;
      plaintext?: boolean;
      ca?: string | null;
    };
    const insecure = args.insecure === "true" || tlsInfo.plaintext === true;
    const client = new FabricProtocolClient({
      host: args.host ?? tlsInfo.host,
      port: Number(args.port ?? tlsInfo.port),
      tls: insecure ? false : true,
      ca: insecure ? undefined : readFileSync(join(work, "ca-cert.pem")),
      cert: insecure ? undefined : readFileSync(join(work, "client-cert.pem")),
      key: insecure ? undefined : readFileSync(join(work, "client-key.pem")),
      rejectUnauthorized: !insecure,
      sessionToken,
      worker_node_id: workerNodeId,
    });
    const rt = new WorkerRuntime({
      worker_node_id: workerNodeId,
      workRoot: work,
      slots: Number(args.slots ?? "2"),
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
    const { attachWorkerProtocolLoop } = await import("../v3/fabric/worker-runtime/protocol-loop.js");
    attachWorkerProtocolLoop({
      worker_node_id: workerNodeId,
      client,
      runtime: rt,
    });
    console.log(JSON.stringify({ ok: true, worker_node_id: workerNodeId, serving: true }, null, 2));
    if (args.once === "true") {
      // wait briefly for a single offer cycle then exit
      await new Promise((r) => setTimeout(r, Number(args["serve-ms"] ?? "5000")));
      client.close();
      return true;
    }
    await new Promise(() => {});
    return true;
  }

  return false;
}
