/**
 * Node Registry — authoritative Worker Node enrollment, trust, revoke, heartbeat.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { atomicWriteJson, nowIso } from "../../ops/atomic.js";
import type { FabricDataPaths } from "../paths.js";
import type {
  EnrollmentDecision,
  EnrollmentRequest,
  WorkerNodeRecord,
  WorkerNodeState,
  TrustState,
  CapabilityInventory,
  ResourceInventorySample,
} from "../types.js";
import { createSessionToken } from "../trust/session.js";
import { toIdentityRecord, type NodeKeyMaterial } from "../trust/identity.js";

function nodePath(paths: FabricDataPaths, id: string): string {
  return join(paths.nodesDir, `${id}.json`);
}

function audit(paths: FabricDataPaths, event: Record<string, unknown>): void {
  const name = `${Date.now()}-${randomUUID().slice(0, 8)}.json`;
  atomicWriteJson(join(paths.auditDir, name), { ...event, at: nowIso() });
}

export class NodeRegistry {
  constructor(
    private readonly paths: FabricDataPaths,
    private readonly cpSecret: Buffer,
    private readonly controlPlaneId: string,
  ) {}

  list(): WorkerNodeRecord[] {
    return readdirSync(this.paths.nodesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.paths.nodesDir, f), "utf8")) as WorkerNodeRecord);
  }

  get(workerNodeId: string): WorkerNodeRecord | undefined {
    const p = nodePath(this.paths, workerNodeId);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf8")) as WorkerNodeRecord;
  }

  private save(rec: WorkerNodeRecord): void {
    atomicWriteJson(nodePath(this.paths, rec.identity.worker_node_id), rec);
  }

  /** Idempotent state transition with fail-closed guards. */
  transition(workerNodeId: string, to: WorkerNodeState, reason?: string): WorkerNodeRecord {
    const rec = this.get(workerNodeId);
    if (!rec) throw new Error(`unknown_node:${workerNodeId}`);
    if (rec.status === "REVOKED" && to !== "REVOKED") {
      throw new Error("revoked_node_immutable");
    }
    const trustMap: Partial<Record<WorkerNodeState, TrustState>> = {
      PENDING_ENROLLMENT: "pending",
      ONLINE: "trusted",
      DEGRADED: "trusted",
      DRAINING: "trusted",
      OFFLINE: "trusted",
      QUARANTINED: "quarantined",
      REVOKED: "revoked",
    };
    rec.status = to;
    rec.trust = trustMap[to] ?? rec.trust;
    if (to === "QUARANTINED") rec.quarantine_reason = reason;
    if (to === "REVOKED") rec.revoked_at = nowIso();
    rec.updated_at = nowIso();
    this.save(rec);
    audit(this.paths, { type: "node.state", worker_node_id: workerNodeId, to, reason });
    return rec;
  }

  submitEnrollment(req: EnrollmentRequest): EnrollmentDecision {
    atomicWriteJson(join(this.paths.enrollmentDir, `${req.request_id}.json`), req);
    // Fail-closed: incomplete identity rejected
    if (!req.public_key_spki_b64 || !req.owner || !req.fleet) {
      const denied: EnrollmentDecision = {
        kind: "EnrollmentDecision",
        request_id: req.request_id,
        approved: false,
        reason: "incomplete_identity",
        decided_at: nowIso(),
      };
      audit(this.paths, { type: "enrollment.denied", ...denied });
      return denied;
    }
    if (!req.protocol_versions.includes("1.0")) {
      return {
        kind: "EnrollmentDecision",
        request_id: req.request_id,
        approved: false,
        reason: "protocol_unsupported",
        decided_at: nowIso(),
      };
    }
    // Pending until authorizeEnrollment (human/policy). Auto-create pending node keyed by pubkey hash.
    const worker_node_id = `wn_${createHash("sha256").update(req.public_key_spki_b64).digest("hex").slice(0, 32)}`;
    const existing = this.get(worker_node_id);
    if (existing?.status === "REVOKED") {
      return {
        kind: "EnrollmentDecision",
        request_id: req.request_id,
        approved: false,
        reason: "node_revoked",
        decided_at: nowIso(),
      };
    }
    const rec: WorkerNodeRecord = {
      kind: "WorkerNodeRecord",
      identity: {
        worker_node_id,
        public_key_spki_b64: req.public_key_spki_b64,
        key_alg: "Ed25519",
        created_at: existing?.identity.created_at ?? nowIso(),
      },
      owner: req.owner,
      fleet: req.fleet,
      protocol_versions: req.protocol_versions,
      capabilities: req.capabilities,
      resources: req.resources,
      status: "PENDING_ENROLLMENT",
      trust: "pending",
      credential: {},
      version: req.version,
      updated_at: nowIso(),
      advertise_endpoints: req.advertise_endpoints,
    };
    this.save(rec);
    audit(this.paths, { type: "enrollment.submitted", request_id: req.request_id, worker_node_id });
    return {
      kind: "EnrollmentDecision",
      request_id: req.request_id,
      approved: false,
      worker_node_id,
      reason: "pending_authorization",
      decided_at: nowIso(),
    };
  }

  authorizeEnrollment(workerNodeId: string, ttlMs = 3_600_000): EnrollmentDecision {
    const rec = this.get(workerNodeId);
    if (!rec) throw new Error(`unknown_node:${workerNodeId}`);
    if (rec.status === "REVOKED") throw new Error("node_revoked");
    const { token, claims } = createSessionToken(this.cpSecret, {
      worker_node_id: workerNodeId,
      expires_at: Date.now() + ttlMs,
      control_plane_id: this.controlPlaneId,
    });
    rec.status = "ONLINE";
    rec.trust = "trusted";
    rec.enrolled_at = rec.enrolled_at ?? nowIso();
    rec.credential = {
      session_token_id: claims.token_id,
      expires_at: new Date(claims.expires_at).toISOString(),
      rotated_at: nowIso(),
    };
    rec.updated_at = nowIso();
    this.save(rec);
    atomicWriteJson(join(this.paths.credentialsDir, `${claims.token_id}.json`), {
      worker_node_id: workerNodeId,
      token_id: claims.token_id,
      expires_at: claims.expires_at,
      revoked: false,
    });
    const decision: EnrollmentDecision = {
      kind: "EnrollmentDecision",
      request_id: `authz-${workerNodeId}`,
      approved: true,
      worker_node_id: workerNodeId,
      session_token: token,
      session_expires_at: new Date(claims.expires_at).toISOString(),
      decided_at: nowIso(),
    };
    audit(this.paths, { type: "enrollment.authorized", worker_node_id: workerNodeId, token_id: claims.token_id });
    return decision;
  }

  revoke(workerNodeId: string, reason: string): WorkerNodeRecord {
    const rec = this.transition(workerNodeId, "REVOKED", reason);
    // Invalidate sessions
    for (const f of readdirSync(this.paths.credentialsDir)) {
      if (!f.endsWith(".json")) continue;
      const p = join(this.paths.credentialsDir, f);
      const c = JSON.parse(readFileSync(p, "utf8")) as {
        worker_node_id: string;
        token_id: string;
        revoked: boolean;
      };
      if (c.worker_node_id === workerNodeId && !c.revoked) {
        c.revoked = true;
        atomicWriteJson(p, c);
      }
    }
    audit(this.paths, { type: "node.revoked", worker_node_id: workerNodeId, reason });
    return rec;
  }

  quarantine(workerNodeId: string, reason: string): WorkerNodeRecord {
    return this.transition(workerNodeId, "QUARANTINED", reason);
  }

  heartbeat(
    workerNodeId: string,
    caps: CapabilityInventory,
    resources: ResourceInventorySample,
  ): WorkerNodeRecord {
    const rec = this.get(workerNodeId);
    if (!rec) throw new Error(`unknown_node:${workerNodeId}`);
    if (rec.status === "REVOKED" || rec.status === "QUARANTINED") {
      throw new Error(`heartbeat_rejected:${rec.status}`);
    }
    rec.capabilities = caps;
    rec.resources = resources;
    rec.last_heartbeat_at = nowIso();
    if (rec.status === "OFFLINE" || rec.status === "PENDING_ENROLLMENT") {
      // enrollment still pending stays; offline → degraded until health policy
      if (rec.status === "OFFLINE") rec.status = "DEGRADED";
    }
    rec.updated_at = nowIso();
    this.save(rec);
    return rec;
  }

  isSessionRevoked(tokenId: string): boolean {
    const p = join(this.paths.credentialsDir, `${tokenId}.json`);
    if (!existsSync(p)) return true;
    const c = JSON.parse(readFileSync(p, "utf8")) as { revoked: boolean; expires_at: number };
    if (c.revoked) return true;
    if (c.expires_at <= Date.now()) return true;
    return false;
  }

  /** Bootstrap from local key material (tests / first enroll). */
  registerFromKeyMaterial(
    km: NodeKeyMaterial,
    partial: Omit<WorkerNodeRecord, "kind" | "identity" | "updated_at" | "credential" | "status" | "trust"> & {
      status?: WorkerNodeState;
      trust?: TrustState;
    },
  ): WorkerNodeRecord {
    const rec: WorkerNodeRecord = {
      kind: "WorkerNodeRecord",
      identity: toIdentityRecord(km),
      owner: partial.owner,
      fleet: partial.fleet,
      protocol_versions: partial.protocol_versions,
      capabilities: partial.capabilities,
      resources: partial.resources,
      status: partial.status ?? "PENDING_ENROLLMENT",
      trust: partial.trust ?? "pending",
      credential: {},
      version: partial.version,
      updated_at: nowIso(),
      advertise_endpoints: partial.advertise_endpoints,
    };
    this.save(rec);
    return rec;
  }
}
