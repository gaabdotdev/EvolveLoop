import { createMeasurementEvent } from "../envelope.js";
import type { MeasurementEvent } from "../types.js";

export interface SpawnObservation {
  run_id: string;
  agent_id: string;
  parent_agent_id?: string;
  role?: string;
  capability?: string;
  delegation_id?: string;
  task_id?: string;
  kind: "spawn_requested" | "spawned" | "spawn_blocked" | "started" | "completed" | "failed" | "cancelled";
  reason?: string;
  policy_block?: boolean;
}

export interface DelegationObservation {
  run_id: string;
  delegation_id: string;
  from_agent_id: string;
  to_agent_id?: string;
  task_id?: string;
  kind: "requested" | "accepted" | "rejected" | "cancelled" | "completed";
  reason?: string;
}

export function buildAgentLifecycleEvent(obs: SpawnObservation): MeasurementEvent {
  const nameMap = {
    spawn_requested: "agent.spawn_requested",
    spawned: "agent.spawned",
    spawn_blocked: "agent.spawn_blocked",
    started: "agent.started",
    completed: "agent.completed",
    failed: "agent.failed",
    cancelled: "agent.cancelled",
  } as const;

  return createMeasurementEvent({
    event_name: nameMap[obs.kind],
    source: { component: "measurement-plane", module: "hierarchy-adapter" },
    correlation: {
      run_id: obs.run_id,
      agent_id: obs.agent_id,
      parent_agent_id: obs.parent_agent_id,
      delegation_id: obs.delegation_id,
      task_id: obs.task_id,
    },
    attributes: {
      role: obs.role,
      capability: obs.capability,
      reason: obs.reason,
      policy_block: obs.policy_block ?? false,
      // Distinctions required by spec
      spawn_requested_only: obs.kind === "spawn_requested",
      spawn_confirmed: obs.kind === "spawned",
      spawn_blocked: obs.kind === "spawn_blocked",
    },
    critical: true,
  });
}

export function buildDelegationEvent(obs: DelegationObservation): MeasurementEvent {
  const nameMap = {
    requested: "delegation.requested",
    accepted: "delegation.accepted",
    rejected: "delegation.rejected",
    cancelled: "delegation.cancelled",
    completed: "delegation.completed",
  } as const;

  return createMeasurementEvent({
    event_name: nameMap[obs.kind],
    source: { component: "measurement-plane", module: "hierarchy-adapter" },
    correlation: {
      run_id: obs.run_id,
      delegation_id: obs.delegation_id,
      agent_id: obs.from_agent_id,
      task_id: obs.task_id,
    },
    attributes: {
      from_agent_id: obs.from_agent_id,
      to_agent_id: obs.to_agent_id,
      reason: obs.reason,
      // Task vs Delegation distinction preserved via event_name + task_id
    },
    critical: true,
  });
}

export function buildSubagentEvent(obs: SpawnObservation & { depth: number }): MeasurementEvent {
  const base = buildAgentLifecycleEvent(obs);
  if (obs.kind !== "spawned") return base;
  return createMeasurementEvent({
    event_name: "subagent.spawned",
    source: base.source,
    correlation: base.correlation,
    attributes: { ...base.attributes, depth: obs.depth },
    critical: true,
  });
}
