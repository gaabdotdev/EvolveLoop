import type { AgentTreeNode, MeasurementEvent, TraceNode } from "../types.js";

export function buildAgentTree(events: MeasurementEvent[]): AgentTreeNode[] {
  const byId = new Map<string, AgentTreeNode>();

  for (const e of events) {
    const id = e.correlation.agent_id;
    if (!id) continue;
    if (!byId.has(id)) {
      byId.set(id, {
        agent_id: id,
        parent_agent_id: e.correlation.parent_agent_id,
        role: typeof e.attributes.role === "string" ? e.attributes.role : undefined,
        status: undefined,
        children: [],
        spawn_requested: false,
        spawn_confirmed: false,
        spawn_blocked: false,
      });
    }
    const node = byId.get(id)!;
    if (e.correlation.parent_agent_id) node.parent_agent_id = e.correlation.parent_agent_id;
    if (typeof e.attributes.role === "string") node.role = e.attributes.role;
    if (e.event_name === "agent.spawn_requested") node.spawn_requested = true;
    if (e.event_name === "agent.spawned" || e.event_name === "subagent.spawned") node.spawn_confirmed = true;
    if (e.event_name === "agent.spawn_blocked") node.spawn_blocked = true;
    if (e.event_name === "agent.started") node.status = "started";
    if (e.event_name === "agent.completed") node.status = "completed";
    if (e.event_name === "agent.failed") node.status = "failed";
    if (e.event_name === "agent.cancelled") node.status = "cancelled";
  }

  const roots: AgentTreeNode[] = [];
  for (const node of byId.values()) {
    // Ignore self-parent cycles (bad correlation); treat as root.
    if (
      node.parent_agent_id &&
      node.parent_agent_id !== node.agent_id &&
      byId.has(node.parent_agent_id)
    ) {
      byId.get(node.parent_agent_id)!.children.push(node);
    } else {
      if (node.parent_agent_id === node.agent_id) node.parent_agent_id = undefined;
      roots.push(node);
    }
  }
  return roots;
}

export function buildTimeline(events: MeasurementEvent[]): Array<{
  occurred_at: string;
  event_name: string;
  event_id: string;
  agent_id?: string;
  task_id?: string;
  gap?: boolean;
}> {
  const sorted = [...events].sort((a, b) => {
    if (a.occurred_at === b.occurred_at) return (a.sequence ?? 0) - (b.sequence ?? 0);
    return a.occurred_at < b.occurred_at ? -1 : 1;
  });
  const out: Array<{
    occurred_at: string;
    event_name: string;
    event_id: string;
    agent_id?: string;
    task_id?: string;
    gap?: boolean;
  }> = [];
  let lastSeq: number | undefined;
  for (const e of sorted) {
    if (lastSeq !== undefined && e.sequence !== undefined && e.sequence > lastSeq + 1) {
      out.push({
        occurred_at: e.occurred_at,
        event_name: "telemetry.gap",
        event_id: `gap_${lastSeq}_${e.sequence}`,
        gap: true,
      });
    }
    out.push({
      occurred_at: e.occurred_at,
      event_name: e.event_name,
      event_id: e.event_id,
      agent_id: e.correlation.agent_id,
      task_id: e.correlation.task_id,
      gap: e.quality?.delayed ? true : undefined,
    });
    if (e.sequence !== undefined) lastSeq = e.sequence;
  }
  return out;
}

export function buildTraceForest(events: MeasurementEvent[]): TraceNode[] {
  const spans = new Map<string, TraceNode>();
  for (const e of events) {
    const spanId = e.correlation.span_id ?? e.event_id;
    if (!spans.has(spanId)) {
      spans.set(spanId, {
        span_id: spanId,
        parent_span_id: e.correlation.parent_span_id,
        kind: e.event_name.split(".")[0] ?? "event",
        name: e.event_name,
        agent_id: e.correlation.agent_id,
        task_id: e.correlation.task_id,
        started_at: e.occurred_at,
        ended_at: e.occurred_at,
        status: typeof e.attributes.success === "boolean" ? (e.attributes.success ? "ok" : "error") : undefined,
        children: [],
        event_ids: [e.event_id],
      });
    } else {
      const s = spans.get(spanId)!;
      s.event_ids.push(e.event_id);
      s.ended_at = e.occurred_at;
    }
  }

  const roots: TraceNode[] = [];
  for (const span of spans.values()) {
    if (span.parent_span_id && spans.has(span.parent_span_id)) {
      spans.get(span.parent_span_id)!.children.push(span);
    } else {
      roots.push(span);
    }
  }
  return roots;
}

export function reconstructExecution(events: MeasurementEvent[]) {
  return {
    timeline: buildTimeline(events),
    agent_tree: buildAgentTree(events),
    trace: buildTraceForest(events),
    task_events: events.filter((e) => e.event_name.startsWith("task.")),
    delegation_events: events.filter((e) => e.event_name.startsWith("delegation.")),
    gaps: buildTimeline(events).filter((t) => t.gap),
  };
}
