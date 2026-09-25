/**
 * CapabilityLifecycleRecord helpers — annotate existing registry ids.
 * Never create a second CapabilityRegistry.
 */

import { V3_API_VERSION, V3_SCHEMA_VERSION } from "../contracts/common.js";
import type {
  CapabilityLifecycleRecord,
  CapabilityLifecycleState,
} from "../contracts/types.js";
import type { ProviderEntry } from "../../types/index.js";

/** States safe to include in a CompositionPlan (execution still gated downstream). */
export const USABLE_LIFECYCLE_STATES: readonly CapabilityLifecycleState[] = [
  "AVAILABLE",
  "VALIDATED",
  "REVALIDATED",
  "DEGRADED",
  "CANDIDATE",
] as const;

/** States that must not be planned or registered via fabric. */
export const BLOCKED_LIFECYCLE_STATES: readonly CapabilityLifecycleState[] = [
  "QUARANTINED",
  "REVOKED",
  "REPLACED",
] as const;

const STATE_RANK: Record<CapabilityLifecycleState, number> = {
  AVAILABLE: 100,
  REVALIDATED: 95,
  VALIDATED: 90,
  DEGRADED: 60,
  CANDIDATE: 50,
  DISCOVERED: 30,
  QUARANTINED: 10,
  REPLACED: 5,
  REVOKED: 0,
};

export function isUsableLifecycleState(state: CapabilityLifecycleState): boolean {
  return (USABLE_LIFECYCLE_STATES as readonly string[]).includes(state);
}

export function isBlockedLifecycleState(state: CapabilityLifecycleState): boolean {
  return (BLOCKED_LIFECYCLE_STATES as readonly string[]).includes(state);
}

export function lifecycleStateRank(state: CapabilityLifecycleState): number {
  return STATE_RANK[state] ?? 0;
}

export function makeLifecycleRecord(input: {
  capability_id: string;
  capability_version: string;
  state: CapabilityLifecycleState;
  updated_at?: string;
  reason?: string;
  superseded_by?: string;
}): CapabilityLifecycleRecord {
  return {
    apiVersion: V3_API_VERSION,
    kind: "CapabilityLifecycleRecord",
    metadata: { schema_version: V3_SCHEMA_VERSION },
    spec: {
      capability_id: input.capability_id,
      capability_version: input.capability_version,
      state: input.state,
      updated_at: input.updated_at ?? new Date().toISOString(),
      reason: input.reason,
      superseded_by: input.superseded_by,
    },
  };
}

/**
 * Infer lifecycle from registry provider availability when no annotation exists.
 * Inegociável: deprecated → DEGRADED (not silent AVAILABLE).
 */
export function inferLifecycleStateFromProviders(
  providers: readonly ProviderEntry[],
): CapabilityLifecycleState {
  if (providers.length === 0) return "DISCOVERED";

  const availabilities = providers.map((p) => p.availability);
  if (availabilities.every((a) => a === "deprecated")) return "DEGRADED";
  if (availabilities.some((a) => a === "active")) return "AVAILABLE";
  if (availabilities.some((a) => a === "experimental")) return "CANDIDATE";
  return "DISCOVERED";
}

export function bestProviderVersion(providers: readonly ProviderEntry[]): string {
  if (providers.length === 0) return "0.0.0";
  const sorted = [...providers].sort((a, b) => b.priority - a.priority);
  return sorted[0]!.version || "0.0.0";
}

/**
 * Resolve lifecycle for a registry capability_id.
 * Prefer explicit CapabilityLifecycleRecord; else infer from providers.
 */
export function resolveLifecycleForCapability(
  capability_id: string,
  providers: readonly ProviderEntry[],
  lifecycleById?: Record<string, CapabilityLifecycleRecord>,
): CapabilityLifecycleRecord {
  const annotated = lifecycleById?.[capability_id];
  if (annotated && annotated.spec.capability_id === capability_id) {
    return annotated;
  }
  return makeLifecycleRecord({
    capability_id,
    capability_version: bestProviderVersion(providers),
    state: inferLifecycleStateFromProviders(providers),
    reason: "inferred_from_registry_providers",
  });
}
