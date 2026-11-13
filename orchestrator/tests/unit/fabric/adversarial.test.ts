import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ControlPlaneService } from "../../../src/v3/fabric/control-plane/service.js";
import { generateNodeIdentity } from "../../../src/v3/fabric/trust/identity.js";
import { discoverCapabilities, sampleResources } from "../../../src/v3/fabric/capability/inventory.js";
import { encodeFrame, FrameDecoder, MAX_FRAME_BYTES } from "../../../src/v3/fabric/protocol/framing.js";
import { createSessionToken } from "../../../src/v3/fabric/trust/session.js";

function enroll(cp: ControlPlaneService) {
  const km = generateNodeIdentity();
  const pending = cp.nodes.submitEnrollment({
    kind: "EnrollmentRequest",
    request_id: `r-${Math.random()}`,
    public_key_spki_b64: km.public_key_spki_b64,
    owner: "t",
    fleet: "f",
    protocol_versions: ["1.0"],
    version: "3.7",
    capabilities: discoverCapabilities(),
    resources: sampleResources(2),
    advertise_endpoints: [],
    requested_at: new Date().toISOString(),
  });
  const auth = cp.nodes.authorizeEnrollment(pending.worker_node_id!);
  return { ...pending, auth, worker_node_id: pending.worker_node_id! };
}

describe("V3.7 adversarial", () => {
  it("rejects oversized frames", () => {
    expect(() => encodeFrame({ x: "a".repeat(MAX_FRAME_BYTES) })).toThrow(/frame_too_large/);
  });

  it("rejects malformed trailing bytes safely", () => {
    const dec = new FrameDecoder();
    const good = encodeFrame({ ok: true });
    expect(dec.push(good)).toEqual([{ ok: true }]);
    // partial header should not throw
    expect(dec.push(Buffer.from([0, 0]))).toEqual([]);
  });

  it("revoked node cannot authorize new leases via dispatch selection", () => {
    const cp = new ControlPlaneService(mkdtempSync(join(tmpdir(), "adv-")));
    const a = enroll(cp);
    cp.nodes.heartbeat(a.worker_node_id, discoverCapabilities(), sampleResources(2));
    cp.nodes.revoke(a.worker_node_id, "adv");
    const d = cp.dispatchTask({
      workflow_id: "w",
      task_id: "t",
      required_capabilities: ["git"],
      project_id: "p",
    });
    expect(d.contract).toBeUndefined();
    expect(d.decision.hard_rejects.some((r) => r.reason.includes("REVOKED") || r.reason.startsWith("trust") || r.reason.startsWith("status"))).toBe(true);
  });

  it("duplicate result after revoke is fenced", () => {
    const cp = new ControlPlaneService(mkdtempSync(join(tmpdir(), "adv2-")));
    const a = enroll(cp);
    const lease = cp.leases.issue({
      resource_key: "task:x",
      task_id: "x",
      owner_worker_node_id: a.worker_node_id,
      ttl_ms: 60_000,
      allowed_operations: ["submit_result"],
    });
    cp.leases.revoke(lease.lease_id);
    const fence = cp.leases.assertFencing({
      lease_id: lease.lease_id,
      worker_node_id: a.worker_node_id,
      fencing_epoch: lease.fencing_epoch,
      operation: "submit_result",
    });
    expect(fence.allowed).toBe(false);
  });

  it("replayed session after revoke fails verifyWorkerSession", () => {
    const cp = new ControlPlaneService(mkdtempSync(join(tmpdir(), "adv3-")));
    const a = enroll(cp);
    const token = a.auth.session_token!;
    expect(cp.verifyWorkerSession(token).ok).toBe(true);
    cp.nodes.revoke(a.worker_node_id, "adv");
    expect(cp.verifyWorkerSession(token).ok).toBe(false);
  });

  it("forged session mac fails", () => {
    const secret = Buffer.alloc(32, 1);
    const { token } = createSessionToken(secret, {
      worker_node_id: "wn",
      expires_at: Date.now() + 10000,
      control_plane_id: "cp",
    });
    const cp = new ControlPlaneService(mkdtempSync(join(tmpdir(), "adv4-")), { cpSecret: secret });
    expect(cp.verifyWorkerSession(token + "00").ok).toBe(false);
  });
});
