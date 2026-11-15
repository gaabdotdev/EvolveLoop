/**
 * Rebuild internal Work/Task/Goal projections for a fork from *referenced*
 * base events (not copied onto the fork log), then overlay live fork events
 * (ADR-V4-0007).
 */

import {
  GOAL_CONTRACT_SCHEMA_VERSION,
  WORK_SCHEMA_VERSION,
  assertConforms,
  type ActorRef,
  type GoalContract,
  type IsoTimestamp,
  type Task,
  type Work,
  type WorkEvent,
} from "../contracts/index.js";
import { InMemoryWorkRepository, M01_EVENT_TYPES, applyEvents, emptyProjection, type WorkSnapshot } from "../work/index.js";
import { TIMETRAVEL_ERROR, TimeTravelError } from "./errors.js";
import { projectReferencedHistory } from "./inspect.js";

function isM01Type(type: string): boolean {
  return (M01_EVENT_TYPES as readonly string[]).includes(type);
}

export function cloneGoalForFork(input: {
  source: GoalContract;
  fork_work_id: string;
  now: IsoTimestamp;
  actor: ActorRef;
}): GoalContract {
  const version = input.source.version + 1;
  const next: GoalContract = {
    ...input.source,
    kind: "GoalContract",
    schema_version: GOAL_CONTRACT_SCHEMA_VERSION,
    work_id: input.fork_work_id,
    version,
    supersedes_version: input.source.version,
    created_at: input.now,
    created_by: input.actor,
  };
  const v = assertConforms(next);
  if (!v.valid) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.STRUCT, "fork Goal Contract failed validateGoalContract", {
      issues: v.issues,
    });
  }
  return next;
}

export function remapTasks(tasks: readonly Task[], fork_work_id: string, goal: GoalContract, now: IsoTimestamp): Task[] {
  return tasks.map((t) => ({
    ...t,
    work_id: fork_work_id,
    goal_contract_ref: { id: goal.goal_contract_id, version: goal.version },
    updated_at: now,
  }));
}

export function forkWorkRecord(input: {
  source: Work;
  fork_work_id: string;
  forked_from: NonNullable<Work["forked_from"]>;
  goal: GoalContract;
  now: IsoTimestamp;
}): Work {
  const work: Work = {
    ...input.source,
    kind: "Work",
    schema_version: WORK_SCHEMA_VERSION,
    work_id: input.fork_work_id,
    owner: "platform",
    forked_from: input.forked_from,
    goal_contract_ref: { id: input.goal.goal_contract_id, version: input.goal.version },
    created_at: input.now,
    updated_at: input.now,
    last_event_seq: 1,
    outcome: undefined,
  };
  if (work.forked_from && work.forked_from.work_id === work.work_id) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.FORK_IDENTITY, "a fork must have its own identity (INV-WORK-05)", {
      work_id: work.work_id,
    });
  }
  const v = assertConforms(work);
  if (!v.valid) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.STRUCT, "fork Work failed validateWork", { issues: v.issues });
  }
  return work;
}

export function rebuildForkSnapshot(input: {
  baseEvents: readonly WorkEvent[];
  base_work_id: string;
  fork_work_id: string;
  forked_from: NonNullable<Work["forked_from"]>;
  goal: GoalContract;
  now: IsoTimestamp;
}): { snapshot: WorkSnapshot; source: Work } {
  const base = projectReferencedHistory(input.base_work_id, input.baseEvents);
  if (!base.work) {
    throw new TimeTravelError(
      TIMETRAVEL_ERROR.STRUCT,
      "base work projection missing — need M01 work.created on the referenced history",
      { work_id: input.base_work_id },
    );
  }
  const work = forkWorkRecord({
    source: base.work,
    fork_work_id: input.fork_work_id,
    forked_from: input.forked_from,
    goal: input.goal,
    now: input.now,
  });
  const tasks = remapTasks([...base.tasks.values()], input.fork_work_id, input.goal, input.now);
  return {
    source: base.work,
    snapshot: {
      work,
      goals: [input.goal],
      tasks,
      accepted_version: input.goal.status === "ACCEPTED" ? input.goal.version : undefined,
    },
  };
}

/** Apply live fork events (M01 types only) then restore remapped tasks. */
export function hydrateForkRepository(
  repository: InMemoryWorkRepository,
  fork_work_id: string,
  liveEvents: readonly WorkEvent[],
  rebuilt: WorkSnapshot,
): void {
  const proj = emptyProjection();
  applyEvents(
    proj,
    liveEvents.filter((e) => e.work_id === fork_work_id && isM01Type(e.type)),
  );
  const live = proj.work
    ? {
        work: { ...proj.work, last_event_seq: liveEvents.at(-1)?.seq ?? proj.work.last_event_seq },
        goals: [...proj.goals.values()].sort((a, b) => a.version - b.version),
        tasks: rebuilt.tasks,
        accepted_version: proj.accepted_version ?? rebuilt.accepted_version,
      }
    : rebuilt;
  if (live.work) {
    live.work = {
      ...live.work,
      forked_from: rebuilt.work?.forked_from ?? live.work.forked_from,
      last_event_seq: liveEvents.at(-1)?.seq ?? live.work.last_event_seq,
    };
  }
  repository.restore(fork_work_id, live);
}
