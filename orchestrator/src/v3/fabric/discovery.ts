/**
 * FabricDiscovery — search existing CapabilityRegistry by need string.
 * EXTEND registry only; NEVER create a second CapabilityRegistry.
 */

import type { CapabilityRegistry } from "../../types/index.js";
import { CAPABILITY_PROFILES } from "../../discovery/capability-profiles.js";
import type { CandidateCapability, FabricDiscoveryOptions } from "./types.js";
import {
  lifecycleStateRank,
  resolveLifecycleForCapability,
} from "./lifecycle.js";

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(/[\s:./_|,-]+/)
    .filter((t) => t.length > 2);
}

function tokensOverlap(a: string[], b: string[]): string[] {
  return a.filter((t) =>
    b.some((it) => {
      if (it === t) return true;
      // Avoid short false positives (e.g. "cap" ⊂ "capability")
      if (t.length < 4 || it.length < 4) return false;
      return it.includes(t) || t.includes(it);
    }),
  );
}

/**
 * Score how well a capability id matches a need string.
 * Exact id / substring beats token / profile affinity.
 */
export function scoreNeedMatch(capabilityId: string, need: string): { score: number; reason: string } {
  const id = normalize(capabilityId);
  const n = normalize(need);
  if (!n) return { score: 0, reason: "empty_need" };
  if (id === n) return { score: 100, reason: "exact_id" };
  if (n.includes(id) || id.includes(n)) return { score: 80, reason: "substring" };

  const needTokens = tokens(need);
  const idTokens = tokens(capabilityId);
  const overlap = tokensOverlap(needTokens, idTokens);
  if (overlap.length > 0) {
    return { score: 40 + Math.min(30, overlap.length * 10), reason: `token:${overlap.join(",")}` };
  }

  // Profile affinity: need mentions profile name or a known profile capability keyword
  for (const [profile, caps] of Object.entries(CAPABILITY_PROFILES)) {
    if (n.includes(profile) && caps.includes(capabilityId)) {
      return { score: 35, reason: `profile:${profile}` };
    }
    if (caps.includes(capabilityId) && needTokens.some((t) => profile.includes(t) || t.includes(profile))) {
      return { score: 30, reason: `profile_token:${profile}` };
    }
  }

  return { score: 0, reason: "no_match" };
}

/**
 * Discover candidate capabilities for a need against the live registry.
 * Returns candidates sorted by score then lifecycle rank — does not execute.
 */
export function discoverCapabilities(
  need: string,
  registry: CapabilityRegistry,
  options: FabricDiscoveryOptions = {},
): CandidateCapability[] {
  if (registry.kind !== "CapabilityRegistry") {
    throw new Error("FabricDiscovery requires CapabilityRegistry (kind mismatch)");
  }

  const candidates: CandidateCapability[] = [];

  for (const [capability_id, entry] of Object.entries(registry.capabilities)) {
    const providers = entry.providers ?? [];
    const { score, reason } = scoreNeedMatch(capability_id, need);
    if (score <= 0) continue;

    const lifecycle = resolveLifecycleForCapability(
      capability_id,
      providers,
      options.lifecycleById,
    );

    candidates.push({
      capability_id,
      capability_version: lifecycle.spec.capability_version,
      lifecycle_state: lifecycle.spec.state,
      score,
      match_reason: reason,
      provider_ids: providers.map((p) => p.id),
      lifecycle,
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return lifecycleStateRank(b.lifecycle_state) - lifecycleStateRank(a.lifecycle_state);
  });

  if (options.limit !== undefined && options.limit >= 0) {
    return candidates.slice(0, options.limit);
  }
  return candidates;
}

/** Alias matching Briefing name FabricDiscovery. */
export const FabricDiscovery = {
  discover: discoverCapabilities,
  scoreNeedMatch,
};
