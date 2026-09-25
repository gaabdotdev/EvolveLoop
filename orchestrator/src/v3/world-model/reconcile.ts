/**
 * reconcile — detect missing / contradictory / stale drift between observations and beliefs (§185).
 */

import type { Belief, Observation } from "../contracts/types.js";
import type { BeliefRevisionGraph } from "./belief-revision.js";
import type {
  ReconciliationDrift,
  ReconciliationReport,
  ReconcileOptions,
} from "./types.js";

const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const ACTIVE_STATUSES = new Set(["hypothesis", "supported", "strongly_supported", "suspect"]);

/** Minimal polarity pairs for observation-vs-belief contradictory property (§185). */
const POLARITY_PAIRS: ReadonlyArray<readonly [RegExp, RegExp]> = [
  [
    /\b(up|healthy|ok|success|online|restored|available|pass(?:ed)?)\b/i,
    /\b(down|unhealthy|fail(?:ing|ed)?|offline|error|unavailable|broken|outage)\b/i,
  ],
];

function parseTime(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/** True when two texts pull opposite polarity tokens (no LLM). */
export function textsContradictPolarity(a: string, b: string): boolean {
  for (const [pos, neg] of POLARITY_PAIRS) {
    if ((pos.test(a) && neg.test(b)) || (neg.test(a) && pos.test(b))) return true;
  }
  return false;
}

/**
 * Compare observed facts vs interpretive beliefs.
 * Does not mutate store state — returns a report for Agency open_signals.
 */
export function reconcile(
  observations: readonly Observation[],
  beliefs: readonly Belief[],
  revision: BeliefRevisionGraph,
  options: ReconcileOptions = {},
): ReconciliationReport {
  const nowIso = options.now ?? new Date().toISOString();
  const nowMs = parseTime(nowIso);
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;

  const obsById = new Map(
    observations.map((o) => [o.metadata.observation_id, o] as const),
  );
  const beliefById = new Map(beliefs.map((b) => [b.metadata.belief_id, b] as const));

  const drifts: ReconciliationDrift[] = [];

  for (const belief of beliefs) {
    const bid = belief.metadata.belief_id;
    const refs = belief.spec.supporting_observation_refs;
    const missingRefs = refs.filter((ref) => !obsById.has(ref));

    if (missingRefs.length > 0) {
      drifts.push({
        type: "missing",
        subject_id: bid,
        detail: `supporting observation(s) absent: ${missingRefs.join(", ")}`,
        related_refs: missingRefs,
      });
    }

    if (
      (belief.spec.status === "supported" || belief.spec.status === "strongly_supported") &&
      refs.length === 0
    ) {
      drifts.push({
        type: "missing",
        subject_id: bid,
        detail: `status ${belief.spec.status} requires supporting observations`,
      });
    }

    // Observation-vs-belief contradictory property (supporting fact vs statement)
    if (ACTIVE_STATUSES.has(belief.spec.status) && belief.spec.status !== "suspect") {
      for (const ref of refs) {
        const obs = obsById.get(ref);
        if (!obs) continue;
        if (textsContradictPolarity(belief.spec.statement, obs.spec.raw)) {
          drifts.push({
            type: "contradictory",
            subject_id: bid,
            detail: `observation ${ref} contradicts belief statement`,
            related_refs: [ref],
          });
        }
      }
    }

    // Stale: wall-clock age, or newer supporting observation than belief.updated_at
    if (ACTIVE_STATUSES.has(belief.spec.status) && Number.isFinite(nowMs)) {
      const updatedMs = parseTime(belief.metadata.updated_at);
      if (Number.isFinite(updatedMs) && nowMs - updatedMs > staleAfterMs) {
        drifts.push({
          type: "stale",
          subject_id: bid,
          detail: `belief updated_at older than staleAfterMs (${staleAfterMs}ms)`,
        });
      }

      let newestObsMs = NaN;
      for (const ref of refs) {
        const obs = obsById.get(ref);
        if (!obs) continue;
        const t = parseTime(obs.metadata.observed_at);
        if (Number.isFinite(t) && (!Number.isFinite(newestObsMs) || t > newestObsMs)) {
          newestObsMs = t;
        }
      }
      if (
        Number.isFinite(newestObsMs) &&
        Number.isFinite(updatedMs) &&
        newestObsMs > updatedMs
      ) {
        drifts.push({
          type: "stale",
          subject_id: bid,
          detail: "supporting observation newer than belief.updated_at — belief not revised",
          related_refs: refs.filter((r) => {
            const o = obsById.get(r);
            return o !== undefined && parseTime(o.metadata.observed_at) === newestObsMs;
          }),
        });
      }
    }
  }

  // Contradictory: active beliefs linked by contradicts / invalidates
  for (const edge of revision.list()) {
    if (edge.relation !== "contradicts" && edge.relation !== "invalidates") continue;
    const from = beliefById.get(edge.from_belief_id);
    const to = beliefById.get(edge.to_belief_id);
    if (!from || !to) continue;

    const fromActive = ACTIVE_STATUSES.has(from.spec.status) && from.spec.status !== "suspect";
    const toActive = ACTIVE_STATUSES.has(to.spec.status) && to.spec.status !== "suspect";

    if (edge.relation === "contradicts" && fromActive && toActive) {
      drifts.push({
        type: "contradictory",
        subject_id: edge.to_belief_id,
        detail: `contradicts edge from ${edge.from_belief_id} while both beliefs are active`,
        related_refs: [edge.from_belief_id],
      });
    }

    if (
      edge.relation === "invalidates" &&
      from.spec.status === "invalidated" &&
      toActive
    ) {
      drifts.push({
        type: "contradictory",
        subject_id: edge.to_belief_id,
        detail: `depends on invalidated belief ${edge.from_belief_id} via invalidates edge`,
        related_refs: [edge.from_belief_id],
      });
    }
  }

  return {
    reconciled_at: nowIso,
    observation_count: observations.length,
    belief_count: beliefs.length,
    drifts,
    has_drift: drifts.length > 0,
  };
}
