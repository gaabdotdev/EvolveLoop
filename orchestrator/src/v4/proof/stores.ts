/**
 * In-memory evidence/proof stores for V4.0 WorkProof-min.
 * Proofs are immutable (INV-PROOF-05): duplicate proof_id is refused.
 */

import type { Evidence, WorkProof } from "../contracts/index.js";
import { ImmutableProofError, InvalidEvidenceError } from "./errors.js";

export interface EvidenceStore {
  put(evidence: Evidence): Promise<void>;
  get(evidence_id: string): Promise<Evidence | undefined>;
  listByWork(work_id: string): Promise<Evidence[]>;
}

export interface ProofStore {
  put(proof: WorkProof): Promise<void>;
  get(proof_id: string): Promise<WorkProof | undefined>;
  listByWork(work_id: string): Promise<WorkProof[]>;
  latest(work_id: string): Promise<WorkProof | undefined>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryEvidenceStore implements EvidenceStore {
  private readonly byId = new Map<string, Evidence>();
  private readonly byWork = new Map<string, string[]>();

  async put(evidence: Evidence): Promise<void> {
    if (this.byId.has(evidence.evidence_id)) {
      throw new InvalidEvidenceError(`evidence ${evidence.evidence_id} already recorded (immutable)`);
    }
    this.byId.set(evidence.evidence_id, clone(evidence));
    const list = this.byWork.get(evidence.work_id) ?? [];
    list.push(evidence.evidence_id);
    this.byWork.set(evidence.work_id, list);
  }

  async get(evidence_id: string): Promise<Evidence | undefined> {
    const found = this.byId.get(evidence_id);
    return found ? clone(found) : undefined;
  }

  async listByWork(work_id: string): Promise<Evidence[]> {
    const ids = this.byWork.get(work_id) ?? [];
    return ids.map((id) => clone(this.byId.get(id)!));
  }
}

export class MemoryProofStore implements ProofStore {
  private readonly byId = new Map<string, WorkProof>();
  private readonly byWork = new Map<string, string[]>();

  async put(proof: WorkProof): Promise<void> {
    if (this.byId.has(proof.proof_id)) {
      throw new ImmutableProofError(proof.proof_id);
    }
    this.byId.set(proof.proof_id, Object.freeze(clone(proof)));
    const list = this.byWork.get(proof.work_id) ?? [];
    list.push(proof.proof_id);
    this.byWork.set(proof.work_id, list);
  }

  async get(proof_id: string): Promise<WorkProof | undefined> {
    const found = this.byId.get(proof_id);
    return found ? clone(found) : undefined;
  }

  async listByWork(work_id: string): Promise<WorkProof[]> {
    const ids = this.byWork.get(work_id) ?? [];
    return ids.map((id) => clone(this.byId.get(id)!));
  }

  async latest(work_id: string): Promise<WorkProof | undefined> {
    const ids = this.byWork.get(work_id) ?? [];
    const last = ids[ids.length - 1];
    return last ? this.get(last) : undefined;
  }
}
