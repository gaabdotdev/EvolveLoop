/**
 * V3.7 Fabric CLI surface — fleet ops (does not own execution).
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
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
    console.log(JSON.stringify(decision, null, 2));
    return true;
  }

  if (args.command === "revoke") {
    const cp = new ControlPlaneService(dir, { mode: "attach" });
    if (!args["worker-node-id"]) throw new Error("Required: --worker-node-id");
    console.log(JSON.stringify(cp.nodes.revoke(args["worker-node-id"], args.reason ?? "operator_revoke"), null, 2));
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
    if (args.deliver === "true") {
      throw new Error("live_task_delivery_not_implemented: dispatch currently creates a contract and lease but does not deliver to a remote worker");
    }
    const cp = new ControlPlaneService(dir, { mode: "attach" });
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

  return false;
}
