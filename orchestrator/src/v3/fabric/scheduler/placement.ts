/**
 * Distributed placement — hard constraints then soft ranking.
 * Extends GlobalOps authority; does not create a competing admission scheduler.
 */

import { randomUUID } from "node:crypto";
import { atomicWriteJson, nowIso } from "../../ops/atomic.js";
import { join } from "node:path";
import type { FabricDataPaths } from "../paths.js";
import type { PlacementDecision, WorkerNodeRecord, WorkerPool } from "../types.js";
import { isInventoryFresh } from "../capability/inventory.js";

export interface PlacementRequest {
  task_id: string;
  required_capabilities: string[];
  require_sandbox?: boolean;
  platform?: string;
  min_slots?: number;
  pool?: WorkerPool;
  project_authorized_nodes?: string[];
  protocol_version?: string;
  budget_ok?: (node: WorkerNodeRecord) => boolean;
}

export class PlacementEngine {
  constructor(
    private readonly paths: FabricDataPaths,
    private readonly freshnessMaxAgeMs = 120_000,
  ) {}

  place(nodes: WorkerNodeRecord[], req: PlacementRequest): PlacementDecision {
    const hard_rejects: PlacementDecision["hard_rejects"] = [];
    const candidates: WorkerNodeRecord[] = [];

    for (const node of nodes) {
      const reason = this.hardRejectReason(node, req);
      if (reason) {
        hard_rejects.push({ worker_node_id: node.identity.worker_node_id, reason });
        continue;
      }
      candidates.push(node);
    }

    const soft_ranking = candidates
      .map((n) => {
        const load = n.resources.cpu_load_1m / Math.max(1, n.resources.cpu_cores);
        const memPressure = 1 - n.resources.memory_mb_available / Math.max(1, n.resources.memory_mb_total);
        const slotScore = n.resources.slots_free / Math.max(1, n.resources.slots_total);
        const score = slotScore * 0.5 + (1 - load) * 0.3 + (1 - memPressure) * 0.2;
        return {
          worker_node_id: n.identity.worker_node_id,
          score,
          rationale: `slots=${n.resources.slots_free}/${n.resources.slots_total};load=${load.toFixed(2)};memPressure=${memPressure.toFixed(2)}`,
        };
      })
      .sort((a, b) => b.score - a.score);

    // Hard constraints never overridden by score — selection only among candidates
    const selected = soft_ranking[0]?.worker_node_id;
    const decision: PlacementDecision = {
      kind: "PlacementDecision",
      decision_id: `place_${randomUUID()}`,
      task_id: req.task_id,
      selected_worker_node_id: selected,
      pool_id: req.pool?.pool_id,
      hard_rejects,
      soft_ranking,
      decided_at: nowIso(),
    };
    atomicWriteJson(join(this.paths.decisionsDir, `${decision.decision_id}.json`), decision);
    return decision;
  }

  private hardRejectReason(node: WorkerNodeRecord, req: PlacementRequest): string | null {
    if (node.trust !== "trusted") return `trust:${node.trust}`;
    if (node.status === "REVOKED" || node.status === "QUARANTINED" || node.status === "PENDING_ENROLLMENT") {
      return `status:${node.status}`;
    }
    if (node.status === "DRAINING" || node.status === "OFFLINE") return `status:${node.status}`;
    if (!isInventoryFresh(node.resources.sampled_at, { max_age_ms: this.freshnessMaxAgeMs })) {
      return "stale_inventory";
    }
    if (!isInventoryFresh(node.capabilities.observed_at, { max_age_ms: this.freshnessMaxAgeMs })) {
      return "stale_capabilities";
    }
    if (req.protocol_version && !node.protocol_versions.includes(req.protocol_version)) {
      return "protocol_incompatible";
    }
    if (req.require_sandbox && !node.capabilities.sandbox_backends.length) return "sandbox_missing";
    if (req.platform && node.capabilities.os !== req.platform && node.capabilities.os !== "linux" && req.platform === "linux") {
      // platform() returns 'linux' typically
      if (node.capabilities.os !== req.platform) return "platform_mismatch";
    }
    const caps = new Set([
      ...node.capabilities.harnesses,
      ...node.capabilities.sandbox_backends,
      ...node.capabilities.toolchains,
      ...Object.entries(node.capabilities.probes)
        .filter(([, v]) => v.ok)
        .map(([k]) => k),
    ]);
    for (const c of req.required_capabilities) {
      if (!caps.has(c)) return `capability_missing:${c}`;
    }
    const minSlots = req.min_slots ?? 1;
    if (node.resources.slots_free < minSlots) return "insufficient_slots";
    if (req.project_authorized_nodes && !req.project_authorized_nodes.includes(node.identity.worker_node_id)) {
      return "project_unauthorized";
    }
    if (req.pool && !req.pool.member_worker_node_ids.includes(node.identity.worker_node_id)) {
      // membership may be stale — still apply selector via pool members list as hard after reconcile
      return "not_in_pool";
    }
    if (req.budget_ok && !req.budget_ok(node)) return "budget_exhausted";
    return null;
  }
}
