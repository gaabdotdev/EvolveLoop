import type {
  HierarchyMetrics,
  MeasurementEvent,
  MeasurementValue,
  UsageAggregate,
} from "../types.js";
import { mergeIntervalDuration, summarizeLatency } from "./stats.js";

const USEFUL_ACTIONS = new Set([
  "plan.created",
  "plan.approved",
  "artifact.created",
  "diff.created",
  "diff.applied",
  "filesystem.write",
  "test.completed",
  "task.completed",
]);

function isUsageValue(v: unknown): v is MeasurementValue {
  return !!v && typeof v === "object" && "metric" in (v as object) && "provenance" in (v as object);
}

function emptyUsageMetric(metric: string, provenance: MeasurementValue["provenance"] = "UNAVAILABLE"): MeasurementValue {
  return { metric, value: null, unit: metric.includes("cost") ? "USD" : "tokens", provenance };
}

export function computeUsageAggregate(events: MeasurementEvent[]): UsageAggregate {
  const seen = new Set<string>();
  let input = 0;
  let output = 0;
  let cached = 0;
  let cacheCreate = 0;
  let estimatedIn = 0;
  let estimatedOut = 0;
  let hasReported = false;
  let hasEstimated = false;
  let requestCount = 0;
  let deduped = 0;

  for (const e of events) {
    if (e.event_name !== "usage.reported" && e.event_name !== "usage.estimated") continue;
    requestCount += 1;
    const req = e.correlation.provider_request_id ?? e.event_id;
    const family = e.event_name === "usage.estimated" ? "estimated" : "reported";
    const key = `${req}::${family}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped += 1;

    const m = e.measurements;
    const take = (name: string): number | null => {
      const raw = m[name];
      if (isUsageValue(raw)) return raw.value;
      if (typeof raw === "number") return raw;
      return null;
    };

    if (family === "reported") {
      hasReported = true;
      input += take("input_tokens") ?? 0;
      output += take("output_tokens") ?? 0;
      cached += take("cached_input_tokens") ?? 0;
      cacheCreate += take("cache_creation_tokens") ?? 0;
    } else {
      hasEstimated = true;
      estimatedIn += take("input_tokens") ?? 0;
      estimatedOut += take("output_tokens") ?? 0;
    }
  }

  return {
    input_tokens: {
      metric: "input_tokens",
      value: hasReported ? input : null,
      unit: "tokens",
      provenance: hasReported ? "PROVIDER_REPORTED" : "UNAVAILABLE",
    },
    output_tokens: {
      metric: "output_tokens",
      value: hasReported ? output : null,
      unit: "tokens",
      provenance: hasReported ? "PROVIDER_REPORTED" : "UNAVAILABLE",
    },
    cached_input_tokens: {
      metric: "cached_input_tokens",
      value: hasReported ? cached : null,
      unit: "tokens",
      provenance: hasReported ? "PROVIDER_REPORTED" : "UNAVAILABLE",
    },
    cache_creation_tokens: {
      metric: "cache_creation_tokens",
      value: hasReported ? cacheCreate : null,
      unit: "tokens",
      provenance: hasReported ? "PROVIDER_REPORTED" : "UNAVAILABLE",
    },
    reasoning_tokens: emptyUsageMetric("reasoning_tokens"),
    total_reported: {
      metric: "total_reported",
      value: hasReported ? input + output : null,
      unit: "tokens",
      provenance: hasReported ? "DERIVED" : "UNAVAILABLE",
    },
    total_estimated: {
      metric: "total_estimated",
      value: hasEstimated ? estimatedIn + estimatedOut : null,
      unit: "tokens",
      provenance: hasEstimated ? "ESTIMATED" : "UNAVAILABLE",
    },
    cost_usd_reported: emptyUsageMetric("cost_usd_reported"),
    cost_usd_calculated: emptyUsageMetric("cost_usd_calculated"),
    cost_usd_estimated: emptyUsageMetric("cost_usd_estimated"),
    request_count: requestCount,
    deduped_request_count: deduped,
  };
}

export function computeHierarchyMetrics(events: MeasurementEvent[]): HierarchyMetrics {
  const spawned = events.filter((e) => e.event_name === "agent.spawned");
  const requested = events.filter((e) => e.event_name === "agent.spawn_requested");
  const blocked = events.filter((e) => e.event_name === "agent.spawn_blocked");
  const started = events.filter((e) => e.event_name === "agent.started");
  const completed = events.filter((e) => e.event_name === "agent.completed");
  const failed = events.filter((e) => e.event_name === "agent.failed");
  const cancelled = events.filter((e) => e.event_name === "agent.cancelled");
  const subagents = events.filter((e) => e.event_name === "subagent.spawned");

  const children = new Map<string, string[]>();
  const agents = new Set<string>();
  for (const e of spawned) {
    const id = e.correlation.agent_id;
    if (!id) continue;
    agents.add(id);
    const parent = e.correlation.parent_agent_id;
    if (parent) {
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent)!.push(id);
    }
  }

  const depths = [...agents].map((id) => depthOf(id, spawned));
  const fanOuts = [...children.values()].map((c) => c.length);
  fanOuts.sort((a, b) => a - b);

  const delReq = events.filter((e) => e.event_name === "delegation.requested").length;
  const delAcc = events.filter((e) => e.event_name === "delegation.accepted").length;
  const delRej = events.filter((e) => e.event_name === "delegation.rejected").length;

  const work = classifyWorkShares(events);

  return {
    agent_count_requested: requested.length,
    agent_count_created: spawned.length,
    agent_count_started: started.length,
    agent_count_completed: completed.length,
    agent_count_failed: failed.length,
    agent_count_cancelled: cancelled.length,
    agent_count_blocked: blocked.length,
    subagent_count: subagents.length || [...agents].filter((a) => {
      const ev = spawned.find((e) => e.correlation.agent_id === a);
      return !!ev?.correlation.parent_agent_id;
    }).length,
    delegation_depth: depths.length ? Math.max(...depths) : 0,
    fan_out_max: fanOuts.length ? fanOuts[fanOuts.length - 1] : 0,
    fan_out_mean: fanOuts.length ? fanOuts.reduce((a, b) => a + b, 0) / fanOuts.length : 0,
    fan_out_median: fanOuts.length ? fanOuts[Math.floor(fanOuts.length / 2)] : 0,
    delegation_requested: delReq,
    delegation_accepted: delAcc,
    delegation_rejected: delRej,
    delegation_acceptance_rate: delReq ? delAcc / delReq : null,
    delegated_task_share: work.delegated_task_share,
    delegation_rework_rate: work.delegation_rework_rate,
    root_direct_engineering_share: work.root_direct_engineering_share,
    root_coordination_share: work.root_coordination_share,
    delegated_engineering_share: work.delegated_engineering_share,
    unattributed_work_share: work.unattributed_work_share,
  };
}

function depthOf(agentId: string, spawned: MeasurementEvent[]): number {
  let depth = 0;
  let cur: string | undefined = agentId;
  const guard = new Set<string>();
  while (cur) {
    if (guard.has(cur)) break;
    guard.add(cur);
    const ev = spawned.find((e) => e.correlation.agent_id === cur);
    const parent = ev?.correlation.parent_agent_id;
    if (!parent) break;
    depth += 1;
    cur = parent;
  }
  return depth;
}

function classifyWorkShares(events: MeasurementEvent[]) {
  const rootIds = new Set(
    events
      .filter((e) => e.event_name === "agent.spawned" && !e.correlation.parent_agent_id)
      .map((e) => e.correlation.agent_id)
      .filter(Boolean) as string[],
  );
  // If no explicit root spawn, treat missing parent as root when agent_id present on coordination events
  if (!rootIds.size) {
    for (const e of events) {
      if (e.correlation.agent_id && !e.correlation.parent_agent_id && e.attributes?.role === "root") {
        rootIds.add(e.correlation.agent_id);
      }
    }
  }

  let rootCoord = 0;
  let rootEng = 0;
  let delegatedEng = 0;
  let unattributed = 0;
  let tasksTotal = 0;
  let tasksDelegated = 0;
  let submitted = 0;
  let rework = 0;

  const engTools = new Set([
    "tool.completed",
    "filesystem.write",
    "diff.applied",
    "artifact.created",
    "command.executed",
    "test.completed",
  ]);
  const coordEvents = new Set([
    "plan.started",
    "plan.created",
    "plan.approved",
    "delegation.requested",
    "delegation.accepted",
    "agent.spawn_requested",
    "agent.spawned",
    "review.started",
    "review.completed",
  ]);

  for (const e of events) {
    if (e.event_name === "task.assigned" || e.event_name === "task.created") {
      tasksTotal += 1;
      const agent = e.correlation.agent_id;
      if (agent && !rootIds.has(agent)) tasksDelegated += 1;
    }
    if (e.event_name === "task.retried" || e.event_name === "review.rejected" || e.event_name === "diff.rejected") {
      rework += 1;
    }
    if (e.event_name === "task.completed" || e.event_name === "diff.created") submitted += 1;

    const agent = e.correlation.agent_id;
    const isEng = engTools.has(e.event_name);
    const isCoord = coordEvents.has(e.event_name);
    if (!isEng && !isCoord) continue;
    if (!agent) {
      unattributed += 1;
      continue;
    }
    if (rootIds.has(agent) || rootIds.size === 0) {
      if (isCoord) rootCoord += 1;
      if (isEng) rootEng += 1;
    } else if (isEng) {
      delegatedEng += 1;
    }
  }

  const total = rootCoord + rootEng + delegatedEng + unattributed;
  const share = (n: number) => (total ? n / total : null);

  return {
    root_direct_engineering_share: share(rootEng),
    root_coordination_share: share(rootCoord),
    delegated_engineering_share: share(delegatedEng),
    unattributed_work_share: share(unattributed),
    delegated_task_share: tasksTotal ? tasksDelegated / tasksTotal : null,
    delegation_rework_rate: submitted ? rework / submitted : null,
  };
}

export function computeTimingMetrics(events: MeasurementEvent[]) {
  const started = events.find((e) => e.event_name === "run.started");
  const terminal = [...events]
    .reverse()
    .find((e) =>
      ["run.completed", "run.failed", "run.cancelled", "run.timed_out", "benchmark.case_completed"].includes(
        e.event_name,
      ),
    );

  const startMs = started ? Date.parse(started.occurred_at) : NaN;
  const endMs = terminal ? Date.parse(terminal.occurred_at) : NaN;

  let firstUseful: MeasurementEvent | undefined;
  for (const e of events) {
    if (USEFUL_ACTIONS.has(e.event_name)) {
      firstUseful = e;
      break;
    }
  }

  const providerDurations: number[] = [];
  const toolDurations: number[] = [];
  for (const e of events) {
    const d = e.measurements.duration_ms;
    const ms = typeof d === "number" ? d : isUsageValue(d) ? d.value : null;
    if (ms == null) continue;
    if (e.event_name.startsWith("provider.")) providerDurations.push(ms);
    if (e.event_name.startsWith("tool.")) toolDurations.push(ms);
  }

  const activeIntervals: Array<{ start: number; end: number }> = [];
  for (const e of events) {
    if (!engToolsEvent(e.event_name)) continue;
    const t = Date.parse(e.occurred_at);
    const d = typeof e.measurements.duration_ms === "number" ? e.measurements.duration_ms : 0;
    if (Number.isFinite(t)) activeIntervals.push({ start: t, end: t + d });
  }

  return {
    end_to_end_duration_ms:
      Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, endMs - startMs) : null,
    time_to_first_useful_action_ms:
      firstUseful && Number.isFinite(startMs)
        ? Math.max(0, Date.parse(firstUseful.occurred_at) - startMs)
        : null,
    active_engineering_time_ms: mergeIntervalDuration(activeIntervals),
    wall_clock_duration_ms:
      Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, endMs - startMs) : null,
    provider_request_latency: summarizeLatency(providerDurations),
    tool_duration: summarizeLatency(toolDurations),
    provenance: "OBSERVED" as const,
  };
}

function engToolsEvent(name: string): boolean {
  return [
    "tool.completed",
    "filesystem.write",
    "diff.applied",
    "command.executed",
    "test.completed",
    "artifact.created",
  ].includes(name);
}

export function buildRunMetricsReport(events: MeasurementEvent[]) {
  return {
    hierarchy: computeHierarchyMetrics(events),
    usage: computeUsageAggregate(events),
    timing: computeTimingMetrics(events),
    event_counts: countByName(events),
    coverage_gaps: detectCoverageGaps(events),
  };
}

function countByName(events: MeasurementEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) out[e.event_name] = (out[e.event_name] ?? 0) + 1;
  return out;
}

function detectCoverageGaps(events: MeasurementEvent[]): string[] {
  const gaps: string[] = [];
  const names = new Set(events.map((e) => e.event_name));
  if (!names.has("run.started") && !names.has("benchmark.case_started")) gaps.push("missing_run_start");
  if (![...names].some((n) => n.startsWith("run.") || n.startsWith("benchmark.case_"))) {
    gaps.push("missing_terminal_run_event");
  }
  for (const e of events) {
    if (e.event_name.startsWith("agent.") && !e.correlation.agent_id) gaps.push("agent_event_without_agent_id");
    if (e.quality?.missing_fields?.length) gaps.push(`incomplete:${e.event_name}`);
  }
  return [...new Set(gaps)];
}
