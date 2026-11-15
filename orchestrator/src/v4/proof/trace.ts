/**
 * Explicit Goal → requirement → artifact → execution → validation → evidence links
 * (constitution §4.11 / §8.1). Derived from stored objects; not an extra trust field.
 */

import type { Artifact, Evidence, Execution, ProofStatus, WorkProof } from "../contracts/index.js";

export interface ProofLink {
  criterion_id: string;
  status: ProofStatus;
  mandatory: boolean;
  artifacts: { artifact_id: string; sha256: string; execution_id?: string }[];
  execution_ids: string[];
  validations: { evidence_id: string; method: string; result: string; evidence_kind: string }[];
  evidence_ids: string[];
  gaps: string[];
}

export interface ProofTrace {
  work_id: string;
  goal_contract_id: string;
  goal_contract_version: number;
  final_status: ProofStatus;
  links: ProofLink[];
}

export function traceProof(input: {
  proof: WorkProof;
  evidence: readonly Evidence[];
  artifacts: readonly Artifact[];
  executions: readonly Execution[];
}): ProofTrace {
  const byHash = new Map<string, Artifact>();
  for (const a of input.artifacts) byHash.set(a.content.sha256, a);
  const evidenceById = new Map(input.evidence.map((e) => [e.evidence_id, e]));
  const executionIds = new Set(input.executions.map((e) => e.execution_id));

  const links: ProofLink[] = input.proof.requirements.map((req) => {
    const validations = req.evidence_ids
      .map((id) => evidenceById.get(id))
      .filter((e): e is Evidence => e !== undefined)
      .map((e) => ({
        evidence_id: e.evidence_id,
        method: e.method.kind,
        result: e.result,
        evidence_kind: e.evidence_kind,
      }));
    const hashes = new Set<string>();
    for (const id of req.evidence_ids) {
      const e = evidenceById.get(id);
      if (!e) continue;
      for (const a of e.tested_artifacts) hashes.add(a.sha256);
    }
    const artifacts = [...hashes].flatMap((sha) => {
      const art = byHash.get(sha);
      if (!art) return [];
      return [{ artifact_id: art.artifact_id, sha256: sha, execution_id: art.origin.execution_id }];
    });
    const fromArtifacts = artifacts.map((a) => a.execution_id).filter((id): id is string => !!id && executionIds.has(id));
    const fromProof = input.proof.execution_ids.filter((id) => executionIds.has(id));
    return {
      criterion_id: req.criterion_id,
      status: req.status,
      mandatory: req.mandatory,
      artifacts,
      execution_ids: [...new Set([...fromArtifacts, ...fromProof])],
      validations,
      evidence_ids: [...req.evidence_ids],
      gaps: [...req.gaps],
    };
  });

  return {
    work_id: input.proof.work_id,
    goal_contract_id: input.proof.goal_contract_ref.id,
    goal_contract_version: input.proof.goal_contract_ref.version,
    final_status: input.proof.final_status,
    links,
  };
}
