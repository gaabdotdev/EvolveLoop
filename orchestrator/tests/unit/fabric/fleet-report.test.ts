import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ControlPlaneService } from "../../../src/v3/fabric/control-plane/service.js";
import { generateNodeIdentity } from "../../../src/v3/fabric/trust/identity.js";
import { discoverCapabilities, sampleResources } from "../../../src/v3/fabric/capability/inventory.js";
import { buildFleetReport } from "../../../src/v3/fabric/ops-center/fleet-report.js";

function enrollTrusted(cp: ControlPlaneService) {
  const km = generateNodeIdentity();
  const caps = discoverCapabilities({ slots: 2 });
  const pending = cp.nodes.submitEnrollment({
    kind: "EnrollmentRequest",
    request_id: `req_${km.worker_node_id}`,
    public_key_spki_b64: km.public_key_spki_b64,
    owner: "test",
    fleet: "lab",
    protocol_versions: ["1.0"],
    version: "3.7-test",
    capabilities: caps,
    resources: sampleResources(2),
    advertise_endpoints: [],
    requested_at: new Date().toISOString(),
  });
  cp.nodes.authorizeEnrollment(pending.worker_node_id!);
  cp.nodes.heartbeat(pending.worker_node_id!, caps, sampleResources(2));
  return pending.worker_node_id!;
}

describe("Gate O fleet-report correlation", () => {
  it("emits fabric correlation fields into Measurement Plane events", () => {
    const dir = mkdtempSync(join(tmpdir(), "el-fleet-"));
    const cp = new ControlPlaneService(dir);
    const worker_node_id = enrollTrusted(cp);

    const report = buildFleetReport(cp);
    expect(report.kind).toBe("FleetOperationsReport");
    expect(report.control_plane_id).toBe(cp.state.control_plane_id);
    expect(report.nodes.some((n) => n.worker_node_id === worker_node_id)).toBe(true);
    expect(report.measurement.events_accepted).toBeGreaterThan(0);
    expect(report.measurement.correlation_fields_emitted).toContain("worker_node_id");
    expect(report.measurement.correlation_fields_emitted).toContain("fencing_epoch");
    expect(report.measurement.correlation_fields_emitted).not.toContain("artifact_transfer_id");
    expect(report.measurement.correlation_fields_emitted).not.toContain("remote_trace_id");
    expect(report.measurement.correlation_fields_emitted).not.toContain("remote_span_id");

    const files = readdirSync(report.measurement.events_dir).filter((f) => f.endsWith(".jsonl"));
    expect(files.length).toBeGreaterThan(0);
    const body = files.map((f) => readFileSync(join(report.measurement.events_dir, f), "utf-8")).join("\n");
    expect(body).toContain("control_plane_id");
    expect(body).toContain("worker_node_id");
    expect(body).not.toContain("remote_trace_id");
    expect(body).not.toContain("remote_span_id");
    expect(body).not.toContain("artifact_transfer_id");
    expect(body).not.toMatch(/"node_id":\s*"wn_/);
  });
});
