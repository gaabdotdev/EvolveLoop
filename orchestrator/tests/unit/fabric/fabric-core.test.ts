import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ControlPlaneService } from "../../../src/v3/fabric/control-plane/service.js";
import { generateNodeIdentity } from "../../../src/v3/fabric/trust/identity.js";
import { createSessionToken, verifySessionToken } from "../../../src/v3/fabric/trust/session.js";
import { encodeFrame, FrameDecoder, MAX_FRAME_BYTES } from "../../../src/v3/fabric/protocol/framing.js";
import { discoverCapabilities, isInventoryFresh, sampleResources } from "../../../src/v3/fabric/capability/inventory.js";
import { buildContract, WorkerRuntime, hashContract } from "../../../src/v3/fabric/worker-runtime/runtime.js";
import { SpeculativeEngine } from "../../../src/v3/fabric/speculative/engine.js";

function freshCp(): ControlPlaneService {
  const dir = mkdtempSync(join(tmpdir(), "el-fabric-"));
  return new ControlPlaneService(dir);
}

function enrollTrusted(cp: ControlPlaneService, capsExtra?: string[]) {
  const km = generateNodeIdentity();
  const caps = discoverCapabilities({ slots: 2 });
  if (capsExtra) {
    for (const c of capsExtra) caps.harnesses.push(c);
  }
  const resources = sampleResources(2);
  const pending = cp.nodes.submitEnrollment({
    kind: "EnrollmentRequest",
    request_id: `req_${km.worker_node_id}`,
    public_key_spki_b64: km.public_key_spki_b64,
    owner: "test",
    fleet: "lab",
    protocol_versions: ["1.0"],
    version: "3.7-test",
    capabilities: caps,
    resources,
    advertise_endpoints: [],
    requested_at: new Date().toISOString(),
  });
  const auth = cp.nodes.authorizeEnrollment(pending.worker_node_id!);
  return { km, pending, auth, worker_node_id: pending.worker_node_id! };
}

describe("V3.7 fabric core", () => {
  let cp: ControlPlaneService;
  beforeEach(() => {
    cp = freshCp();
  });

  it("generates Ed25519 node identity distinct from agent ids", () => {
    const a = generateNodeIdentity();
    const b = generateNodeIdentity();
    expect(a.worker_node_id).not.toEqual(b.worker_node_id);
    expect(a.public_key_spki_b64).toBeTruthy();
    expect(a.worker_node_id.startsWith("wn_")).toBe(true);
  });

  it("enrollment starts untrusted and authorize issues session", () => {
    const { pending, auth, worker_node_id } = enrollTrusted(cp);
    expect(pending.approved).toBe(false);
    expect(auth.approved).toBe(true);
    expect(auth.session_token).toBeTruthy();
    const node = cp.nodes.get(worker_node_id)!;
    expect(node.status).toBe("ONLINE");
    expect(node.trust).toBe("trusted");
    const v = verifySessionToken(cp.cpSecret, auth.session_token!);
    expect(v.ok).toBe(true);
  });

  it("rejects incomplete enrollment", () => {
    const d = cp.nodes.submitEnrollment({
      kind: "EnrollmentRequest",
      request_id: "x",
      public_key_spki_b64: "",
      owner: "",
      fleet: "",
      protocol_versions: ["1.0"],
      version: "x",
      capabilities: discoverCapabilities(),
      resources: sampleResources(),
      advertise_endpoints: [],
      requested_at: new Date().toISOString(),
    });
    expect(d.approved).toBe(false);
    expect(d.reason).toBe("incomplete_identity");
  });

  it("revoke blocks heartbeat and new trust", () => {
    const { worker_node_id } = enrollTrusted(cp);
    cp.nodes.revoke(worker_node_id, "test");
    expect(cp.nodes.get(worker_node_id)!.status).toBe("REVOKED");
    expect(() =>
      cp.nodes.heartbeat(worker_node_id, discoverCapabilities(), sampleResources()),
    ).toThrow(/heartbeat_rejected/);
  });

  it("session token rejects bad mac and expiry", () => {
    const secret = Buffer.alloc(32, 7);
    const { token } = createSessionToken(secret, {
      worker_node_id: "wn_x",
      expires_at: Date.now() + 60_000,
      control_plane_id: "cp",
    });
    expect(verifySessionToken(secret, token + "x").ok).toBe(false);
    const expired = createSessionToken(secret, {
      worker_node_id: "wn_x",
      expires_at: Date.now() - 1,
      control_plane_id: "cp",
    });
    expect(verifySessionToken(secret, expired.token).ok).toBe(false);
  });

  it("protocol framing roundtrip and size limit", () => {
    const frame = encodeFrame({ hello: true });
    const dec = new FrameDecoder();
    const msgs = dec.push(frame);
    expect(msgs).toEqual([{ hello: true }]);
    expect(() => encodeFrame({ x: "y".repeat(MAX_FRAME_BYTES) })).toThrow(/frame_too_large/);
  });

  it("hard constraints beat soft ranking; stale inventory rejected", () => {
    const { worker_node_id } = enrollTrusted(cp, ["git"]);
    const node = cp.nodes.get(worker_node_id)!;
    node.resources.sampled_at = new Date(Date.now() - 3600_000).toISOString();
    // save stale via heartbeat path not used — mutate file through transition noop
    const decision = cp.placement.place([node], {
      task_id: "t1",
      required_capabilities: ["git"],
      protocol_version: "1.0",
    });
    expect(decision.selected_worker_node_id).toBeUndefined();
    expect(decision.hard_rejects[0]?.reason).toBe("stale_inventory");
  });

  it("placement selects trusted node with fresh inventory", () => {
    const { worker_node_id } = enrollTrusted(cp);
    // refresh
    cp.nodes.heartbeat(worker_node_id, discoverCapabilities(), sampleResources(2));
    const decision = cp.placement.place(cp.nodes.list(), {
      task_id: "t2",
      required_capabilities: ["git"],
      protocol_version: "1.0",
    });
    expect(decision.selected_worker_node_id).toBe(worker_node_id);
  });

  it("pools membership by selectors", () => {
    const { worker_node_id } = enrollTrusted(cp);
    cp.nodes.heartbeat(worker_node_id, discoverCapabilities(), sampleResources(2));
    const pool = cp.pools.create({
      name: "linux",
      selectors: { capabilities_any: ["git"], statuses: ["ONLINE", "DEGRADED"] },
      constraints: {},
      max_concurrency: 2,
      budget: {},
      priority: 10,
      draining: false,
    });
    cp.pools.reconcileMembership(cp.nodes.list());
    expect(cp.pools.get(pool.pool_id)!.member_worker_node_ids).toContain(worker_node_id);
  });

  it("leases fencing rejects stale epoch and double booking", () => {
    const { worker_node_id } = enrollTrusted(cp);
    const lease = cp.leases.issue({
      resource_key: "task:t",
      task_id: "t",
      owner_worker_node_id: worker_node_id,
      ttl_ms: 60_000,
      allowed_operations: ["submit_result"],
    });
    expect(() =>
      cp.leases.issue({
        resource_key: "task:t",
        task_id: "t",
        owner_worker_node_id: worker_node_id,
        ttl_ms: 60_000,
        allowed_operations: ["submit_result"],
      }),
    ).toThrow(/double_booking/);
    const ok = cp.leases.assertFencing({
      lease_id: lease.lease_id,
      worker_node_id,
      fencing_epoch: lease.fencing_epoch,
      operation: "submit_result",
    });
    expect(ok.allowed).toBe(true);
    const stale = cp.leases.assertFencing({
      lease_id: lease.lease_id,
      worker_node_id,
      fencing_epoch: lease.fencing_epoch - 1,
      operation: "submit_result",
    });
    expect(stale.allowed).toBe(false);
    expect(stale.reason).toBe("stale_fencing");
  });

  it("artifact hash verify and cross-project deny", async () => {
    const { worker_node_id } = enrollTrusted(cp);
    const dir = mkdtempSync(join(tmpdir(), "art-"));
    const file = join(dir, "a.txt");
    writeFileSync(file, "hello-fabric");
    const art = await cp.artifacts.putLocalFile({
      filePath: file,
      content_type: "text/plain",
      origin_worker_node_id: worker_node_id,
      project_ids: ["p1"],
    });
    expect(cp.artifacts.verify(art.artifact_id).integrity_status).toBe("verified");
    expect(cp.artifacts.authorizeRead(art.artifact_id, "p1")).toBe(true);
    expect(cp.artifacts.authorizeRead(art.artifact_id, "p2")).toBe(false);
  });

  it("worker runtime validates contract hash and executes", async () => {
    const { worker_node_id } = enrollTrusted(cp);
    const lease = cp.leases.issue({
      resource_key: "task:run1",
      task_id: "run1",
      owner_worker_node_id: worker_node_id,
      ttl_ms: 60_000,
      allowed_operations: ["*"],
    });
    const contract = buildContract({
      workflow_id: "wf",
      task_id: "run1",
      inputs: {},
      dependency_refs: [],
      artifact_refs: [],
      required_capabilities: [],
      permissions: [],
      budget: {},
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
      sandbox_profile: "none",
      network_policy: "deny",
      worker_node_id,
      lease_id: lease.lease_id,
      fencing_epoch: lease.fencing_epoch,
      evidence_requirements: [],
      retry_policy: { max_retries: 0, backoff_ms: 0 },
      cancel_policy: { graceful_ms: 1000, force_after_ms: 2000 },
    });
    expect(hashContract(contract)).toBe(contract.contract_hash);
    const rt = new WorkerRuntime({
      worker_node_id,
      workRoot: mkdtempSync(join(tmpdir(), "wr-")),
      slots: 2,
    });
    const result = await rt.execute(contract);
    expect(result.status).toBe("completed");
    expect(result.stdout).toMatch(/worker-task-ok:run1/);
  });

  it("team topology change versions and rejects orphans", () => {
    const team = cp.teams.create({
      objective: "ship",
      member_agent_ids: ["a1", "a2"],
      topology: "hierarchical",
      owner: "cp",
    });
    const v2 = cp.teams.changeTopology(team.team_id, "pipeline");
    expect(v2.topology_version).toBe(2);
    expect(() =>
      cp.teams.create({
        objective: "x",
        member_agent_ids: ["a"],
        topology: "recursive",
        owner: "cp",
        parent_team_id: "missing",
      }),
    ).toThrow(/orphan_parent/);
  });

  it("work stealing requires eligibility and issues new fencing", () => {
    const a = enrollTrusted(cp);
    const b = enrollTrusted(cp);
    const lease = cp.leases.issue({
      resource_key: "task:steal",
      task_id: "steal",
      owner_worker_node_id: a.worker_node_id,
      ttl_ms: 60_000,
      allowed_operations: ["*"],
    });
    const res = cp.stealer.steal({
      candidate: {
        task_id: "steal",
        eligibility: "paused",
        artifacts_intact: true,
        dependencies_available: true,
        owner_lease_id: lease.lease_id,
        portable: true,
      },
      new_owner_worker_node_id: b.worker_node_id,
      ttl_ms: 60_000,
      estimate_roi: 1,
    });
    expect(res.ok).toBe(true);
    expect(res.fencing_epoch).toBeGreaterThan(lease.fencing_epoch);
    expect(cp.leases.get(lease.lease_id)!.status).toBe("revoked");
    // old owner cannot publish
    const denied = cp.leases.assertFencing({
      lease_id: lease.lease_id,
      worker_node_id: a.worker_node_id,
      fencing_epoch: lease.fencing_epoch,
      operation: "submit_result",
    });
    expect(denied.allowed).toBe(false);
  });

  it("speculative engine gated and cancels losers without auto-integrate", () => {
    const eng = new SpeculativeEngine().withPolicy({ enabled: true, max_budget_units: 50 });
    const run = eng.start({
      task_id: "s1",
      alternatives: 2,
      inputs_immutable: true,
      has_external_side_effects: false,
      budget_units: 40,
    });
    expect("blocked" in run).toBe(false);
    if ("blocked" in run) return;
    const scored = eng.evaluateAndSelect(run, {
      [run.attempts[0].attempt_id]: 1,
      [run.attempts[1].attempt_id]: 5,
    });
    expect(scored.winner_attempt_id).toBe(run.attempts[1].attempt_id);
    expect(scored.cancelled_attempt_ids).toContain(run.attempts[0].attempt_id);
    expect(scored.integrated).toBe(false);
  });

  it("inventory freshness helper", () => {
    expect(isInventoryFresh(new Date().toISOString(), { max_age_ms: 1000 })).toBe(true);
    expect(isInventoryFresh(new Date(Date.now() - 5000).toISOString(), { max_age_ms: 1000 })).toBe(false);
  });
});
