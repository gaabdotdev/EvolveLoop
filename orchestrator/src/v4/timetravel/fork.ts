/**
 * Fork: new work_id (INV-WORK-05) referencing base history/artifacts.
 * Grants, credentials and leases are not copied (D08). EXTERNAL effects of
 * the base are recorded on the fork as fork_inherited=true via M03
 * cloneAsInherited so decideRetry → FORBIDDEN.
 */

import {
  decideRetry,
  isValidId,
  type AppendOutcome,
  type Checkpoint,
  type EffectRecord,
  type Work,
  type WorkEvent,
  type WorkEventDraft,
} from "../contracts/index.js";
import { allocateId } from "../goal/ids.js";
import { allowlistPayload, draftM01Event, InMemoryWorkRepository } from "../work/index.js";
import { TIMETRAVEL_ERROR, TimeTravelError } from "./errors.js";
import { draftM05Event } from "./events.js";
import { collectArtifactRefs, projectReferencedHistory, verifyArtifactRefs } from "./inspect.js";
import { cloneGoalForFork, hydrateForkRepository, rebuildForkSnapshot } from "./projection.js";
import type { ForkRequest, ForkResult, InheritedEffect, TimeTravelDeps } from "./types.js";
import { projectEvents } from "../ledger/index.js";

function rejectAppend(work_id: string, outcome: AppendOutcome): never {
  if (outcome.status === "INVALID") {
    throw new TimeTravelError(TIMETRAVEL_ERROR.APPEND_FAILED, "fork append failed validation", {
      work_id,
      issues: outcome.validation.issues,
    });
  }
  throw new TimeTravelError(TIMETRAVEL_ERROR.APPEND_FAILED, `fork append ${outcome.status}`, {
    work_id,
    status: outcome.status,
    reason: "reason" in outcome ? outcome.reason : undefined,
  });
}

async function commit(deps: TimeTravelDeps, work_id: string, drafts: WorkEventDraft[], expected_head_seq: number): Promise<WorkEvent[]> {
  const outcome = await deps.ledger.append(work_id, drafts, { expected_head_seq });
  if (outcome.status === "APPENDED") return outcome.events;
  if (outcome.status === "DUPLICATE") return outcome.events;
  rejectAppend(work_id, outcome);
}

function effectIdsFromHistory(events: readonly WorkEvent[], checkpoint: Checkpoint): string[] {
  const ids = new Set<string>();
  for (const row of checkpoint.effect_summary) {
    if (isValidId("effect", row.effect_id)) ids.add(row.effect_id);
  }
  for (const event of events) {
    if (event.type !== "effect.planned" && event.type !== "effect.state_changed") continue;
    const id = event.payload.effect_id;
    if (typeof id === "string" && isValidId("effect", id)) ids.add(id);
  }
  return [...ids];
}

async function inheritExternalEffects(
  deps: TimeTravelDeps,
  sourceIds: string[],
  fork_work_id: string,
): Promise<InheritedEffect[]> {
  const inherited: InheritedEffect[] = [];
  if (!deps.effects) {
    if (sourceIds.length > 0) {
      throw new TimeTravelError(
        TIMETRAVEL_ERROR.EFFECTS_REQUIRED,
        "base effects cannot be marked fork_inherited without M03 EffectLedger.cloneAsInherited",
        { source_effect_ids: sourceIds },
      );
    }
    return inherited;
  }

  for (const source_effect_id of sourceIds) {
    const source = await deps.effects.get(source_effect_id);
    if (!source) continue;
    if (source.effect_class !== "EXTERNAL") continue;
    const clone = await deps.effects.cloneAsInherited(source.effect_id, {
      work_id: fork_work_id,
      effect_id: allocateId("effect"),
      execution_id: allocateId("execution"),
    });
    inherited.push({
      source_effect_id: source.effect_id,
      fork_effect_id: clone.effect_id,
      effect_class: "EXTERNAL",
      fork_inherited: true,
      retry: decideRetry(clone),
    });
  }
  return inherited;
}

export async function forkWork(deps: TimeTravelDeps, request: ForkRequest): Promise<ForkResult> {
  if (!isValidId("work", request.from_work_id)) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.INVALID, "from_work_id failed isValidId", {
      from_work_id: request.from_work_id,
    });
  }
  if (!isValidId("checkpoint", request.checkpoint_id)) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.INVALID, "checkpoint_id failed isValidId", {
      checkpoint_id: request.checkpoint_id,
    });
  }

  const checkpoint = await deps.checkpoints.get(request.checkpoint_id);
  if (!checkpoint) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.NOT_FOUND, "checkpoint not found", {
      checkpoint_id: request.checkpoint_id,
    });
  }
  if (checkpoint.work_id !== request.from_work_id) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.INVALID, "checkpoint does not belong to the base work", {
      checkpoint_id: request.checkpoint_id,
      from_work_id: request.from_work_id,
      checkpoint_work_id: checkpoint.work_id,
    });
  }
  if (checkpoint.consistency === "INCONSISTENT") {
    throw new TimeTravelError(
      TIMETRAVEL_ERROR.CHECKPOINT_INCONSISTENT,
      "refusing to fork from an INCONSISTENT checkpoint",
      { checkpoint_id: checkpoint.checkpoint_id },
    );
  }

  const baseHead = await deps.ledger.head(request.from_work_id);
  if (checkpoint.event_seq > baseHead) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.INVALID, "checkpoint event_seq beyond base head", {
      event_seq: checkpoint.event_seq,
      head_seq: baseHead,
    });
  }

  const baseEvents = await deps.ledger.read(request.from_work_id, { to_seq: checkpoint.event_seq });
  const baseProj = projectReferencedHistory(request.from_work_id, baseEvents);
  if (!baseProj.work) {
    throw new TimeTravelError(
      TIMETRAVEL_ERROR.STRUCT,
      "base work projection missing — need M01 work.created on the referenced history",
      { work_id: request.from_work_id },
    );
  }
  const sourceGoal =
    baseProj.goals.get(baseProj.work.goal_contract_ref.version) ??
    [...baseProj.goals.values()].sort((a, b) => b.version - a.version)[0];
  if (!sourceGoal) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.STRUCT, "base Goal Contract missing from referenced history", {
      goal_contract_ref: baseProj.work.goal_contract_ref,
    });
  }

  const now = (deps.clock ?? (() => new Date().toISOString()))();
  const actor = deps.actor ?? { kind: "PLATFORM" as const, id: "v4-m05-timetravel" };
  const fork_work_id = allocateId("work");
  if (fork_work_id === request.from_work_id) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.FORK_IDENTITY, "a fork must have its own identity (INV-WORK-05)", {
      work_id: fork_work_id,
    });
  }

  const forked_from: NonNullable<Work["forked_from"]> = {
    work_id: request.from_work_id,
    checkpoint_id: checkpoint.checkpoint_id,
    event_seq: checkpoint.event_seq,
  };
  const goal = cloneGoalForFork({ source: sourceGoal, fork_work_id, now, actor });
  const rebuilt = rebuildForkSnapshot({
    baseEvents,
    base_work_id: request.from_work_id,
    fork_work_id,
    forked_from,
    goal,
    now,
  });
  const forkWorkObj = rebuilt.snapshot.work!;

  const ledgerProj = projectEvents(request.from_work_id, baseEvents, checkpoint.event_seq);
  const referenced_artifacts = await verifyArtifactRefs(
    deps.artifacts,
    collectArtifactRefs(checkpoint, ledgerProj),
  );

  const sourceEffectIds = effectIdsFromHistory(baseEvents, checkpoint);
  const inherited_effects = await inheritExternalEffects(deps, sourceEffectIds, fork_work_id);

  const workCreatedPayload = {
    ...allowlistPayload("work.created", { work: forkWorkObj }),
    goal_contract_ref: forkWorkObj.goal_contract_ref,
  };
  const drafts: WorkEventDraft[] = [
    draftM01Event({
      event_id: allocateId("event"),
      work_id: fork_work_id,
      type: "work.created",
      occurred_at: now,
      actor,
      correlation_id: fork_work_id,
      payload: workCreatedPayload,
    }),
    draftM01Event({
      event_id: allocateId("event"),
      work_id: fork_work_id,
      type: "goal_contract.versioned",
      occurred_at: now,
      actor,
      correlation_id: goal.goal_contract_id,
      payload: allowlistPayload("goal_contract.versioned", { goal_contract: goal }),
    }),
  ];
  if (goal.status === "ACCEPTED") {
    drafts.push(
      draftM01Event({
        event_id: allocateId("event"),
        work_id: fork_work_id,
        type: "goal_contract.accepted",
        occurred_at: now,
        actor,
        correlation_id: goal.goal_contract_id,
        payload: allowlistPayload("goal_contract.accepted", {
          goal_contract_id: goal.goal_contract_id,
          version: goal.version,
        }),
      }),
    );
  }
  drafts.push(
    draftM05Event({
      work_id: fork_work_id,
      type: "work.forked",
      occurred_at: now,
      actor,
      correlation_id: fork_work_id,
      payload: {
        fork_work_id,
        forked_from,
        referenced_artifact_hashes: referenced_artifacts.map((a) => a.sha256),
        inherited_effect_ids: inherited_effects.map((e) => e.fork_effect_id),
        grants_inherited: false,
        leases_inherited: false,
        credentials_inherited: false,
        origin_event_seq: checkpoint.event_seq,
      },
    }),
  );

  // No fencing / lease_id on fork drafts (D08).
  for (const d of drafts) {
    if (d.fencing) {
      throw new TimeTravelError(TIMETRAVEL_ERROR.STRUCT, "fork drafts must not inherit leases/fencing", {
        event_id: d.event_id,
      });
    }
  }

  const liveEvents = await commit(deps, fork_work_id, drafts, 0);

  let first_checkpoint: ForkResult["first_checkpoint"];
  let forkHead = liveEvents.at(-1)?.seq ?? 0;
  try {
    const created = await deps.checkpoints.create(fork_work_id, forkHead);
    first_checkpoint = {
      checkpoint: created,
      origin: {
        work_id: request.from_work_id,
        checkpoint_id: checkpoint.checkpoint_id,
        event_seq: checkpoint.event_seq,
      },
    };
    forkHead = await deps.ledger.head(fork_work_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new TimeTravelError(TIMETRAVEL_ERROR.STRUCT, `first fork checkpoint failed: ${message}`, {
      fork_work_id,
      origin_event_seq: checkpoint.event_seq,
    });
  }

  const repository = deps.works ?? new InMemoryWorkRepository();
  const forkLog = await deps.ledger.read(fork_work_id);
  hydrateForkRepository(repository, fork_work_id, forkLog, rebuilt.snapshot);
  const stored = await repository.getWork(fork_work_id);
  if (!stored) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.STRUCT, "fork work missing from repository after hydrate", {
      fork_work_id,
    });
  }
  if (stored.work_id === request.from_work_id) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.FORK_IDENTITY, "a fork must have its own identity (INV-WORK-05)", {
      work_id: stored.work_id,
    });
  }

  const base_head_seq_after = await deps.ledger.head(request.from_work_id);
  if (base_head_seq_after !== baseHead) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.STRUCT, "fork mutated the base event log", {
      base_head_seq: baseHead,
      base_head_seq_after,
    });
  }

  return {
    work: stored,
    forked_from,
    referenced_history: {
      base_work_id: request.from_work_id,
      from_seq: 1,
      to_seq: checkpoint.event_seq,
      copied_as_live_events: false,
    },
    referenced_artifacts,
    inherited_effects,
    first_checkpoint,
    authorization: { grants_copied: false, credentials_copied: false, leases_copied: false },
    work_snapshot: repository.snapshot(fork_work_id),
    base_head_seq_after,
    fork_head_seq: forkHead,
  };
}

/** Confirm a cloned record is still FORBIDDEN to re-dispatch (EXTERNAL). */
export function inheritedRetry(record: Pick<EffectRecord, "state" | "idempotency_key" | "integration" | "authorization" | "fork_inherited" | "effect_class">) {
  return decideRetry(record);
}
