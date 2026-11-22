/**
 * V5-M02 — Minimal deterministic executor scheduler (no ML).
 * Selects by required capabilities + preference order; explains rejects.
 */

import type { AdapterCapabilityKey, AdapterId } from "../adapters/types.js";
import {
  adapterSatisfiesCapabilities,
  discoverCapabilityProfile,
  type AdapterCapabilityProfile,
} from "./capability-profile.js";

export interface ExecutorCandidate {
  /** Stable id (typically agent_id or native handle). */
  executor_id: string;
  adapter_id: AdapterId;
  /** Optional preference rank — lower is better (0 = most preferred). */
  preference_rank?: number;
}

export interface ExecutorSelectionRequest {
  required_capabilities: AdapterCapabilityKey[];
  candidates: ExecutorCandidate[];
  /**
   * Preferred adapter order (first wins among capability-compatible ties).
   * Combined with candidate.preference_rank then executor_id lexicographic.
   */
  preferred_adapters?: AdapterId[];
}

export interface ExecutorRejection {
  executor_id: string;
  adapter_id: AdapterId;
  reasons: string[];
}

export interface ExecutorSelectionResult {
  kind: "ExecutorSelectionResult";
  selected: ExecutorCandidate | null;
  profile?: AdapterCapabilityProfile;
  rejected: ExecutorRejection[];
  /** Human-auditable explanation of the choice (deterministic). */
  explanation: string;
  algorithm: "capability+preference_v1";
}

function adapterPreferenceIndex(
  adapterId: AdapterId,
  preferred?: AdapterId[],
): number {
  if (!preferred || preferred.length === 0) return 0;
  const idx = preferred.indexOf(adapterId);
  return idx === -1 ? preferred.length : idx;
}

/**
 * Deterministic selection:
 * 1. Filter candidates that satisfy required capabilities (partial+ ok; unsupported reject).
 * 2. Sort by: preference_rank ASC → preferred_adapters index ASC → executor_id ASC.
 * 3. Pick first; document all rejects.
 */
export function selectExecutor(
  req: ExecutorSelectionRequest,
): ExecutorSelectionResult {
  const rejected: ExecutorRejection[] = [];
  const eligible: Array<{
    candidate: ExecutorCandidate;
    profile: AdapterCapabilityProfile;
    prefRank: number;
    adapterPref: number;
  }> = [];

  for (const candidate of req.candidates) {
    let profile: AdapterCapabilityProfile;
    try {
      profile = discoverCapabilityProfile(candidate.adapter_id);
    } catch (err) {
      rejected.push({
        executor_id: candidate.executor_id,
        adapter_id: candidate.adapter_id,
        reasons: [err instanceof Error ? err.message : String(err)],
      });
      continue;
    }
    const check = adapterSatisfiesCapabilities(
      profile,
      req.required_capabilities,
    );
    if (!check.ok) {
      rejected.push({
        executor_id: candidate.executor_id,
        adapter_id: candidate.adapter_id,
        reasons: check.reasons,
      });
      continue;
    }
    eligible.push({
      candidate,
      profile,
      prefRank: candidate.preference_rank ?? 1000,
      adapterPref: adapterPreferenceIndex(
        candidate.adapter_id,
        req.preferred_adapters,
      ),
    });
  }

  eligible.sort((a, b) => {
    if (a.prefRank !== b.prefRank) return a.prefRank - b.prefRank;
    if (a.adapterPref !== b.adapterPref) return a.adapterPref - b.adapterPref;
    return a.candidate.executor_id.localeCompare(b.candidate.executor_id);
  });

  const winner = eligible[0];
  if (!winner) {
    return {
      kind: "ExecutorSelectionResult",
      selected: null,
      rejected,
      explanation:
        req.candidates.length === 0
          ? "no_candidates"
          : `none_compatible: required=[${req.required_capabilities.join(",")}] rejected=${rejected.length}`,
      algorithm: "capability+preference_v1",
    };
  }

  return {
    kind: "ExecutorSelectionResult",
    selected: winner.candidate,
    profile: winner.profile,
    rejected,
    explanation: [
      `selected=${winner.candidate.executor_id}`,
      `adapter=${winner.candidate.adapter_id}`,
      `pref_rank=${winner.prefRank}`,
      `adapter_pref_index=${winner.adapterPref}`,
      `required=[${req.required_capabilities.join(",")}]`,
      `eligible=${eligible.length}`,
      `rejected=${rejected.length}`,
    ].join("; "),
    algorithm: "capability+preference_v1",
  };
}
