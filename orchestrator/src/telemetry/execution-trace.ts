/**
 * Thin post-run summary from RunResult.events + evidence[].
 * Replay model: JSONL events + evidence payloads (not Temporal) — see docs.
 */

import type { Evidence, EventEnvelope, FeatureMetrics } from "../types/index.js";

export interface CapabilityCallSummary {
  capability: string;
  node_id?: string;
  provider_id?: string;
  status?: string;
  duration_ms?: number;
}

export interface AuthorityDecisionSummary {
  capability: string;
  decision: "allow" | "deny" | "confirm" | string;
  reason?: string;
  node_id?: string;
  source: "evidence" | "event";
}

export interface ExecutionErrorSummary {
  code?: string;
  message?: string;
  node_id?: string;
  capability?: string;
  source: "evidence" | "event";
}

export interface ExecutionTraceSummary {
  execution_id: string;
  success?: boolean;
  latency_ms?: number;
  capability_calls: CapabilityCallSummary[];
  policy_authority_decisions: AuthorityDecisionSummary[];
  errors: ExecutionErrorSummary[];
  event_counts: Record<string, number>;
}

export interface ExecutionTraceInput {
  events: EventEnvelope[];
  evidence: Evidence[];
  metrics?: Pick<FeatureMetrics, "feature_id" | "success" | "duration_ms">;
  /** Override when metrics.feature_id is absent */
  execution_id?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

/**
 * Produce a compact JSON-friendly summary for observability / offline replay review.
 */
export function summarizeExecutionTrace(input: ExecutionTraceInput): ExecutionTraceSummary {
  const { events, evidence, metrics } = input;
  const event_counts: Record<string, number> = {};
  for (const e of events) {
    event_counts[e.type] = (event_counts[e.type] ?? 0) + 1;
  }

  const callMap = new Map<string, CapabilityCallSummary>();
  const policy_authority_decisions: AuthorityDecisionSummary[] = [];
  const errors: ExecutionErrorSummary[] = [];

  for (const ev of evidence) {
    const payload = ev.spec.payload;
    const meta = ev.metadata;
    const capability = meta.capability;
    const node_id = meta.node_id;

    if (payload?.type === "authority") {
      policy_authority_decisions.push({
        capability: payload.capability || capability,
        decision: payload.decision,
        reason: payload.reason,
        node_id,
        source: "evidence",
      });
      if (payload.decision !== "allow" || payload.handler_error) {
        errors.push({
          code: payload.handler_error ?? `AUTHORITY_${payload.decision.toUpperCase()}`,
          message: payload.reason,
          node_id,
          capability: payload.capability || capability,
          source: "evidence",
        });
      }
    }

    if (payload?.type === "worker" || (ev.spec as { normalized?: unknown }).normalized !== undefined) {
      const callKey = `${node_id ?? ""}:${meta.run_id ?? ""}:${capability}`;
      callMap.set(callKey, {
        capability,
        node_id,
        provider_id: meta.provider_id,
        status: ev.spec.status,
        duration_ms: ev.spec.duration_ms,
      });
    }

    if (ev.spec.status === "failed" && payload?.type !== "authority") {
      errors.push({
        code: "EVIDENCE_FAILED",
        message: `evidence status failed for ${capability}`,
        node_id,
        capability,
        source: "evidence",
      });
    }

    // Nested authority on worker payload (DeterministicProvider success path)
    const nestedAuth = asRecord(payload)?.authority ?? asRecord(asRecord(payload)?.result)?.authority;
    const authObj = asRecord(nestedAuth);
    if (authObj && typeof authObj.decision === "string") {
      policy_authority_decisions.push({
        capability: String(authObj.capability ?? capability),
        decision: String(authObj.decision),
        reason: authObj.reason ? String(authObj.reason) : undefined,
        node_id,
        source: "evidence",
      });
    }
  }

  for (const event of events) {
    const p = event.payload;
    if (event.type === "ProviderSelected" || event.type === "NodeStarted" || event.type === "NodeCompleted") {
      const cap = typeof p.capability === "string" ? p.capability : undefined;
      const nodeId = typeof p.node_id === "string" ? p.node_id : undefined;
      const runId = typeof p.run_id === "string" ? p.run_id : (typeof event.correlation_id === "string" ? event.correlation_id : undefined);

      if (cap) {
        const exactKey = `${nodeId ?? ""}:${runId ?? ""}:${cap}`;
        const nodeOnlyKey = `${nodeId ?? ""}:${cap}`;
        let existingKey: string | undefined;

        if (callMap.has(exactKey)) {
          existingKey = exactKey;
        } else if (nodeId && callMap.has(nodeOnlyKey)) {
          existingKey = nodeOnlyKey;
        } else {
          for (const k of callMap.keys()) {
            if (nodeId && k.startsWith(`${nodeId}:`)) {
              existingKey = k;
              break;
            }
          }
        }

        if (existingKey) {
          const entry = callMap.get(existingKey)!;
          if (typeof p.provider_id === "string" && !entry.provider_id) {
            entry.provider_id = p.provider_id;
          }
          if (event.type === "NodeCompleted") {
            entry.status = "completed";
          }
          if (typeof p.duration_ms === "number" && !entry.duration_ms) {
            entry.duration_ms = p.duration_ms;
          }
        } else {
          const key = exactKey || nodeOnlyKey || `call-${callMap.size}`;
          callMap.set(key, {
            capability: cap,
            node_id: nodeId,
            provider_id: typeof p.provider_id === "string" ? p.provider_id : undefined,
            status: event.type === "NodeCompleted" ? "completed" : event.type,
            duration_ms: typeof p.duration_ms === "number" ? p.duration_ms : undefined,
          });
        }
      }
    }
    if (event.type === "NodeFailed") {
      let errCode = typeof p.error_code === "string" ? p.error_code : undefined;
      let errMsg = typeof p.message === "string" ? p.message : undefined;

      if (typeof p.error === "string") {
        if (!errMsg) errMsg = p.error;
      } else if (p.error && typeof p.error === "object") {
        const errObj = p.error as { code?: unknown; message?: unknown };
        if (!errMsg && typeof errObj.message === "string") {
          errMsg = errObj.message;
        }
        if (!errCode && typeof errObj.code === "string") {
          errCode = errObj.code;
        }
      }

      errors.push({
        code: errCode ?? "NODE_FAILED",
        message: errMsg,
        node_id: typeof p.node_id === "string" ? p.node_id : undefined,
        capability: typeof p.capability === "string" ? p.capability : undefined,
        source: "event",
      });
    }
  }

  const capability_calls = Array.from(callMap.values());

  const execution_id =
    input.execution_id ??
    metrics?.feature_id ??
    events[0]?.feature_id ??
    evidence[0]?.metadata.run_id ??
    "unknown";

  return {
    execution_id,
    success: metrics?.success,
    latency_ms: metrics?.duration_ms,
    capability_calls,
    policy_authority_decisions,
    errors,
    event_counts,
  };
}
