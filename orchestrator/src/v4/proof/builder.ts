/**
 * WorkProof builder (M06). Synthesises Goal → requirement → artifact → execution →
 * validation → evidence using frozen `deriveRequirementStatus` / `deriveFinalStatus`.
 *
 * Honesty: never promotes PARTIAL/UNVERIFIED to PROVEN from opinion, absence of
 * errors, or executor self-declaration (constitution §8.3, ADR-V4-0009).
 */

import {
  DEFAULT_TENANT_ID,
  EVIDENCE_SCHEMA_VERSION,
  WORK_PROOF_SCHEMA_VERSION,
  assertConforms,
  deriveFinalStatus,
  deriveRequirementStatus,
  isIndependent,
  isValidId,
  scanForSecrets,
  validateEvidence,
  validateWorkProof,
  type Artifact,
  type EffectRecord,
  type EventLedgerPort,
  type Evidence,
  type Execution,
  type ExecutorRef,
  type GoalContract,
  type IsoTimestamp,
  type RequirementProof,
  type Task,
  type ProvenanceQueryPort,
  type VerifierPort,
  type WorkEventDraft,
  type WorkProof,
  type WorkProofPort,
  type WorkRepositoryPort,
} from "../contracts/index.js";
import {
  AUTHZ_STANDING_LIMITATIONS,
  applyProofCaps,
  assessExternalAuthorization,
  generatedByEqualsSubject,
  provenanceBackedEvidenceIds,
  GENERATED_BY_EQUALS_SUBJECT_GAP,
  type AuthzPorts,
} from "./authz.js";
import { PROOF_BUILDER_ID, PROOF_ENGINE_VERSION } from "./constants.js";
import {
  AmbiguousSubjectExecutor,
  GoalContractNotFound,
  InvalidEvidenceError,
  ProofValidationError,
  SelfVerificationRefused,
  WorkNotFound,
} from "./errors.js";
import { evidenceRecordedDraft, proofIssuedDraft } from "./events.js";
import { createRandomIdFactory, type IdFactory } from "./ids.js";
import { rejectProofPoison } from "./honesty-guards.js";
import { assertIndependentVerifier, cannotQualify } from "./independence.js";
import type { EvidenceStore, ProofStore } from "./stores.js";

export interface ProofSources {
  works: WorkRepositoryPort;
  listArtifacts(work_id: string): Promise<Artifact[]>;
  listExecutions(work_id: string): Promise<Execution[]>;
  listEffects(work_id: string): Promise<EffectRecord[]>;
}

export interface WorkProofBuilderDeps extends ProofSources {
  evidence: EvidenceStore;
  proofs: ProofStore;
  verifiers?: VerifierPort[];
  ledger?: EventLedgerPort;
  now?: () => IsoTimestamp;
  ids?: IdFactory;
  builderId?: string;
  builderVersion?: string;
  tenantId?: string;
  /** Pin the judged executor when the work has more than one. */
  subjectExecutorId?: string;
  /** When true (default), run independent verifiers during `build`. */
  runVerifiersOnBuild?: boolean;
  /**
   * Optional M11 compose. Unwired → honest limitation, never a fake PASS.
   * Empty `authorizationFor` / `evidenceForRequirement` refs fail closed.
   */
  provenance?: Partial<Pick<ProvenanceQueryPort, "authorizationFor" | "evidenceForRequirement">>;
}

export class WorkProofBuilder implements WorkProofPort {
  private readonly works: WorkRepositoryPort;
  private readonly listArtifacts: (work_id: string) => Promise<Artifact[]>;
  private readonly listExecutions: (work_id: string) => Promise<Execution[]>;
  private readonly listEffects: (work_id: string) => Promise<EffectRecord[]>;
  private readonly evidence: EvidenceStore;
  private readonly proofs: ProofStore;
  private readonly verifiers: VerifierPort[];
  private readonly ledger?: EventLedgerPort;
  private readonly now: () => IsoTimestamp;
  private readonly ids: IdFactory;
  private readonly builderId: string;
  private readonly builderVersion: string;
  private readonly tenantId: string;
  private readonly pinnedSubject?: string;
  private readonly runVerifiersOnBuild: boolean;
  private readonly provenance?: Partial<Pick<ProvenanceQueryPort, "authorizationFor" | "evidenceForRequirement">>;

  constructor(deps: WorkProofBuilderDeps) {
    this.works = deps.works;
    this.listArtifacts = deps.listArtifacts;
    this.listExecutions = deps.listExecutions;
    this.listEffects = deps.listEffects;
    this.evidence = deps.evidence;
    this.proofs = deps.proofs;
    this.verifiers = deps.verifiers ?? [];
    this.ledger = deps.ledger;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.ids = deps.ids ?? createRandomIdFactory();
    this.builderId = deps.builderId ?? PROOF_BUILDER_ID;
    this.builderVersion = deps.builderVersion ?? PROOF_ENGINE_VERSION;
    this.tenantId = deps.tenantId ?? DEFAULT_TENANT_ID;
    this.pinnedSubject = deps.subjectExecutorId;
    this.runVerifiersOnBuild = deps.runVerifiersOnBuild ?? true;
    this.provenance = deps.provenance;
  }

  async build(work_id: string): Promise<WorkProof> {
    if (!isValidId("work", work_id)) {
      throw new WorkNotFound(work_id);
    }
    const work = await this.works.getWork(work_id);
    if (!work) throw new WorkNotFound(work_id);

    const goal = await this.works.getGoalContract(work.goal_contract_ref.id, work.goal_contract_ref.version);
    if (!goal) throw new GoalContractNotFound(work.goal_contract_ref.id, work.goal_contract_ref.version);

    const [artifacts, executions, effects, tasks] = await Promise.all([
      this.listArtifacts(work_id),
      this.listExecutions(work_id),
      this.listEffects(work_id),
      this.works.listTasks(work_id),
    ]);

    const limitations: string[] = [
      "V4.0 WorkProof-min does not execute HUMAN_REVIEW or INDEPENDENT_MODEL_REVIEW",
      "secret scan is heuristic defence-in-depth, not proof of absence (INV-PROOF-06)",
      "final_status is derived by deriveFinalStatus; generated_by is not a trust label",
      ...AUTHZ_STANDING_LIMITATIONS,
    ];

    const subjectId = this.resolveSubject(work_id, executions);
    if (this.runVerifiersOnBuild && this.verifiers.length > 0 && subjectId) {
      await this.runVerifiers(work_id, goal, artifacts, subjectId, limitations);
    } else if (this.runVerifiersOnBuild && this.verifiers.length > 0 && !subjectId) {
      limitations.push("no subject executor resolved; live verifiers skipped");
    }

    this.rejectExecutorClaims(executions, limitations);

    const recorded = await this.evidence.listByWork(work_id);
    const hashes = new Set(artifacts.map((a) => a.content.sha256));
    const ctx = {
      goal_contract_ref: { id: goal.goal_contract_id, version: goal.version },
      now: this.now(),
      current_artifact_hashes: hashes,
    };

    const requirements: RequirementProof[] = [];
    for (const criterion of goal.acceptance_criteria) {
      const derived = deriveRequirementStatus(criterion, recorded, ctx);
      const independentIds = derived.qualifying_evidence_ids.filter((id) => {
        const ev = recorded.find((row) => row.evidence_id === id);
        if (!ev) return false;
        if (!isIndependent(ev)) return false;
        if (subjectId && ev.produced_by.executor_id === subjectId) return false;
        return true;
      });
      const evidencePort = this.provenance?.evidenceForRequirement
        ? { evidenceForRequirement: this.provenance.evidenceForRequirement }
        : undefined;
      const provenanceGate = await provenanceBackedEvidenceIds(
        evidencePort,
        goal.goal_contract_id,
        goal.version,
        criterion.criterion_id,
        independentIds,
      );
      const evidence_ids = provenanceGate.ids;
      const gaps = [...derived.gaps];
      if (evidencePort && provenanceGate.empty_port) {
        gaps.push(`empty_evidenceForRequirement:${criterion.criterion_id}`);
      } else if (evidencePort && independentIds.some((id) => !evidence_ids.includes(id))) {
        gaps.push(`provenance_unconfirmed:${criterion.criterion_id}`);
      }
      let status = derived.status;
      if (evidencePort && evidence_ids.length === 0 && derived.status === "PROVEN") {
        status = "UNVERIFIED";
        if (!gaps.includes("no_qualifying_pass")) gaps.push("no_qualifying_pass");
      } else if (evidencePort && evidence_ids.length < independentIds.length && status === "PROVEN") {
        status = "PARTIAL";
      }
      requirements.push({
        criterion_id: criterion.criterion_id,
        mandatory: criterion.mandatory,
        status,
        evidence_ids,
        gaps,
      });
    }

    const authzPorts: AuthzPorts = {
      authorization: this.provenance?.authorizationFor
        ? { authorizationFor: this.provenance.authorizationFor }
        : undefined,
      ledger: this.ledger,
    };
    const authz = await assessExternalAuthorization(work_id, effects, authzPorts);
    limitations.push(...authz.limitations);

    const capGaps: string[] = [...authz.gaps];
    if (generatedByEqualsSubject(this.builderId, subjectId)) {
      capGaps.push(GENERATED_BY_EQUALS_SUBJECT_GAP);
      limitations.push(
        `RR-W5-05: generated_by.verifier_id equals subject executor ${subjectId}; proof cannot be PROVEN`,
      );
    }

    const cappedRequirements = applyProofCaps(requirements, capGaps);
    const effectSnapshot = effects.map((e) => ({ effect_id: e.effect_id, state: e.state }));
    const final_status = deriveFinalStatus(cappedRequirements, effectSnapshot);

    const previous = await this.proofs.latest(work_id);
    const execution_ids = unique([
      ...executions.map((e) => e.execution_id),
      ...artifacts.map((a) => a.origin.execution_id).filter((id): id is string => !!id),
      ...taskExecutionIds(tasks),
    ]);

    const proof: WorkProof = {
      kind: "WorkProof",
      schema_version: WORK_PROOF_SCHEMA_VERSION,
      tenant_id: this.tenantId,
      proof_id: this.ids.proof(),
      work_id,
      goal_contract_ref: { id: goal.goal_contract_id, version: goal.version },
      requirements: cappedRequirements,
      artifact_ids: artifacts.map((a) => a.artifact_id),
      execution_ids,
      effects: effectSnapshot,
      provenance_refs: unique([...cappedRequirements.flatMap((r) => r.evidence_ids), ...authz.refs]),
      limitations,
      final_status,
      generated_by: { verifier_id: this.builderId, verifier_version: this.builderVersion },
      generated_at: ctx.now,
      ...(previous ? { supersedes_proof_id: previous.proof_id } : {}),
    };

    rejectProofPoison(proof, "proof");
    const secrets = scanForSecrets(proof);
    if (secrets.length > 0) {
      throw new ProofValidationError(`WorkProof contains possible secrets at ${secrets.map((s) => s.path).join(", ")}`);
    }
    const validated = validateWorkProof(proof);
    if (!validated.valid) {
      throw new ProofValidationError(validated.issues.map((i) => `${i.code}:${i.path}:${i.message}`).join("; "));
    }
    const conforms = assertConforms(proof);
    if (!conforms.valid) {
      throw new ProofValidationError(conforms.issues.map((i) => `${i.code}:${i.path}:${i.message}`).join("; "));
    }

    await this.proofs.put(proof);
    await this.emitProofIssued(proof);
    return proof;
  }

  /**
   * Persist independently produced evidence. Rejects invalid objects and refuses
   * to treat self-judgement as qualifying (it may still be stored as SELF_REPORTED
   * via `recordSelfReport`).
   */
  async recordEvidence(evidence: Evidence): Promise<Evidence> {
    rejectProofPoison(evidence, "evidence");
    const result = validateEvidence(evidence);
    if (!result.valid) {
      throw new InvalidEvidenceError(result.issues.map((i) => `${i.code}:${i.path}:${i.message}`).join("; "));
    }
    const conforms = assertConforms(evidence);
    if (!conforms.valid) {
      throw new InvalidEvidenceError(conforms.issues.map((i) => `${i.code}:${i.path}:${i.message}`).join("; "));
    }
    await this.evidence.put(evidence);
    await this.emitEvidenceRecorded(evidence);
    return evidence;
  }

  /** Executor self-assessment: recorded for audit, never independent, never PROVEN. */
  async recordSelfReport(input: {
    work_id: string;
    goal_contract: GoalContract;
    criterion_id: string;
    subject_executor: ExecutorRef;
    summary: string;
    tested_artifacts?: Evidence["tested_artifacts"];
    evidence_kind?: string;
  }): Promise<Evidence> {
    const evidence: Evidence = {
      kind: "Evidence",
      schema_version: EVIDENCE_SCHEMA_VERSION,
      tenant_id: this.tenantId,
      evidence_id: this.ids.evidence(),
      work_id: input.work_id,
      subject: { kind: "CRITERION", ref: input.criterion_id },
      criterion_ref: {
        goal_contract_id: input.goal_contract.goal_contract_id,
        goal_contract_version: input.goal_contract.version,
        criterion_id: input.criterion_id,
      },
      evidence_kind: input.evidence_kind ?? "self_assessment",
      method: { kind: "SELF_REPORTED", description: input.summary },
      result: "PASS",
      produced_by: input.subject_executor,
      subject_executor_ref: input.subject_executor,
      tested_artifacts: input.tested_artifacts ?? [],
      environment: { runtime: "executor-self-report" },
      provenance: "SELF_REPORTED",
      observed_at: this.now(),
      limitations: ["self-declaration; does not qualify as independent evidence (ADR-V4-0009)"],
    };
    if (isIndependent(evidence)) {
      throw new SelfVerificationRefused(input.subject_executor.executor_id, input.subject_executor.executor_id);
    }
    return this.recordEvidence(evidence);
  }

  private resolveSubject(work_id: string, executions: Execution[]): string | undefined {
    if (this.pinnedSubject) return this.pinnedSubject;
    const ids = [...new Set(executions.map((e) => e.executor_ref.executor_id))];
    if (ids.length === 1) return ids[0];
    if (ids.length === 0) return undefined;
    throw new AmbiguousSubjectExecutor(work_id);
  }

  private async runVerifiers(
    work_id: string,
    goal: GoalContract,
    artifacts: Artifact[],
    subject_executor_id: string,
    limitations: string[],
  ): Promise<void> {
    for (const verifier of this.verifiers) {
      try {
        assertIndependentVerifier(verifier.verifier_id, subject_executor_id);
      } catch (err) {
        if (err instanceof SelfVerificationRefused) {
          limitations.push(`refused self-verifier ${verifier.verifier_id}`);
          continue;
        }
        throw err;
      }
      for (const criterion of goal.acceptance_criteria) {
        const produced = await verifier.verify({
          work_id,
          goal_contract: goal,
          criterion_id: criterion.criterion_id,
          artifacts,
          subject_executor_id,
        });
        for (const ev of produced) {
          if (cannotQualify(ev) || ev.produced_by.executor_id === subject_executor_id) {
            limitations.push(`dropped non-independent verifier output ${ev.evidence_id}`);
            continue;
          }
          const check = validateEvidence(ev);
          if (!check.valid) {
            limitations.push(`dropped invalid verifier evidence: ${check.issues[0]?.message ?? "invalid"}`);
            continue;
          }
          await this.recordEvidence(ev);
        }
      }
    }
  }

  private rejectExecutorClaims(executions: Execution[], limitations: string[]): void {
    for (const ex of executions) {
      if (ex.result_claim) {
        limitations.push(
          `ignored executor result_claim on ${ex.execution_id} (${ex.result_claim.claimed_status}); self-claims are not proof`,
        );
      }
    }
  }

  private async emitEvidenceRecorded(evidence: Evidence): Promise<void> {
    if (!this.ledger) return;
    const prev = await prevDigest(this.ledger, evidence.work_id);
    const draft = evidenceRecordedDraft({
      event_id: this.ids.event(),
      work_id: evidence.work_id,
      occurred_at: this.now(),
      actor: { kind: "VERIFIER", id: this.builderId },
      correlation_id: evidence.work_id,
      prev_event_digest: prev,
      payload: {
        evidence_id: evidence.evidence_id,
        work_id: evidence.work_id,
        criterion_id: evidence.criterion_ref?.criterion_id,
        evidence_kind: evidence.evidence_kind,
        method_kind: evidence.method.kind,
        result: evidence.result,
      },
    });
    await appendDraft(this.ledger, evidence.work_id, draft);
  }

  private async emitProofIssued(proof: WorkProof): Promise<void> {
    if (!this.ledger) return;
    const prev = await prevDigest(this.ledger, proof.work_id);
    const draft = proofIssuedDraft({
      event_id: this.ids.event(),
      work_id: proof.work_id,
      occurred_at: this.now(),
      actor: { kind: "VERIFIER", id: this.builderId },
      correlation_id: proof.work_id,
      prev_event_digest: prev,
      payload: {
        proof_id: proof.proof_id,
        work_id: proof.work_id,
        final_status: proof.final_status,
        goal_contract_id: proof.goal_contract_ref.id,
        goal_contract_version: proof.goal_contract_ref.version,
      },
    });
    await appendDraft(this.ledger, proof.work_id, draft);
  }
}

async function appendDraft(ledger: EventLedgerPort, work_id: string, draft: WorkEventDraft): Promise<void> {
  const outcome = await ledger.append(work_id, [draft], { expected_head_seq: await ledger.head(work_id) });
  if (outcome.status === "INVALID" || outcome.status === "CONFLICT" || outcome.status === "FENCED") {
    throw new ProofValidationError(`ledger rejected ${draft.type}: ${outcome.status}`);
  }
}

async function prevDigest(ledger: EventLedgerPort, work_id: string): Promise<"GENESIS" | string> {
  const events = await ledger.read(work_id);
  if (events.length === 0) return "GENESIS";
  return events[events.length - 1]!.event_digest;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

function taskExecutionIds(tasks: Task[]): string[] {
  return tasks.flatMap((t) => t.execution_ids);
}
