import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveMeasurementPaths } from "../../../src/telemetry/measurement-plane/paths.js";
import { MeasurementEventStore } from "../../../src/telemetry/measurement-plane/event-store.js";
import { TelemetryCollector } from "../../../src/telemetry/measurement-plane/collector.js";
import {
  buildAgentLifecycleEvent,
  buildDelegationEvent,
  buildSubagentEvent,
} from "../../../src/telemetry/measurement-plane/adapters/hierarchy-adapter.js";
import {
  buildAgentTree,
  reconstructExecution,
} from "../../../src/telemetry/measurement-plane/trace/builder.js";
import { computeHierarchyMetrics } from "../../../src/telemetry/measurement-plane/metrics/engine.js";

describe("hierarchy reconstruction scenarios", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "hier-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function collector(runId: string) {
    const paths = resolveMeasurementPaths(tmp);
    const store = new MeasurementEventStore(paths);
    const c = new TelemetryCollector(store, { mode: "benchmark", runId });
    return { store, c, paths };
  }

  it("master alone → depth 0", () => {
    const run_id = "run_master_alone";
    const { store, c } = collector(run_id);
    c.ingest(buildAgentLifecycleEvent({ run_id, agent_id: "master", role: "root", kind: "spawned" }));
    c.ingest(buildAgentLifecycleEvent({ run_id, agent_id: "master", role: "root", kind: "started" }));
    c.ingest(buildAgentLifecycleEvent({ run_id, agent_id: "master", role: "root", kind: "completed" }));
    const events = store.load(run_id);
    const tree = buildAgentTree(events);
    const metrics = computeHierarchyMetrics(events);
    expect(tree.length).toBe(1);
    expect(metrics.delegation_depth).toBe(0);
    expect(metrics.subagent_count).toBe(0);
  });

  it("master → leader → worker → helper", () => {
    const run_id = "run_deep";
    const { store, c } = collector(run_id);
    c.ingest(buildAgentLifecycleEvent({ run_id, agent_id: "m", role: "root", kind: "spawned" }));
    c.ingest(buildDelegationEvent({ run_id, delegation_id: "d1", from_agent_id: "m", to_agent_id: "L", kind: "requested" }));
    c.ingest(buildDelegationEvent({ run_id, delegation_id: "d1", from_agent_id: "m", to_agent_id: "L", kind: "accepted" }));
    c.ingest(buildAgentLifecycleEvent({ run_id, agent_id: "L", parent_agent_id: "m", role: "leader", kind: "spawned" }));
    c.ingest(buildSubagentEvent({ run_id, agent_id: "L", parent_agent_id: "m", role: "leader", kind: "spawned", depth: 1 }));
    c.ingest(buildAgentLifecycleEvent({ run_id, agent_id: "W", parent_agent_id: "L", role: "worker", kind: "spawned" }));
    c.ingest(buildSubagentEvent({ run_id, agent_id: "W", parent_agent_id: "L", role: "worker", kind: "spawned", depth: 2 }));
    c.ingest(buildAgentLifecycleEvent({ run_id, agent_id: "H", parent_agent_id: "W", role: "helper", kind: "spawned" }));
    c.ingest(buildSubagentEvent({ run_id, agent_id: "H", parent_agent_id: "W", role: "helper", kind: "spawned", depth: 3 }));
    const events = store.load(run_id);
    const recon = reconstructExecution(events);
    expect(recon.agent_tree.length).toBeGreaterThanOrEqual(1);
    const metrics = computeHierarchyMetrics(events);
    expect(metrics.delegation_depth).toBeGreaterThanOrEqual(3);
    expect(metrics.delegation_accepted).toBeGreaterThanOrEqual(1);
  });

  it("spawn denied is not counted as spawned", () => {
    const run_id = "run_denied";
    const { store, c } = collector(run_id);
    c.ingest(buildAgentLifecycleEvent({ run_id, agent_id: "m", role: "root", kind: "spawned" }));
    c.ingest(buildAgentLifecycleEvent({ run_id, agent_id: "x", parent_agent_id: "m", role: "worker", kind: "spawn_requested" }));
    c.ingest(
      buildAgentLifecycleEvent({
        run_id,
        agent_id: "x",
        parent_agent_id: "m",
        role: "worker",
        kind: "spawn_blocked",
        reason: "budget",
        policy_block: true,
      }),
    );
    const events = store.load(run_id);
    const metrics = computeHierarchyMetrics(events);
    expect(events.some((e) => e.event_name === "agent.spawn_blocked")).toBe(true);
    expect(metrics.agent_count_blocked).toBeGreaterThanOrEqual(1);
  });
});
