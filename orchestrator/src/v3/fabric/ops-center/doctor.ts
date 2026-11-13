/**
 * Fleet doctor — PASS | WARNING | FAIL | BLOCKED | UNAVAILABLE
 */

import { existsSync } from "node:fs";
import type { ControlPlaneService } from "../control-plane/service.js";
import { isInventoryFresh } from "../capability/inventory.js";

export type DoctorState = "PASS" | "WARNING" | "FAIL" | "BLOCKED" | "UNAVAILABLE";

export interface DoctorCheck {
  id: string;
  state: DoctorState;
  detail: string;
}

export function doctorControlPlane(cp: ControlPlaneService): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  checks.push({
    id: "cp.active",
    state: cp.state.active ? "PASS" : "FAIL",
    detail: `id=${cp.state.control_plane_id} epoch=${cp.state.epoch}`,
  });
  checks.push({
    id: "cp.listen",
    state: cp.state.listen ? "PASS" : "WARNING",
    detail: cp.state.listen ? `${cp.state.listen.host}:${cp.state.listen.port}` : "not_listening",
  });
  const nodes = cp.nodes.list();
  checks.push({
    id: "nodes.enrolled",
    state: nodes.some((n) => n.trust === "trusted") ? "PASS" : "WARNING",
    detail: `trusted=${nodes.filter((n) => n.trust === "trusted").length}/${nodes.length}`,
  });
  const stale = nodes.filter(
    (n) => n.trust === "trusted" && !isInventoryFresh(n.resources.sampled_at, { max_age_ms: 300_000 }),
  );
  checks.push({
    id: "nodes.inventory_fresh",
    state: stale.length ? "WARNING" : "PASS",
    detail: `stale=${stale.length}`,
  });
  const revokedOnline = nodes.filter((n) => n.status === "REVOKED");
  checks.push({
    id: "nodes.revoked_tracked",
    state: "PASS",
    detail: `revoked=${revokedOnline.length}`,
  });
  checks.push({
    id: "leases.manager",
    state: "PASS",
    detail: `leases=${cp.leases.list().length}`,
  });
  return checks;
}

export function doctorWorkerNode(workRoot: string): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  checks.push({
    id: "worker.work_root",
    state: existsSync(workRoot) ? "PASS" : "FAIL",
    detail: workRoot,
  });
  const identityPath = `${workRoot}/identity.json`;
  checks.push({
    id: "worker.identity",
    state: existsSync(identityPath) ? "PASS" : "BLOCKED",
    detail: existsSync(identityPath) ? "present" : "missing_identity",
  });
  return checks;
}

export function summarizeDoctor(checks: DoctorCheck[]): DoctorState {
  if (checks.some((c) => c.state === "FAIL")) return "FAIL";
  if (checks.some((c) => c.state === "BLOCKED")) return "BLOCKED";
  if (checks.some((c) => c.state === "UNAVAILABLE")) return "UNAVAILABLE";
  if (checks.some((c) => c.state === "WARNING")) return "WARNING";
  return "PASS";
}
