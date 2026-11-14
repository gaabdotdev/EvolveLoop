/**
 * Gate O — Fleet Operations report + Measurement Plane correlation fields.
 * Observe-only; does not create a second EventBus.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ControlPlaneService } from "../control-plane/service.js";
import { isInventoryFresh } from "../capability/inventory.js";
import { resolveMeasurementPaths } from "../../../telemetry/measurement-plane/paths.js";
import { MeasurementEventStore } from "../../../telemetry/measurement-plane/event-store.js";
import { TelemetryCollector } from "../../../telemetry/measurement-plane/collector.js";
import { createMeasurementEvent } from "../../../telemetry/measurement-plane/envelope.js";
import type { CorrelationIds } from "../../../telemetry/measurement-plane/types.js";
import { nowIso } from "../../ops/atomic.js";

export interface FleetReport {
  kind: "FleetOperationsReport";
  schema_version: "1.0";
  generated_at: string;
  run_id: string;
  control_plane_id: string;
  control_plane_epoch: number;
  nodes: Array<{
    worker_node_id: string;
    trust: string;
    status: string;
    pool_ids: string[];
    inventory_fresh: boolean;
    last_heartbeat_at?: string;
  }>;
  leases: Array<{
    lease_id: string;
    worker_node_id: string;
    fencing_epoch: number;
    task_id?: string;
  }>;
  pools: Array<{ pool_id: string; member_count: number }>;
  measurement: {
    events_dir: string;
    events_accepted: number;
    correlation_fields_emitted: (keyof CorrelationIds)[];
  };
  limitations: string[];
}

const CORRELATION_FIELDS: (keyof CorrelationIds)[] = [
  "run_id",
  "control_plane_id",
  "control_plane_epoch",
  "worker_node_id",
  "node_session_id",
  "pool_id",
  "lease_id",
  "fencing_epoch",
];

export function buildFleetReport(
  cp: ControlPlaneService,
  opts?: { measurementRoot?: string },
): FleetReport {
  const run_id = `fleet_${randomUUID()}`;
  // resolveMeasurementPaths already nests under <root>/measurement/
  const measurementRoot = opts?.measurementRoot ?? cp.paths.root;
  const mpPaths = resolveMeasurementPaths(measurementRoot);
  const store = new MeasurementEventStore(mpPaths);
  const collector = new TelemetryCollector(store, { mode: "normal", runId: run_id });
  let accepted = 0;

  const baseCorr: CorrelationIds = {
    run_id,
    control_plane_id: cp.state.control_plane_id,
    control_plane_epoch: cp.state.epoch,
  };

  const ingest = (
    event_name: string,
    correlation: CorrelationIds,
    attributes: Record<string, unknown> = {},
  ) => {
    const r = collector.ingest(
      createMeasurementEvent({
        event_name,
        source: { component: "fabric", module: "fleet-report" },
        correlation,
        attributes,
        provenance: { kind: "OBSERVED", reported_by: "fleet-report" },
        critical: true,
      }),
    );
    if (r.accepted) accepted += 1;
  };

  ingest("fleet.report.started", baseCorr, { active: cp.state.active });

  const poolsAll = cp.pools.list();
  const nodes = cp.nodes.list().map((n) => {
    const worker_node_id = n.identity.worker_node_id;
    const pool_ids = poolsAll
      .filter((p) => p.member_worker_node_ids.includes(worker_node_id))
      .map((p) => p.pool_id);
    const inventory_fresh = isInventoryFresh(n.resources.sampled_at, { max_age_ms: 300_000 });
    ingest(
      "fleet.node.snapshot",
      {
        ...baseCorr,
        worker_node_id,
        node_session_id: n.credential.session_token_id,
        pool_id: pool_ids[0],
      },
      { trust: n.trust, status: n.status, inventory_fresh },
    );
    return {
      worker_node_id,
      trust: n.trust,
      status: n.status,
      pool_ids,
      inventory_fresh,
      last_heartbeat_at: n.last_heartbeat_at,
    };
  });

  const leases = cp.leases.list().map((l) => {
    ingest(
      "fleet.lease.snapshot",
      {
        ...baseCorr,
        worker_node_id: l.owner_worker_node_id,
        lease_id: l.lease_id,
        fencing_epoch: l.fencing_epoch,
      },
      { status: l.status, task_id: l.task_id },
    );
    return {
      lease_id: l.lease_id,
      worker_node_id: l.owner_worker_node_id,
      fencing_epoch: l.fencing_epoch,
      task_id: l.task_id,
    };
  });

  const pools = poolsAll.map((p) => ({
    pool_id: p.pool_id,
    member_count: p.member_worker_node_ids.length,
  }));

  ingest("fleet.report.completed", baseCorr, {
    nodes: nodes.length,
    leases: leases.length,
    pools: pools.length,
  });

  const report: FleetReport = {
    kind: "FleetOperationsReport",
    schema_version: "1.0",
    generated_at: nowIso(),
    run_id,
    control_plane_id: cp.state.control_plane_id,
    control_plane_epoch: cp.state.epoch,
    nodes,
    leases,
    pools,
    measurement: {
      events_dir: mpPaths.eventsDir,
      events_accepted: accepted,
      correlation_fields_emitted: CORRELATION_FIELDS,
    },
    limitations: [
      "Remote trace/span correlation is unavailable until real worker events carry those identifiers",
      "Artifact transfer correlation is unavailable until a real transfer event is observed",
      "Cross-host LIVE traces require Gate G17 multi-host E2E",
      "Same-host dual-process is SIMULATED_NOT_MULTI_HOST",
      "Usage/cost fields omitted unless provider provenance present",
    ],
  };

  const outDir = join(cp.paths.root, "fleet-reports");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${run_id}.json`), JSON.stringify(report, null, 2));
  return report;
}
