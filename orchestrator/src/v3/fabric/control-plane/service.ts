/**
 * Single active Control Plane — fleet authority for V3.7.
 */

import { randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Socket } from "node:net";
import type { TLSSocket } from "node:tls";
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
import { encodeFrame } from "../protocol/framing.js";
import { envelope, type ProtocolEnvelope } from "../protocol/messages.js";
import { buildContract } from "../worker-runtime/runtime.js";
import type { ExecutionContract, PlacementDecision } from "../types.js";
import { verifySessionToken } from "../trust/session.js";
import {
  assertPeerMatchesWorker,
  ensureFabricCa,
  issueSignedCert,
} from "../trust/ca.js";
import { FabricAdminServer } from "./admin-ipc.js";

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
  private admin?: FabricAdminServer;
  private lockPath?: string;
  private readonly mode: "active" | "attach";
  private readonly connections = new Map<string, Socket | TLSSocket>();
  private readonly pendingAcks = new Map<
    string,
    { resolve: (m: ProtocolEnvelope) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private readonly pendingResults = new Map<
    string,
    { resolve: (m: ProtocolEnvelope) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(
    fabricDir: string,
    opts?: { control_plane_id?: string; cpSecret?: Buffer; mode?: "active" | "attach" },
  ) {
    this.paths = resolveFabricDataPaths(fabricDir);
    const mode = opts?.mode ?? "active";
    this.mode = mode;
    const previous = existsSync(this.paths.cpStateFile)
      ? (JSON.parse(readFileSync(this.paths.cpStateFile, "utf8")) as ControlPlaneState)
      : undefined;
    if (mode === "attach" && previous) {
      // CLI attach must not increment or rewrite the active CP epoch.
      this.state = { ...previous };
    } else {
      this.state = {
        control_plane_id: opts?.control_plane_id ?? previous?.control_plane_id ?? `cp_${randomUUID()}`,
        epoch: mode === "active" ? (previous?.epoch ?? 0) + 1 : previous?.epoch ?? 0,
        active: true,
        started_at: previous?.started_at ?? nowIso(),
        ...(previous?.listen ? { listen: previous.listen } : {}),
        ...(previous?.tls_fingerprint ? { tls_fingerprint: previous.tls_fingerprint } : {}),
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
  }

  async startServer(
    host = "127.0.0.1",
    port = 0,
    opts?: { insecurePlaintext?: boolean },
  ): Promise<ControlPlaneState> {
    if (this.mode !== "active") throw new Error("control_plane_attach_cannot_start_server");
    if (this.server) throw new Error("control_plane_already_started");
    this.acquireProcessLock();
    const previous = existsSync(this.paths.cpStateFile)
      ? (JSON.parse(readFileSync(this.paths.cpStateFile, "utf8")) as ControlPlaneState)
      : undefined;
    this.state.epoch = (previous?.epoch ?? 0) + 1;
    this.state.started_at = nowIso();
    this.state.active = true;
    let serverCert: { key: Buffer; cert: Buffer; fingerprint: string; ca?: Buffer } | null = null;
    let listen: { host: string; port: number };
    try {
      if (!opts?.insecurePlaintext) {
        const ca = ensureFabricCa(this.paths.root, this.state.control_plane_id);
        const issued = issueSignedCert(this.paths.root, this.state.control_plane_id, {
          kind: "server",
          days: 30,
        });
        serverCert = {
          key: issued.keyPem,
          cert: issued.certPem,
          fingerprint: issued.fingerprint,
          ca: ca.caCertPem,
        };
      }
      this.server = new FabricProtocolServer({
        host,
        port,
        tls: opts?.insecurePlaintext ? false : true,
        key: serverCert?.key,
        cert: serverCert?.cert,
        ca: serverCert?.ca,
        requireClientCert: !opts?.insecurePlaintext,
        requestCert: !opts?.insecurePlaintext,
        cpSecret: this.cpSecret,
        verifySession: (token) => this.verifyWorkerSession(token),
        verifyPeerIdentity: (peer, workerNodeId) =>
          assertPeerMatchesWorker(this.paths.root, peer, workerNodeId),
        onAuthenticated: (workerNodeId, socket) => {
          this.connections.set(workerNodeId, socket);
        },
        onDisconnect: (workerNodeId, socket) => {
          const cur = this.connections.get(workerNodeId);
          if (cur === socket) this.connections.delete(workerNodeId);
        },
        handler: async (msg: ProtocolEnvelope, ctx: { socket: Socket; worker_node_id?: string }) => {
          if (msg.type === "health.heartbeat") {
            if (!ctx.worker_node_id) throw new Error("unauthenticated");
            const payload = msg.payload as { capabilities: any; resources: any };
            this.nodes.heartbeat(ctx.worker_node_id, payload.capabilities, payload.resources);
            return envelope("health", "health.heartbeat_ack", { ok: true }, { ack_of: msg.request_id });
          }
          if (msg.type === "task.ack" || msg.type === "task.reject") {
            const pend = this.pendingAcks.get(msg.ack_of ?? msg.request_id);
            if (pend) {
              this.pendingAcks.delete(msg.ack_of ?? msg.request_id);
              clearTimeout(pend.timer);
              pend.resolve(msg);
            }
            return;
          }
          if (msg.type === "task.progress") {
            atomicWriteJson(join(this.paths.auditDir, `progress-${Date.now()}.json`), {
              worker_node_id: ctx.worker_node_id,
              payload: msg.payload,
              at: nowIso(),
            });
            return envelope("task", "task.progress_ack", { ok: true }, { ack_of: msg.request_id });
          }
          if (msg.type === "task.cancel_ack") {
            return;
          }
          if (msg.type === "task.result") {
            const reply = this.handleResult(msg.payload as any, ctx.worker_node_id!, msg.request_id);
            const taskId = String((msg.payload as { task_id?: string })?.task_id ?? "");
            const pend = this.pendingResults.get(taskId);
            if (pend) {
              this.pendingResults.delete(taskId);
              clearTimeout(pend.timer);
              pend.resolve(reply as ProtocolEnvelope);
            }
            return reply;
          }
          if (msg.type === "lease.renew") {
            const p = msg.payload as { lease_id: string; ttl_ms: number };
            const lease = this.leases.renew(p.lease_id, ctx.worker_node_id!, p.ttl_ms);
            return envelope("control", "lease.renew_ok", { lease }, { ack_of: msg.request_id });
          }
          return envelope("control", "error", { reason: `unknown_type:${msg.type}` }, { ack_of: msg.request_id });
        },
      });
      listen = await this.server.listen();
      this.admin = new FabricAdminServer(this.paths.root, () => this.state.epoch, async (req) => {
        if (req.method === "status" || req.method === "fabric.status") {
          return {
            state: this.state,
            connected_workers: [...this.connections.keys()],
          };
        }
        if (req.method === "deliver" || req.method === "fabric.deliver") {
          const p = req.params ?? {};
          return this.deliverTask({
            workflow_id: String(p.workflow_id ?? `wf_${randomUUID()}`),
            task_id: String(p.task_id ?? `task_${randomUUID()}`),
            required_capabilities: Array.isArray(p.required_capabilities)
              ? (p.required_capabilities as string[])
              : ["git"],
            project_id: String(p.project_id ?? "local"),
            inputs: (p.inputs as Record<string, unknown>) ?? { objective: "noop" },
            ttl_ms: typeof p.ttl_ms === "number" ? p.ttl_ms : undefined,
            offer_timeout_ms: typeof p.offer_timeout_ms === "number" ? p.offer_timeout_ms : 10_000,
            result_timeout_ms: typeof p.result_timeout_ms === "number" ? p.result_timeout_ms : 30_000,
            wait_for_result: p.wait_for_result !== false,
          });
        }
        if (req.method === "revoke" || req.method === "fabric.revoke") {
          const id = String((req.params ?? {}).worker_node_id ?? "");
          if (!id) throw new Error("worker_node_id_required");
          return this.revokeWorker(id, String((req.params ?? {}).reason ?? "admin_revoke"));
        }
        if (req.method === "cancel" || req.method === "fabric.cancel") {
          const p = req.params ?? {};
          const leaseId = String(p.lease_id ?? "");
          const taskId = String(p.task_id ?? "");
          if (!leaseId || !taskId) throw new Error("lease_id_and_task_id_required");
          return this.cancelTask({
            lease_id: leaseId,
            task_id: taskId,
            worker_node_id: p.worker_node_id ? String(p.worker_node_id) : undefined,
            reason: p.reason ? String(p.reason) : undefined,
          });
        }
        if (req.method === "shutdown" || req.method === "fabric.shutdown") {
          await this.stop();
          return { stopped: true };
        }
        throw new Error(`unknown_admin_method:${req.method}`);
      });
      await this.admin.start();
    } catch (error) {
      await this.server?.close().catch(() => undefined);
      await this.admin?.stop().catch(() => undefined);
      this.server = undefined;
      this.admin = undefined;
      this.releaseProcessLock();
      throw error;
    }
    try {
      this.state.listen = listen;
      this.state.tls_fingerprint = serverCert?.fingerprint;
      atomicWriteJson(this.paths.cpStateFile, this.state);
      atomicWriteJson(join(this.paths.root, "tls.json"), {
        plaintext: Boolean(opts?.insecurePlaintext),
        mtls: !opts?.insecurePlaintext,
        cert: serverCert ? serverCert.cert.toString("utf8") : null,
        ca: serverCert?.ca ? serverCert.ca.toString("utf8") : null,
        fingerprint: serverCert?.fingerprint ?? null,
        host: listen.host,
        port: listen.port,
      });
      if (serverCert) {
        writeFileSync(join(this.paths.root, "cp-cert.pem"), serverCert.cert);
        writeFileSync(join(this.paths.root, "cp-key.pem"), serverCert.key, { mode: 0o600 });
        if (serverCert.ca) writeFileSync(join(this.paths.root, "ca-cert.pem"), serverCert.ca);
      }
      return this.state;
    } catch (error) {
      await this.server?.close().catch(() => undefined);
      await this.admin?.stop().catch(() => undefined);
      this.server = undefined;
      this.admin = undefined;
      this.releaseProcessLock();
      throw error;
    }
  }

  async stop(): Promise<void> {
    for (const [, pend] of this.pendingAcks) {
      clearTimeout(pend.timer);
      pend.reject(new Error("control_plane_stopped"));
    }
    this.pendingAcks.clear();
    for (const [, pend] of this.pendingResults) {
      clearTimeout(pend.timer);
      pend.reject(new Error("control_plane_stopped"));
    }
    this.pendingResults.clear();
    this.connections.clear();
    await this.admin?.stop().catch(() => undefined);
    this.admin = undefined;
    await this.server?.close();
    this.server = undefined;
    this.releaseProcessLock();
  }

  connectedWorkers(): string[] {
    return [...this.connections.keys()];
  }

  /** Revoke trust and immediately destroy any live protocol socket (AUD-MTLS-03). */
  revokeWorker(workerNodeId: string, reason: string) {
    const rec = this.nodes.revoke(workerNodeId, reason);
    this.disconnectWorker(workerNodeId, `revoked:${reason}`);
    return rec;
  }

  /**
   * Cancel an in-flight task: revoke lease (fencing rejects late commits) and push task.cancel.
   */
  cancelTask(input: {
    lease_id: string;
    task_id: string;
    worker_node_id?: string;
    reason?: string;
  }): { lease_status: string; cancel_pushed: boolean } {
    const lease = this.leases.revoke(input.lease_id);
    const workerId = input.worker_node_id ?? lease.owner_worker_node_id;
    const socket = this.connections.get(workerId);
    let cancel_pushed = false;
    if (socket && !socket.destroyed) {
      socket.write(
        encodeFrame(
          envelope(
            "task",
            "task.cancel",
            {
              task_id: input.task_id,
              lease_id: input.lease_id,
              reason: input.reason ?? "operator_cancel",
            },
            { worker_node_id: workerId },
          ),
        ),
      );
      cancel_pushed = true;
    }
    const pend = this.pendingResults.get(input.task_id);
    if (pend) {
      this.pendingResults.delete(input.task_id);
      clearTimeout(pend.timer);
      pend.resolve(
        envelope("task", "task.result_rejected", { reason: "lease_revoked_cancelled" }, {}),
      );
    }
    return { lease_status: lease.status, cancel_pushed };
  }

  disconnectWorker(workerNodeId: string, reason: string): boolean {
    const socket = this.connections.get(workerNodeId);
    this.connections.delete(workerNodeId);
    if (!socket || socket.destroyed) return false;
    try {
      socket.write(encodeFrame(envelope("control", "error", { reason: `disconnected:${reason}` })));
    } catch {
      /* ignore */
    }
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
    return true;
  }

  /**
   * Live delivery: place → lease → offer → ack → (optional) wait result_accepted.
   * `acked` ≠ `completed`. Set wait_for_result=true for certification path (AUD-DEL-01).
   */
  async deliverTask(input: {
    workflow_id: string;
    task_id: string;
    required_capabilities: string[];
    project_id: string;
    inputs?: Record<string, unknown>;
    ttl_ms?: number;
    offer_timeout_ms?: number;
    result_timeout_ms?: number;
    wait_for_result?: boolean;
  }): Promise<{
    decision: PlacementDecision;
    contract?: ExecutionContract;
    lease_id?: string;
    delivery?: {
      status: "acked" | "rejected" | "timeout" | "result_accepted" | "result_rejected" | "result_timeout";
      ack?: ProtocolEnvelope;
      result?: ProtocolEnvelope;
    };
  }> {
    if (!this.server) throw new Error("control_plane_not_serving");
    const placed = this.dispatchTask(input);
    if (!placed.contract || !placed.lease_id) {
      return placed;
    }
    const contract = placed.contract;
    const leaseId = placed.lease_id;
    const workerId = contract.worker_node_id;
    const socket = this.connections.get(workerId);
    if (!socket || socket.destroyed) {
      this.leases.release(leaseId, workerId);
      throw new Error(`worker_not_connected:${workerId}`);
    }
    const offer = envelope(
      "task",
      "task.offer",
      { contract, lease_id: leaseId },
      { worker_node_id: workerId, correlation_id: contract.contract_id },
    );
    const timeoutMs = input.offer_timeout_ms ?? 10_000;
    const ackPromise = new Promise<ProtocolEnvelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(offer.request_id);
        reject(new Error("offer_timeout"));
      }, timeoutMs);
      this.pendingAcks.set(offer.request_id, { resolve, reject, timer });
    });
    const waitResult = input.wait_for_result !== false;
    const resultTimeout = input.result_timeout_ms ?? 30_000;
    let resultPromise: Promise<ProtocolEnvelope> | undefined;
    if (waitResult) {
      resultPromise = new Promise<ProtocolEnvelope>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingResults.delete(contract.task_id);
          reject(new Error("result_timeout"));
        }, resultTimeout);
        this.pendingResults.set(contract.task_id, { resolve, reject, timer });
      });
    }
    socket.write(encodeFrame(offer));
    try {
      const ack = await ackPromise;
      if (ack.type === "task.reject") {
        this.pendingResults.delete(contract.task_id);
        this.leases.release(leaseId, workerId);
        return { ...placed, delivery: { status: "rejected", ack } };
      }
      if (!waitResult || !resultPromise) {
        return { ...placed, delivery: { status: "acked", ack } };
      }
      try {
        const result = await resultPromise;
        const status =
          result.type === "task.result_accepted" ? "result_accepted" : "result_rejected";
        return { ...placed, delivery: { status, ack, result } };
      } catch (err) {
        if (err instanceof Error && err.message === "result_timeout") {
          return { ...placed, delivery: { status: "result_timeout", ack } };
        }
        throw err;
      }
    } catch (err) {
      this.pendingAcks.delete(offer.request_id);
      this.pendingResults.delete(contract.task_id);
      if (err instanceof Error && err.message === "offer_timeout") {
        this.leases.release(leaseId, workerId);
        return { ...placed, delivery: { status: "timeout" } };
      }
      throw err;
    }
  }

  private acquireProcessLock(): void {
    const lockPath = join(this.paths.root, "control-plane.lock");
    const create = () => {
      const fd = openSync(lockPath, "wx", 0o600);
      try { writeFileSync(fd, `${process.pid}\n`, "utf8"); } finally { closeSync(fd); }
    };
    try {
      create();
      this.lockPath = lockPath;
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    let ownerPid = 0;
    try { ownerPid = Number(readFileSync(lockPath, "utf8").trim()); } catch { /* malformed lock */ }
    if (Number.isInteger(ownerPid) && ownerPid > 0) {
      try { process.kill(ownerPid, 0); throw new Error(`control_plane_already_locked:pid=${ownerPid}`); }
      catch (error) {
        if (error instanceof Error && error.message.startsWith("control_plane_already_locked:")) throw error;
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
    unlinkSync(lockPath);
    create();
    this.lockPath = lockPath;
  }

  private releaseProcessLock(): void {
    if (!this.lockPath) return;
    try {
      const owner = Number(readFileSync(this.lockPath, "utf8").trim());
      if (owner === process.pid) unlinkSync(this.lockPath);
    } catch { /* already released */ }
    this.lockPath = undefined;
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
    if (v.claims.control_plane_id !== this.state.control_plane_id) {
      return { ok: false as const, reason: "wrong_control_plane" };
    }
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
