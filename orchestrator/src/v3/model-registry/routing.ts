/**
 * V5-M03 — routeWithFallback: explicit reasons; never silent against policy.
 */

import type { RoutingAttemptReason, RoutingDecision, RoutingPolicy } from "./types.js";

export class RoutingError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RoutingError";
  }
}

export interface RouteWithFallbackInput {
  primary_provider_id: string;
  policy: RoutingPolicy;
  /**
   * Probe each candidate. Return ok=true to accept.
   * Reasons are always recorded regardless of outcome.
   */
  tryProvider: (providerId: string) => Promise<{ ok: boolean; detail: string }>;
}

/**
 * Select a provider with ordered fallback.
 * - Never silently falls back when allow_fallback=false.
 * - Never selects a blocked provider.
 * - Always returns explicit reasons for every attempt/skip.
 */
export async function routeWithFallback(
  input: RouteWithFallbackInput,
): Promise<RoutingDecision> {
  const { primary_provider_id, policy, tryProvider } = input;
  const blocked = new Set(policy.blocked_provider_ids ?? []);
  const reasons: RoutingAttemptReason[] = [];
  let policy_blocked_silent_fallback = false;

  const candidates: string[] = [primary_provider_id];
  if (policy.allow_fallback) {
    for (const id of policy.fallback_provider_ids) {
      if (id !== primary_provider_id) candidates.push(id);
    }
  } else if (policy.fallback_provider_ids.length > 0) {
    policy_blocked_silent_fallback = true;
    reasons.push({
      provider_id: primary_provider_id,
      outcome: "skipped",
      reason: `policy.allow_fallback=false — fallbacks [${policy.fallback_provider_ids.join(",")}] will NOT be tried (explicit, not silent)`,
    });
  }

  // Announce blocked providers that appear in the candidate chain (explicit, even if never reached).
  for (const providerId of candidates) {
    if (blocked.has(providerId)) {
      reasons.push({
        provider_id: providerId,
        outcome: "blocked",
        reason: `provider_id=${providerId} listed in policy.blocked_provider_ids`,
      });
    }
  }

  let selected: string | null = null;
  let fallback_used = false;
  let isPrimary = true;

  for (const providerId of candidates) {
    if (blocked.has(providerId)) {
      isPrimary = false;
      continue;
    }

    const result = await tryProvider(providerId);
    if (result.ok) {
      reasons.push({
        provider_id: providerId,
        outcome: "selected",
        reason: isPrimary
          ? `primary ok: ${result.detail}`
          : `fallback ok after primary failure: ${result.detail}`,
      });
      selected = providerId;
      fallback_used = !isPrimary;
      break;
    }

    reasons.push({
      provider_id: providerId,
      outcome: "failed",
      reason: isPrimary
        ? `primary failed: ${result.detail}`
        : `fallback failed: ${result.detail}`,
    });
    isPrimary = false;
  }

  if (!selected && !policy.allow_fallback && candidates.length === 1) {
    // Primary failed and fallbacks forbidden — already recorded.
    policy_blocked_silent_fallback = true;
  }

  return {
    kind: "RoutingDecision",
    primary_provider_id,
    selected_provider_id: selected,
    fallback_used,
    policy: {
      fallback_provider_ids: [...policy.fallback_provider_ids],
      allow_fallback: policy.allow_fallback,
      blocked_provider_ids: policy.blocked_provider_ids
        ? [...policy.blocked_provider_ids]
        : undefined,
    },
    reasons,
    policy_blocked_silent_fallback,
  };
}
