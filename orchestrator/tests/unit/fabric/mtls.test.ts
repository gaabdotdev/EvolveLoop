import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ControlPlaneService } from "../../../src/v3/fabric/control-plane/service.js";
import { FabricProtocolClient } from "../../../src/v3/fabric/protocol/client.js";
import { generateNodeIdentity } from "../../../src/v3/fabric/trust/identity.js";
import { discoverCapabilities, sampleResources } from "../../../src/v3/fabric/capability/inventory.js";
import { issueSignedCert, ensureFabricCa } from "../../../src/v3/fabric/trust/ca.js";
import { randomUUID } from "node:crypto";

describe("V3.7 mTLS identity", () => {
  const cps: ControlPlaneService[] = [];
  const dirs: string[] = [];

  afterEach(async () => {
    for (const cp of cps.splice(0)) await cp.stop().catch(() => undefined);
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  async function enrollWorker(cp: ControlPlaneService, fabricDir: string) {
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
    const decision = cp.nodes.authorizeEnrollment(pending.worker_node_id!);
    expect(decision.client_cert_pem).toBeTruthy();
    expect(decision.cert_fingerprint).toBeTruthy();
    const work = join(fabricDir, "workers", pending.worker_node_id!);
    mkdirSync(work, { recursive: true });
    writeFileSync(join(work, "client-cert.pem"), decision.client_cert_pem!, { mode: 0o600 });
    writeFileSync(join(work, "client-key.pem"), decision.client_key_pem!, { mode: 0o600 });
    writeFileSync(join(work, "ca-cert.pem"), decision.ca_cert_pem!);
    writeFileSync(join(work, "session.token"), decision.session_token!, { mode: 0o600 });
    return { workerNodeId: pending.worker_node_id!, decision, work };
  }

  it("accepts enrolled worker over mTLS with matching client cert", async () => {
    const dir = mkdtempSync(join(tmpdir(), "el-mtls-ok-"));
    dirs.push(dir);
    const cp = new ControlPlaneService(dir);
    cps.push(cp);
    const state = await cp.startServer("127.0.0.1", 0);
    expect(existsSync(join(dir, "ca", "ca-cert.pem"))).toBe(true);
    expect(state.tls_fingerprint).toBeTruthy();

    const { workerNodeId, decision, work } = await enrollWorker(cp, dir);
    const client = new FabricProtocolClient({
      host: state.listen!.host,
      port: state.listen!.port,
      tls: true,
      ca: readFileSync(join(work, "ca-cert.pem")),
      cert: readFileSync(join(work, "client-cert.pem")),
      key: readFileSync(join(work, "client-key.pem")),
      rejectUnauthorized: true,
      sessionToken: decision.session_token!,
      worker_node_id: workerNodeId,
    });
    await client.connect();
    client.close();
  });

  it("rejects connection without client certificate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "el-mtls-nocert-"));
    dirs.push(dir);
    const cp = new ControlPlaneService(dir);
    cps.push(cp);
    const state = await cp.startServer("127.0.0.1", 0);
    const { workerNodeId, decision, work } = await enrollWorker(cp, dir);
    const client = new FabricProtocolClient({
      host: state.listen!.host,
      port: state.listen!.port,
      tls: true,
      ca: readFileSync(join(work, "ca-cert.pem")),
      rejectUnauthorized: true,
      sessionToken: decision.session_token!,
      worker_node_id: workerNodeId,
    });
    await expect(client.connect()).rejects.toThrow();
  });

  it("rejects foreign CA client certificate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "el-mtls-foreign-"));
    dirs.push(dir);
    const foreign = mkdtempSync(join(tmpdir(), "el-mtls-foreign-ca-"));
    dirs.push(foreign);
    const cp = new ControlPlaneService(dir);
    cps.push(cp);
    const state = await cp.startServer("127.0.0.1", 0);
    const { workerNodeId, decision, work } = await enrollWorker(cp, dir);
    ensureFabricCa(foreign, "evil-ca");
    const evil = issueSignedCert(foreign, workerNodeId, { kind: "client" });
    const client = new FabricProtocolClient({
      host: state.listen!.host,
      port: state.listen!.port,
      tls: true,
      ca: readFileSync(join(work, "ca-cert.pem")),
      cert: evil.certPem,
      key: evil.keyPem,
      rejectUnauthorized: true,
      sessionToken: decision.session_token!,
      worker_node_id: workerNodeId,
    });
    await expect(client.connect()).rejects.toThrow();
  });

  it("rejects identity mismatch between cert CN and session worker", async () => {
    const dir = mkdtempSync(join(tmpdir(), "el-mtls-mismatch-"));
    dirs.push(dir);
    const cp = new ControlPlaneService(dir);
    cps.push(cp);
    const state = await cp.startServer("127.0.0.1", 0);
    const a = await enrollWorker(cp, dir);
    const b = await enrollWorker(cp, dir);
    const client = new FabricProtocolClient({
      host: state.listen!.host,
      port: state.listen!.port,
      tls: true,
      ca: readFileSync(join(a.work, "ca-cert.pem")),
      cert: readFileSync(join(b.work, "client-cert.pem")),
      key: readFileSync(join(b.work, "client-key.pem")),
      rejectUnauthorized: true,
      sessionToken: a.decision.session_token!,
      worker_node_id: a.workerNodeId,
    });
    await expect(client.connect()).rejects.toThrow(/mtls_identity|identity_mismatch|ECONNRESET|error/i);
  });

  it("rejects revoked worker certificates after revoke", async () => {
    const dir = mkdtempSync(join(tmpdir(), "el-mtls-revoke-"));
    dirs.push(dir);
    const cp = new ControlPlaneService(dir);
    cps.push(cp);
    const state = await cp.startServer("127.0.0.1", 0);
    const { workerNodeId, decision, work } = await enrollWorker(cp, dir);
    cp.nodes.revoke(workerNodeId, "test_revoke");
    const client = new FabricProtocolClient({
      host: state.listen!.host,
      port: state.listen!.port,
      tls: true,
      ca: readFileSync(join(work, "ca-cert.pem")),
      cert: readFileSync(join(work, "client-cert.pem")),
      key: readFileSync(join(work, "client-key.pem")),
      rejectUnauthorized: true,
      sessionToken: decision.session_token!,
      worker_node_id: workerNodeId,
    });
    await expect(client.connect()).rejects.toThrow();
  });
});
