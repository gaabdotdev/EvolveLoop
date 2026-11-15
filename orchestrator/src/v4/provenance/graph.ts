/**
 * ProvenanceGraph — rebuildable read-model answering the four §4.12 questions
 * with verifiable refs anchored to the hash-chained Event Ledger.
 *
 * Composes frozen ports. Does not write Work State. Does not call
 * PolicyDecisionPort.decide or WorkProofPort.build.
 */

import {
  deriveRequirementStatus,
  isIndependent,
  isValidId,
  validateEvidence,
  type Evidence,
  type GoalContract,
  type IsoTimestamp,
  type PolicyDecision,
  type ProvenanceQueryPort,
} from "../contracts/index.js";
import { criterionKey } from "./extract.js";
import { emptyAnswer, isVerifiableRef, okAnswer } from "./refs.js";
import { DECISION_EVENT_TYPES, indexWorkStream, type IndexedEvent, type WorkIndex } from "./stream.js";
import type { FailClosedReason, ProvenanceAnswer, ProvenanceQueryDeps } from "./types.js";

const DEFAULT_NOW: IsoTimestamp = "2026-11-15T12:00:00.000Z";

export class ProvenanceGraph implements ProvenanceQueryPort {
  private readonly deps: ProvenanceQueryDeps;
  private readonly now: () => IsoTimestamp;
  private readonly cache = new Map<string, WorkIndex>();

  constructor(deps: ProvenanceQueryDeps) {
    this.deps = deps;
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  /** Rebuild the index for one work from the live ledger. Safe to call repeatedly. */
  async ingest(work_id: string): Promise<WorkIndex> {
    if (!isValidId("work", work_id)) {
      const empty = indexWorkStream(work_id, []);
      this.cache.set(work_id, empty);
      return empty;
    }
    const events = await this.deps.ledger.read(work_id);
    const index = indexWorkStream(work_id, events);
    this.cache.set(work_id, index);
    return index;
  }

  async decisionOrigin(decision_ref: string): Promise<string[]> {
    return (await this.inspectDecisionOrigin(decision_ref)).refs;
  }

  async artifactAuthors(artifact_id: string): Promise<string[]> {
    return (await this.inspectArtifactAuthors(artifact_id)).refs;
  }

  async evidenceForRequirement(goal_contract_id: string, version: number, criterion_id: string): Promise<string[]> {
    return (await this.inspectEvidenceForRequirement(goal_contract_id, version, criterion_id)).refs;
  }

  async authorizationFor(effect_id: string): Promise<string[]> {
    return (await this.inspectAuthorizationFor(effect_id)).refs;
  }

  async inspectDecisionOrigin(decision_ref: string): Promise<ProvenanceAnswer> {
    if (typeof decision_ref !== "string" || decision_ref.length === 0) {
      return emptyAnswer("invalid_id");
    }
    if (looksLikeChatMemory(decision_ref)) return emptyAnswer("uncorroborated_origin");

    await this.scanKnownWorks();
    const located = await this.locateDecision(decision_ref);
    if (!located) return emptyAnswer("missing_ref");
    if (!located.index.trusted) return emptyAnswer(located.index.closed ?? "chain_broken");

    const { item, index } = located;
    const refs: unknown[] = [item.event.event_id];
    if (typeof item.event.causation_id === "string" && index.byEventId.has(item.event.causation_id)) {
      refs.push(item.event.causation_id);
    }
    refs.push(...item.extracted.decision_ids);
    refs.push(...item.extracted.policy_ids);
    refs.push(...item.extracted.grant_ids);
    refs.push(...item.extracted.approval_ids);

    const supply = await this.verifiedSupplyPins(item);
    if (item.extracted.supply_artifact_ids.length > 0 && supply.length === 0) {
      return emptyAnswer("unpinned_supply_chain");
    }
    refs.push(...supply);

    return okAnswer(refs);
  }

  async inspectArtifactAuthors(artifact_id: string): Promise<ProvenanceAnswer> {
    if (!isValidId("artifact", artifact_id)) return emptyAnswer("invalid_id");

    const artifact = await this.deps.artifacts.get(artifact_id);
    if (!artifact) return emptyAnswer("missing_ref");
    if (artifact.integrity_status !== "VERIFIED") return emptyAnswer("artifact_integrity");

    const integrity = await this.deps.artifacts.verify(artifact.content);
    if (integrity !== "VERIFIED") {
      return emptyAnswer(integrity === "MISMATCH" ? "hash_mismatch" : "artifact_integrity");
    }

    const index = await this.ingest(artifact.work_id);
    if (!index.trusted) return emptyAnswer(index.closed ?? "chain_broken");

    const registered = (index.byArtifactId.get(artifact_id) ?? []).filter((item) => item.event.type === "artifact.registered");
    if (registered.length === 0) return emptyAnswer("decision_not_in_ledger");

    const refs: unknown[] = [];
    for (const item of registered) {
      if (item.extracted.content_sha256 && item.extracted.content_sha256 !== artifact.content.sha256) {
        return emptyAnswer("hash_mismatch");
      }
      refs.push(item.event.event_id);

      const originExecutor = artifact.origin.executor_ref?.executor_id;
      const actorIsExecutor = item.event.actor.kind === "EXECUTOR" && isValidId("executor", item.event.actor.id);

      if (originExecutor) {
        if (!isValidId("executor", originExecutor)) return emptyAnswer("invalid_id");
        if (!actorIsExecutor || item.event.actor.id !== originExecutor) {
          return emptyAnswer("uncorroborated_origin");
        }
        refs.push(originExecutor);
      } else if (actorIsExecutor) {
        refs.push(item.event.actor.id);
      }

      const supply = await this.verifiedSupplyPins(item);
      if (item.extracted.supply_artifact_ids.length > 0 && supply.length === 0) {
        return emptyAnswer("unpinned_supply_chain");
      }
      refs.push(...supply);
    }

    return okAnswer(refs);
  }

  async inspectEvidenceForRequirement(
    goal_contract_id: string,
    version: number,
    criterion_id: string,
  ): Promise<ProvenanceAnswer> {
    if (!isValidId("goal_contract", goal_contract_id)) return emptyAnswer("invalid_id");
    if (!Number.isInteger(version) || version < 1) return emptyAnswer("invalid_id");
    if (typeof criterion_id !== "string" || criterion_id.length === 0) return emptyAnswer("invalid_id");

    const goal = this.deps.works ? await this.deps.works.getGoalContract(goal_contract_id, version) : undefined;
    if (!goal) return emptyAnswer("missing_ref");
    if (goal.goal_contract_id !== goal_contract_id || goal.version !== version) {
      return emptyAnswer("wrong_goal_contract_version");
    }
    const criterion = goal.acceptance_criteria.find((c) => c.criterion_id === criterion_id);
    if (!criterion) return emptyAnswer("missing_ref");

    const index = await this.ingest(goal.work_id);
    if (!index.trusted) return emptyAnswer(index.closed ?? "chain_broken");

    const candidates = await this.candidateEvidence(goal, criterion_id, index);
    if (candidates.selfReportedOnly && candidates.evidence.length === 0) {
      return emptyAnswer("self_reported_as_independent");
    }
    if (candidates.evidence.length === 0) {
      return emptyAnswer(candidates.closed ?? "requirement_not_proved");
    }

    const currentHashes = await this.currentArtifactHashes(goal.work_id);
    const derivation = deriveRequirementStatus(criterion, candidates.evidence, {
      goal_contract_ref: { id: goal_contract_id, version },
      now: this.now() || DEFAULT_NOW,
      current_artifact_hashes: currentHashes,
    });

    const proving = derivation.qualifying_evidence_ids.filter((id) => {
      const ev = candidates.evidence.find((e) => e.evidence_id === id);
      return ev?.result === "PASS" && isIndependent(ev);
    });
    if (proving.length === 0) {
      if (candidates.selfReportedAttempt) return emptyAnswer("self_reported_as_independent");
      return emptyAnswer("requirement_not_proved");
    }

    const refs: unknown[] = [...proving];
    for (const id of proving) {
      for (const item of index.byEvidenceId.get(id) ?? []) {
        if (item.event.type === "evidence.recorded") refs.push(item.event.event_id);
      }
    }
    const proof = await this.deps.proofs?.latestForWork?.(goal.work_id);
    if (proof && proof.goal_contract_ref.id === goal_contract_id && proof.goal_contract_ref.version === version) {
      const req = proof.requirements.find((r) => r.criterion_id === criterion_id);
      if (req && proving.every((id) => req.evidence_ids.includes(id))) {
        refs.push(proof.proof_id);
        for (const item of index.byProofId.get(proof.proof_id) ?? []) {
          if (item.event.type === "proof.issued") refs.push(item.event.event_id);
        }
      }
    }
    return okAnswer(refs);
  }

  async inspectAuthorizationFor(effect_id: string): Promise<ProvenanceAnswer> {
    if (!isValidId("effect", effect_id)) return emptyAnswer("invalid_id");

    const effect = await this.deps.effects.get(effect_id);
    if (!effect) return emptyAnswer("missing_ref");

    const index = await this.ingest(effect.work_id);
    if (!index.trusted) return emptyAnswer(index.closed ?? "chain_broken");

    const effectEvents = index.byEffectId.get(effect_id) ?? [];
    if (effectEvents.length === 0) return emptyAnswer("decision_not_in_ledger");

    const auth = effect.authorization;
    if (!auth) return emptyAnswer("missing_ref");
    if (!isValidId("policy_decision", auth.policy_decision_id)) return emptyAnswer("invalid_id");

    const decisionItems = (index.byDecisionId.get(auth.policy_decision_id) ?? []).filter(
      (item) => item.event.type === "policy.decided",
    );
    if (decisionItems.length === 0) return emptyAnswer("decision_not_in_ledger");

    const recorded = await this.deps.policy?.getDecision?.(auth.policy_decision_id);
    if (recorded && recorded.request.work_id !== effect.work_id) {
      return emptyAnswer("uncorroborated_origin");
    }
    if (recorded && recorded.decision_id !== auth.policy_decision_id) {
      return emptyAnswer("uncorroborated_origin");
    }

    let effectDecision: PolicyDecision["decision"] | undefined = recorded?.decision;
    for (const item of decisionItems) {
      if (item.extracted.policy_effect) effectDecision = item.extracted.policy_effect;
    }
    if (effectDecision === "DENY") return emptyAnswer("deny_cannot_authorize");
    if (!effectDecision) return emptyAnswer("decision_not_in_ledger");

    if (effect.fork_inherited && effect.effect_class === "EXTERNAL") {
      const planned = effectEvents.find((item) => item.event.type === "effect.planned");
      const plannedSeq = planned?.event.seq ?? 0;
      const fresh = decisionItems.some((item) => item.event.seq > plannedSeq);
      if (!fresh) return emptyAnswer("decision_not_in_ledger");
    }

    const refs: unknown[] = [auth.policy_decision_id];
    for (const item of decisionItems) {
      refs.push(item.event.event_id);
      refs.push(...item.extracted.policy_ids);
    }
    for (const item of effectEvents) {
      refs.push(item.event.event_id);
    }

    if (effectDecision === "REQUIRE_APPROVAL") {
      const approvalItems = this.approvalEventsFor(index, auth);
      const approved = approvalItems.filter((item) => item.extracted.approval_state === "APPROVED");
      if (approved.length === 0) return emptyAnswer("approval_missing");
      for (const item of approved) {
        refs.push(item.event.event_id);
        refs.push(...item.extracted.approval_ids);
        refs.push(...item.extracted.grant_ids);
      }
      if (auth.approval_id) refs.push(auth.approval_id);
    } else if (auth.approval_id) {
      refs.push(auth.approval_id);
      for (const item of index.byApprovalId.get(auth.approval_id) ?? []) {
        refs.push(item.event.event_id);
        refs.push(...item.extracted.grant_ids);
      }
    }

    return okAnswer(refs);
  }

  private approvalEventsFor(
    index: WorkIndex,
    auth: { policy_decision_id: string; approval_id?: string },
  ): IndexedEvent[] {
    const fromDecision = (index.byDecisionId.get(auth.policy_decision_id) ?? []).filter(
      (item) => item.event.type === "approval.decided",
    );
    if (!auth.approval_id) return fromDecision;
    const fromId = (index.byApprovalId.get(auth.approval_id) ?? []).filter((item) => item.event.type === "approval.decided");
    const seen = new Set<string>();
    const out: IndexedEvent[] = [];
    for (const item of [...fromDecision, ...fromId]) {
      if (seen.has(item.event.event_id)) continue;
      seen.add(item.event.event_id);
      out.push(item);
    }
    return out;
  }

  private async locateDecision(
    decision_ref: string,
  ): Promise<{ item: IndexedEvent; index: WorkIndex } | undefined> {
    const fromCache = this.findDecisionInCache(decision_ref);
    if (fromCache) return fromCache;

    if (isValidId("event", decision_ref) || isValidId("policy_decision", decision_ref) || isVerifiableRef(decision_ref)) {
      await this.scanKnownWorks();
      return this.findDecisionInCache(decision_ref);
    }
    return undefined;
  }

  private findDecisionInCache(decision_ref: string): { item: IndexedEvent; index: WorkIndex } | undefined {
    for (const index of this.cache.values()) {
      const byEvent = index.byEventId.get(decision_ref);
      if (byEvent) return { item: byEvent, index };
      const byDecision = index.byDecisionId.get(decision_ref);
      if (byDecision && byDecision.length > 0) {
        const preferred =
          byDecision.find((item) => DECISION_EVENT_TYPES.has(item.event.type)) ?? byDecision[0];
        if (preferred) return { item: preferred, index };
      }
      const byGrant = index.byGrantId.get(decision_ref);
      if (byGrant && byGrant.length > 0) return { item: byGrant[0]!, index };
      const byApproval = index.byApprovalId.get(decision_ref);
      if (byApproval && byApproval.length > 0) return { item: byApproval[0]!, index };
    }
    return undefined;
  }

  private async scanKnownWorks(): Promise<void> {
    if (!this.deps.listWorkIds) return;
    const ids = await Promise.resolve(this.deps.listWorkIds());
    for (const id of ids) {
      await this.ingest(id);
    }
  }

  private async verifiedSupplyPins(item: IndexedEvent): Promise<string[]> {
    const verified: string[] = [];
    for (const id of item.extracted.supply_artifact_ids) {
      const art = await this.deps.artifacts.get(id);
      if (!art || art.integrity_status !== "VERIFIED") continue;
      const status = await this.deps.artifacts.verify(art.content);
      if (status !== "VERIFIED") continue;
      verified.push(id);
    }
    return verified;
  }

  private async currentArtifactHashes(work_id: string): Promise<Set<string> | undefined> {
    const listed = await this.deps.artifactList?.listByWork?.(work_id);
    if (!listed) return undefined;
    const hashes = new Set<string>();
    for (const art of listed) {
      if (art.integrity_status !== "VERIFIED") continue;
      const status = await this.deps.artifacts.verify(art.content);
      if (status === "VERIFIED") hashes.add(art.content.sha256);
    }
    return hashes;
  }

  private async candidateEvidence(
    goal: GoalContract,
    criterion_id: string,
    index: WorkIndex,
  ): Promise<{ evidence: Evidence[]; selfReportedOnly: boolean; selfReportedAttempt: boolean; closed: FailClosedReason | null }> {
    const byId = new Map<string, Evidence>();
    let selfReportedAttempt = false;
    let closed: FailClosedReason | null = null;

    const stored = (await this.deps.evidence?.listByWork?.(goal.work_id)) ?? [];
    for (const ev of stored) byId.set(ev.evidence_id, ev);

    const key = criterionKey(goal.goal_contract_id, goal.version, criterion_id);
    const fromIndex = [...(index.byCriterion.get(key) ?? []), ...(index.events.filter((i) => i.extracted.criterion_id === criterion_id))];
    for (const item of fromIndex) {
      for (const id of item.extracted.evidence_ids) {
        if (byId.has(id)) continue;
        const loaded = await this.deps.evidence?.get(id);
        if (loaded) byId.set(id, loaded);
      }
      if (item.extracted.method_kind === "SELF_REPORTED") selfReportedAttempt = true;
    }

    const evidence: Evidence[] = [];
    let independentCount = 0;
    let selfReportedCount = 0;

    for (const ev of byId.values()) {
      const report = validateEvidence(ev);
      if (!report.valid) {
        closed = "hash_mismatch";
        continue;
      }
      const ref = ev.criterion_ref;
      if (!ref || ref.criterion_id !== criterion_id) continue;
      if (ref.goal_contract_id !== goal.goal_contract_id || ref.goal_contract_version !== goal.version) {
        closed = "wrong_goal_contract_version";
        continue;
      }
      if (ev.method.kind === "SELF_REPORTED" || ev.provenance === "SELF_REPORTED") {
        selfReportedAttempt = true;
        selfReportedCount += 1;
        continue;
      }
      if (!isIndependent(ev)) {
        selfReportedAttempt = true;
        selfReportedCount += 1;
        continue;
      }
      const anchored = (index.byEvidenceId.get(ev.evidence_id) ?? []).some((i) => i.event.type === "evidence.recorded");
      if (!anchored) {
        closed = "decision_not_in_ledger";
        continue;
      }
      const hashesOk = await this.evidenceArtifactsOk(ev);
      if (!hashesOk) {
        closed = "hash_mismatch";
        continue;
      }
      evidence.push(ev);
      independentCount += 1;
    }

    return {
      evidence,
      selfReportedOnly: selfReportedCount > 0 && independentCount === 0,
      selfReportedAttempt,
      closed,
    };
  }

  private async evidenceArtifactsOk(ev: Evidence): Promise<boolean> {
    for (const ref of ev.tested_artifacts) {
      const status = await this.deps.artifacts.verify(ref);
      if (status !== "VERIFIED") return false;
    }
    return true;
  }
}

function looksLikeChatMemory(ref: string): boolean {
  if (ref.startsWith("chat:") || ref.startsWith("memory:") || ref.startsWith("conversation:")) return true;
  if (/\s/.test(ref)) return true;
  return false;
}
