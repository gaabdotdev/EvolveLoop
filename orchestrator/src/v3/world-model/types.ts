/**
 * World Model substrate types (V3-F3 start).
 * Additive over Belief/Observation contracts — not a second KnowledgeBackend.
 */

export const DRIFT_TYPES = ["missing", "contradictory", "stale"] as const;
export type DriftType = (typeof DRIFT_TYPES)[number];

export const BELIEF_REVISION_RELATIONS = ["supports", "contradicts", "invalidates"] as const;
export type BeliefRevisionRelation = (typeof BELIEF_REVISION_RELATIONS)[number];

export interface BeliefRevisionEdge {
  from_belief_id: string;
  to_belief_id: string;
  relation: BeliefRevisionRelation;
}

export interface ReconciliationDrift {
  type: DriftType;
  /** Belief id (or observation id when the subject is an orphan fact). */
  subject_id: string;
  detail: string;
  related_refs?: string[];
}

export interface ReconciliationReport {
  reconciled_at: string;
  observation_count: number;
  belief_count: number;
  drifts: ReconciliationDrift[];
  /** True when any drift was detected. */
  has_drift: boolean;
}

export interface ReconcileOptions {
  /** ISO timestamp used for stale checks. Defaults to now. */
  now?: string;
  /**
   * Beliefs whose updated_at is older than now − staleAfterMs are stale
   * when status is still active (not invalidated). Default: 24h.
   */
  staleAfterMs?: number;
}

export interface ToSnapshotOptions {
  snapshot_id?: string;
  observed_at?: string;
  /** When true (default), open_signals include reconcile() drift summaries. */
  includeReconciliation?: boolean;
  reconcile?: ReconcileOptions;
}
