/**
 * WorldModelStore — Observation[] + Belief[] substrate (Meta 11–12 / §182–188).
 * Additive intelligence layer: does NOT compete with KnowledgeBackend retrieval.
 * Does NOT modify MemoryStore V2.
 */

import { V3_API_VERSION, V3_SCHEMA_VERSION } from "../contracts/common.js";
import type { Belief, Observation } from "../contracts/types.js";
import { validateBelief, validateObservation } from "../contracts/validators.js";
import type { WorldSnapshot } from "../agency/types.js";
import { assertBeliefVsObservation, assertObservationVsBelief } from "./assert.js";
import { BeliefRevisionGraph } from "./belief-revision.js";
import { WorldModelValidationError } from "./errors.js";
import { reconcile } from "./reconcile.js";
import type {
  BeliefRevisionRelation,
  ReconciliationReport,
  ReconcileOptions,
  ToSnapshotOptions,
} from "./types.js";

export class WorldModelStore {
  private readonly observations = new Map<string, Observation>();
  private readonly beliefs = new Map<string, Belief>();
  private readonly revision = new BeliefRevisionGraph();

  /** Write a validated Observation. Inference/Belief payloads are rejected. */
  putObservation(input: unknown): Observation {
    const observation = assertObservationVsBelief(input);
    const check = validateObservation(observation);
    if (!check.valid) {
      throw new WorldModelValidationError("Observation", check.errors);
    }
    const id = observation.metadata.observation_id;
    this.observations.set(id, structuredClone(observation));
    return this.observations.get(id)!;
  }

  /** Write a validated Belief. Raw Observation payloads are rejected. */
  putBelief(input: unknown): Belief {
    assertBeliefVsObservation(input);
    const check = validateBelief(input);
    if (!check.valid) {
      throw new WorldModelValidationError("Belief", check.errors);
    }
    const belief = input as Belief;
    const id = belief.metadata.belief_id;
    this.beliefs.set(id, structuredClone(belief));
    return this.beliefs.get(id)!;
  }

  getObservation(id: string): Observation | undefined {
    const o = this.observations.get(id);
    return o ? structuredClone(o) : undefined;
  }

  getBelief(id: string): Belief | undefined {
    const b = this.beliefs.get(id);
    return b ? structuredClone(b) : undefined;
  }

  listObservations(): Observation[] {
    return [...this.observations.values()].map((o) => structuredClone(o));
  }

  listBeliefs(): Belief[] {
    return [...this.beliefs.values()].map((b) => structuredClone(b));
  }

  addRevisionEdge(
    from_belief_id: string,
    to_belief_id: string,
    relation: BeliefRevisionRelation,
  ) {
    return this.revision.addEdge(from_belief_id, to_belief_id, relation);
  }

  revisionGraph(): BeliefRevisionGraph {
    return this.revision;
  }

  reconcile(options?: ReconcileOptions): ReconciliationReport {
    return reconcile(this.listObservations(), this.listBeliefs(), this.revision, options);
  }

  /**
   * Build AgencyLoop WorldSnapshot from current store state.
   * open_signals carry reconciliation drift summaries when includeReconciliation is true.
   */
  toSnapshot(options: ToSnapshotOptions = {}): WorldSnapshot {
    const observed_at = options.observed_at ?? new Date().toISOString();
    const snapshot_id = options.snapshot_id ?? `wm-${observed_at}`;
    const includeReconciliation = options.includeReconciliation !== false;

    const beliefs = this.listBeliefs();
    const observations = this.listObservations();

    const notes = beliefs.map(
      (b) => `${b.metadata.belief_id}:${b.spec.status}:c=${b.spec.confidence}`,
    );

    let open_signals: string[] | undefined;
    if (includeReconciliation) {
      const report = this.reconcile({
        ...options.reconcile,
        now: options.reconcile?.now ?? observed_at,
      });
      open_signals = report.drifts.map(
        (d) => `${d.type}:${d.subject_id}:${d.detail}`,
      );
    }

    return {
      snapshot_id,
      observed_at,
      notes: notes.length > 0 ? notes : undefined,
      open_signals:
        open_signals && open_signals.length > 0 ? open_signals : undefined,
      observation_ids: observations.map((o) => o.metadata.observation_id),
      belief_ids: beliefs.map((b) => b.metadata.belief_id),
    };
  }
}

/** Factory helpers for tests / demos — still go through store validation. */
export function makeObservation(partial: {
  observation_id: string;
  raw: string;
  source: string;
  observed_at?: string;
  trust_hint?: Observation["spec"]["trust_hint"];
}): Observation {
  return {
    apiVersion: V3_API_VERSION,
    kind: "Observation",
    metadata: {
      schema_version: V3_SCHEMA_VERSION,
      observation_id: partial.observation_id,
      observed_at: partial.observed_at ?? new Date().toISOString(),
    },
    spec: {
      raw: partial.raw,
      source: partial.source,
      ...(partial.trust_hint ? { trust_hint: partial.trust_hint } : {}),
    },
  };
}

export function makeBelief(partial: {
  belief_id: string;
  statement: string;
  status: Belief["spec"]["status"];
  confidence: number;
  supporting_observation_refs?: string[];
  dependent_belief_refs?: string[];
  updated_at?: string;
}): Belief {
  return {
    apiVersion: V3_API_VERSION,
    kind: "Belief",
    metadata: {
      schema_version: V3_SCHEMA_VERSION,
      belief_id: partial.belief_id,
      updated_at: partial.updated_at ?? new Date().toISOString(),
    },
    spec: {
      statement: partial.statement,
      status: partial.status,
      supporting_observation_refs: partial.supporting_observation_refs ?? [],
      ...(partial.dependent_belief_refs
        ? { dependent_belief_refs: partial.dependent_belief_refs }
        : {}),
      confidence: partial.confidence,
    },
  };
}
