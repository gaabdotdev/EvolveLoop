import {
  type Artifact,
  type ArtifactStorePort,
  type EffectRecord,
  type EventLedgerPort,
  type Execution,
  type GoalContract,
  type Task,
  type Work,
  type WorkEvent,
  type WorkEventDraft,
  type WorkRepositoryPort,
} from "../../../src/v4/contracts/index.js";
import {
  DeterministicVerifier,
  MemoryEvidenceStore,
  MemoryProofStore,
  WorkProofBuilder,
  createSequenceIdFactory,
  type ArtifactContentPort,
} from "../../../src/v4/proof/index.js";
import { NOW, VERIFIER_ID, WORK_ID, validWork } from "./fixtures.js";

export class ProofWorld {
  work: Work = validWork();
  goals = new Map<string, GoalContract>();
  artifacts = new Map<string, Artifact>();
  bytes = new Map<string, Uint8Array>();
  executions: Execution[] = [];
  effects: EffectRecord[] = [];
  tasks: Task[] = [];
  events: WorkEvent[] = [];
  evidence = new MemoryEvidenceStore();
  proofs = new MemoryProofStore();
  clock = (): string => NOW;

  seedGoal(goal: GoalContract): void {
    this.goals.set(`${goal.goal_contract_id}@${goal.version}`, goal);
    this.work = { ...this.work, goal_contract_ref: { id: goal.goal_contract_id, version: goal.version }, work_id: goal.work_id };
  }

  putArtifact(artifact: Artifact, bytes?: Uint8Array): void {
    this.artifacts.set(artifact.artifact_id, artifact);
    if (bytes) this.bytes.set(artifact.artifact_id, bytes);
  }

  readonly works: WorkRepositoryPort = {
    getWork: async (work_id) => (this.work.work_id === work_id ? this.work : undefined),
    getGoalContract: async (id, version) => this.goals.get(`${id}@${version}`),
    listTasks: async (work_id) => this.tasks.filter((t) => t.work_id === work_id),
  };

  listArtifacts = async (work_id: string): Promise<Artifact[]> =>
    [...this.artifacts.values()].filter((a) => a.work_id === work_id);

  listExecutions = async (work_id: string): Promise<Execution[]> => this.executions.filter((e) => e.work_id === work_id);

  listEffects = async (work_id: string): Promise<EffectRecord[]> => this.effects.filter((e) => e.work_id === work_id);

  readonly artifactIO: Pick<ArtifactStorePort, "get" | "verify"> & ArtifactContentPort = {
    get: async (id) => this.artifacts.get(id),
    verify: async (ref) => {
      const found = [...this.artifacts.values()].find((a) => a.content.sha256 === ref.sha256);
      if (!found) return "MISSING";
      if (found.integrity_status === "MISMATCH") return "MISMATCH";
      if (found.integrity_status !== "VERIFIED") return "MISSING";
      return "VERIFIED";
    },
    readBytes: async (id) => this.bytes.get(id),
  };

  readonly ledger: EventLedgerPort = {
    append: async (work_id, drafts: WorkEventDraft[], opts) => {
      const existing = this.events.filter((e) => e.work_id === work_id);
      if (opts.expected_head_seq !== existing.length) {
        return { status: "CONFLICT", reason: "EXPECTED_SEQ_MISMATCH", head_seq: existing.length };
      }
      const added: WorkEvent[] = [];
      for (const draft of drafts) {
        const seq = existing.length + added.length + 1;
        const event = { ...draft, seq, recorded_at: NOW } as WorkEvent;
        this.events.push(event);
        added.push(event);
      }
      return { status: "APPENDED", events: added, head_seq: existing.length + added.length };
    },
    read: async (work_id) => this.events.filter((e) => e.work_id === work_id),
    head: async (work_id) => this.events.filter((e) => e.work_id === work_id).length,
  };

  verifier(ids = createSequenceIdFactory("ver")): DeterministicVerifier {
    return new DeterministicVerifier({
      verifier_id: VERIFIER_ID,
      artifacts: this.artifactIO,
      content: this.artifactIO,
      clock: this.clock,
      ids,
    });
  }

  builder(opts: { verifiers?: DeterministicVerifier[]; runVerifiersOnBuild?: boolean; idsTag?: string } = {}): WorkProofBuilder {
    return new WorkProofBuilder({
      works: this.works,
      listArtifacts: this.listArtifacts,
      listExecutions: this.listExecutions,
      listEffects: this.listEffects,
      evidence: this.evidence,
      proofs: this.proofs,
      verifiers: opts.verifiers ?? [this.verifier()],
      ledger: this.ledger,
      now: this.clock,
      ids: createSequenceIdFactory(opts.idsTag ?? "bld"),
      subjectExecutorId: this.executions[0]?.executor_ref.executor_id,
      runVerifiersOnBuild: opts.runVerifiersOnBuild,
    });
  }
}

export function seededWorld(): ProofWorld {
  const world = new ProofWorld();
  world.work = validWork({ work_id: WORK_ID });
  return world;
}
