/**
 * BeliefRevision — directed edges supports | contradicts | invalidates (§188).
 */

import { BeliefRevisionError } from "./errors.js";
import {
  BELIEF_REVISION_RELATIONS,
  type BeliefRevisionEdge,
  type BeliefRevisionRelation,
} from "./types.js";

function isRelation(value: string): value is BeliefRevisionRelation {
  return (BELIEF_REVISION_RELATIONS as readonly string[]).includes(value);
}

export class BeliefRevisionGraph {
  private readonly edges: BeliefRevisionEdge[] = [];

  addEdge(
    from_belief_id: string,
    to_belief_id: string,
    relation: BeliefRevisionRelation,
  ): BeliefRevisionEdge {
    if (!from_belief_id || !to_belief_id) {
      throw new BeliefRevisionError("from_belief_id and to_belief_id must be non-empty");
    }
    if (from_belief_id === to_belief_id) {
      throw new BeliefRevisionError("self-edges are forbidden");
    }
    if (!isRelation(relation)) {
      throw new BeliefRevisionError(
        `relation must be one of: ${BELIEF_REVISION_RELATIONS.join(", ")}`,
      );
    }

    const dup = this.edges.find(
      (e) =>
        e.from_belief_id === from_belief_id &&
        e.to_belief_id === to_belief_id &&
        e.relation === relation,
    );
    if (dup) return dup;

    const edge: BeliefRevisionEdge = { from_belief_id, to_belief_id, relation };
    this.edges.push(edge);
    return edge;
  }

  list(): readonly BeliefRevisionEdge[] {
    return [...this.edges];
  }

  edgesFrom(belief_id: string): BeliefRevisionEdge[] {
    return this.edges.filter((e) => e.from_belief_id === belief_id);
  }

  edgesTo(belief_id: string): BeliefRevisionEdge[] {
    return this.edges.filter((e) => e.to_belief_id === belief_id);
  }

  /**
   * Beliefs that become suspect/reassess candidates when `belief_id` is invalidated.
   * Walks outbound invalidates|supports dependents once (BFS, no LLM).
   */
  cascadeFromInvalidation(belief_id: string): string[] {
    const affected: string[] = [];
    const seen = new Set<string>([belief_id]);
    const queue = [belief_id];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of this.edgesFrom(current)) {
        if (edge.relation !== "invalidates" && edge.relation !== "supports") continue;
        if (seen.has(edge.to_belief_id)) continue;
        seen.add(edge.to_belief_id);
        affected.push(edge.to_belief_id);
        queue.push(edge.to_belief_id);
      }
    }

    return affected;
  }
}
