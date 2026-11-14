/**
 * Single active Control Plane — fleet authority for V3.7.
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteJson, nowIso } from "../../ops/atomic.js";
import { resolveFabricDataPaths, type FabricDataPaths } from "../paths.js";
import { NodeRegistry } from "../node-registry/registry.js";
import { LeaseManager } from "../leases/lease-manager.js";
import { PoolRegistry } from "../pools/pool-registry.js";
import { PlacementEngine } from "../scheduler/placement.js";
import { ArtifactFabric } from "../artifacts/registry.js";
import { TeamRegistry } from "../teams/team-registry.js";
import { WorkStealer } from "../steal/work-steal.js";
import { SpeculativeEngine } from "../speculative/engine.js";
import { generateCpSecret } from "../trust/session.js";
import { FabricProtocolServer } from "../protocol/server.js";
import { generateDevTlsMaterials } from "../protocol/tls-util.js";
import { envelope, type ProtocolEnvelope } from "../protocol/messages.js";
import { buildContract } from "../worker-runtime/runtime.js";
import type { ExecutionContract, PlacementDecision } from "../types.js";
import { verifySessionToken } from "../trust/session.js";

export interface ControlPlaneState {
  control_plane_id: string;
  epoch: number;
  active: true;
  started_at: string;
  listen?: { host: string; port: number };
  tls_fingerprint?: string;
}

export class ControlPlaneService {
  readonly paths: FabricDataPaths;
  readonly cpSecret: Buffer;
  readonly state: ControlPlaneState;
  readonly nodes: NodeRegistry;
  readonly leases: LeaseManager;
  readonly pools: PoolRegistry;
  readonly placement: PlacementEngine;
  readonly artifacts: ArtifactFabric;
  readonly teams: TeamRegistry;
  readonly stealer: WorkStealer;
  readonly speculative: SpeculativeEngine;
  private server?: FabricProtocolServer;

  constructor(fabricDir: string, opts?: { control_plane_id?: string; cpSecret?: Buffer }) {
    this.paths = resolveFabricDataPaths(fabricDir);
    if (existsSync(this.paths.cpStateFile)) {
      const prev = JSON.parse(readFileSync(this.paths.cpStateFile, "utf8")) as ControlPlaneState;
      // V3.7: single active CP — restart increments epoch, same id preferred
      this.state = {
        control_plane_id: opts?.control_plane_id ?? prev.control_plane_id,
        epoch: prev.epoch + 1,
        active: true,
        started_at: nowIso(),
      };
    } else {
      this.state = {
        control_plane_id: opts?.control_plane_id ?? `cp_${randomUUID()}`,
        epoch: 1,
        active: true,
        started_at: nowIso(),
      };
    }
    this.cpSecret = opts?.cpSecret ?? loadOrCreateSecret(this.paths);
    this.nodes = new NodeRegistry(this.paths, this.cpSecret, this.state.control_plane_id);
    this.leases = new LeaseManager(this.paths);
    this.pools = new PoolRegistry(this.paths);
    this.placement = new PlacementEngine(this.paths);
    this.artifacts = new ArtifactFabric(this.paths);
    this.teams = new TeamRegistry(this.paths);
    this.stealer = new WorkStealer(this.leases);
    this.speculative = new SpeculativeEngine();
    atomicWriteJson(this.paths.cpStateFile, this.state);
  }

  async startServer(
    host = "127.0.0.1",
    port = 0,
    opts?: { insecurePlaintext?: boolean },
  ): Promise<ControlPlaneState> {
    const tls = opts?.insecurePlaintext ? null : generateDevTlsMaterials(this.state.control_plane_id);
    this.server = new FabricProtocolServer({
      host,
      port,
      tls: opts?.insecurePlaintext ? false : true,
      key: tls?.key,
      cert: tls?.cert,
      cpSecret: this.cpSecret,
      handler: async (msg: ProtocolEnvelope, ctx: { socket: import("node:net").Socket; worker_node_id?: string }) => {
        if (msg.type === "health.heartbeat") {
          if (!ctx.worker_node_id) throw new Error("unauthenticated");
          const payload = msg.payload as { capabilities: any; resources: any };
          this.nodes.heartbeat(ctx.worker_node_id, payload.capabilities, payload.resources);
          return envelope("health", "health.heartbeat_ack", { ok: true }, { ack_of: msg.request_id });
        }
        if (msg.type === "task.result") {
          return this.handleResult(msg.payload as any, ctx.worker_node_id!, msg.request_id);
        }
        if (msg.type === "lease.renew") {
          const p = msg.payload as { lease_id: string; ttl_ms: number };
          const lease = this.leases.renew(p.lease_id, ctx.worker_node_id!, p.ttl_ms);
          return envelope("control", "lease.renew_ok", { lease }, { ack_of: msg.request_id });
        }
        return envelope("control", "error", { reason: `unknown_type:${msg.type}` }, { ack_of: msg.request_id });
      },
    });
    const listen = await this.server.listen();
    this.state.listen = listen;
    this.state.tls_fingerprint = tls?.fingerprint;
    atomicWriteJson(this.paths.cpStateFile, this.state);
    atomicWriteJson(join(this.paths.root, "tls.json"), {
      plaintext: Boolean(opts?.insecurePlaintext),
      cert: tls ? tls.cert.toString("utf8") : null,
      fingerprint: tls?.fingerprint ?? null,
      host: listen.host,
      port: listen.port,
    });
    if (tls) {
      writeFileSync(join(this.paths.root, "cp-cert.pem"), tls.cert);
      writeFileSync(join(this.paths.root, "cp-key.pem"), tls.key, { mode: 0o600 });
    }
    return this.state;
  }

  async stop(): Promise<void> {
    await this.server?.close();
  }

  dispatchTask(input: {
    workflow_id: string;
    task_id: string;
    required_capabilities: string[];
    project_id: string;
    inputs?: Record<string, unknown>;
    ttl_ms?: number;
  }): { decision: PlacementDecision; contract?: ExecutionContract; lease_id?: string } {
    this.pools.reconcileMembership(this.nodes.list());
    const decision = this.placement.place(this.nodes.list(), {
      task_id: input.task_id,
      required_capabilities: input.required_capabilities,
      protocol_version: "1.0",
      require_sandbox: input.required_capabilities.includes("bubblewrap"),
    });
    if (!decision.selected_worker_node_id) {
      return { decision };
    }
    const node = this.nodes.get(decision.selected_worker_node_id)!;
    if (node.status === "REVOKED" || node.trust !== "trusted") {
      throw new Error("selected_node_untrusted");
    }
    const lease = this.leases.issue({
      resource_key: `task:${input.task_id}`,
      task_id: input.task_id,
      owner_worker_node_id: decision.selected_worker_node_id,
      ttl_ms: input.ttl_ms ?? 300_000,
      allowed_operations: ["execute", "publish_artifact", "submit_result"],
    });
    const contract = buildContract({
      workflow_id: input.workflow_id,
      task_id: input.task_id,
      inputs: input.inputs ?? {},
      dependency_refs: [],
      artifact_refs: [],
      required_capabilities: input.required_capabilities,
      permissions: ["workspace.write"],
      budget: {},
      deadline_at: new Date(Date.now() + (input.ttl_ms ?? 300_000)).toISOString(),
      sandbox_profile: "agent-workspace",
      network_policy: "default-deny",
      worker_node_id: decision.selected_worker_node_id,
      lease_id: lease.lease_id,
      fencing_epoch: lease.fencing_epoch,
      evidence_requirements: ["stdout"],
      retry_policy: { max_retries: 1, backoff_ms: 1000 },
      cancel_policy: { graceful_ms: 5000, force_after_ms: 15000 },
    });
    return { decision, contract, lease_id: lease.lease_id };
  }

  private handleResult(
    payload: {
      task_id: string;
      lease_id: string;
      fencing_epoch: number;
      artifact_ids?: string[];
    },
    workerNodeId: string,
    requestId: string,
  ) {
    const fence = this.leases.assertFencing({
      lease_id: payload.lease_id,
      worker_node_id: workerNodeId,
      fencing_epoch: payload.fencing_epoch,
      operation: "submit_result",
    });
    if (!fence.allowed) {
      return envelope("task", "task.result_rejected", { reason: fence.reason }, { ack_of: requestId });
    }
    this.leases.release(payload.lease_id, workerNodeId);
    return envelope("task", "task.result_accepted", { task_id: payload.task_id }, { ack_of: requestId });
  }

  verifyWorkerSession(token: string) {
    const v = verifySessionToken(this.cpSecret, token);
    if (!v.ok) return v;
    if (this.nodes.isSessionRevoked(v.claims.token_id)) return { ok: false as const, reason: "revoked" };
    const node = this.nodes.get(v.claims.worker_node_id);
    if (!node || node.status === "REVOKED" || node.status === "QUARANTINED") {
      return { ok: false as const, reason: "node_not_trusted" };
    }
    return v;
  }
}

function loadOrCreateSecret(paths: FabricDataPaths): Buffer {
  const p = join(paths.root, "cp-secret.bin");
  if (existsSync(p)) return readFileSync(p);
  const secret = generateCpSecret();
  writeFileSync(p, secret, { mode: 0o600 });
  return secret;
}
