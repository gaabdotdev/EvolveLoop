/**
 * Work / Goal / Task projections. Mutated only by applying ledger events
 * (INTEGRATION-CONTRACTS: WorkRepositoryPort). Capsule `task_refs` never enter
 * this module (INV-CAP-08). Executor-authored Goal Contract versions are dropped (D15).
 */

import {
  WORK_TRANSITIONS,
  assertConforms,
  isAllowedTransition,
  validateTaskGraph,
  type GoalContract,
  type Task,
  type Work,
  type WorkEvent,
  type WorkState,
} from "../contracts/index.js";
import { parseM01Payload } from "./payloads.js";
import { progressForTaskState } from "./progress.js";

export interface ProjectionIssue {
  code: string;
  event_id: string;
  seq: number;
  message: string;
}

export interface WorkProjection {
  work?: Work;
  goals: Map<number, GoalContract>;
  tasks: Map<string, Task>;
  accepted_version?: number;
}

export function emptyProjection(): WorkProjection {
  return { goals: new Map(), tasks: new Map() };
}

function issue(event: WorkEvent, code: string, message: string): ProjectionIssue {
  return { code, event_id: event.event_id, seq: event.seq, message };
}

export function applyEvent(proj: WorkProjection, event: WorkEvent): ProjectionIssue[] {
  const issues: ProjectionIssue[] = [];
  const parsed = parseM01Payload(event.type, event.payload);
  if (!parsed.ok) {
    return parsed.issues.map((i) => issue(event, i.code, `${i.path}: ${i.message}`));
  }

  switch (parsed.type) {
    case "work.created": {
      if (proj.work) {
        issues.push(issue(event, "INV-WORK-01", "work.created on an existing work is ignored"));
        break;
      }
      const work = { ...parsed.payload.work, last_event_seq: event.seq, owner: "platform" as const };
      const v = assertConforms(work);
      if (!v.valid) {
        issues.push(issue(event, "STRUCT", v.issues.map((i) => i.message).join("; ")));
        break;
      }
      proj.work = work;
      break;
    }
    case "work.state_changed": {
      if (!proj.work) {
        issues.push(issue(event, "STRUCT", "state_changed before work.created"));
        break;
      }
      const { from, to, reason } = parsed.payload;
      if (proj.work.state !== from) {
        issues.push(issue(event, "INV-WORK-STATE", `expected from=${proj.work.state}, got ${from}`));
        break;
      }
      if (!isAllowedTransition(WORK_TRANSITIONS, from, to)) {
        issues.push(issue(event, "INV-WORK-STATE", `illegal transition ${from} → ${to}`));
        break;
      }
      const outcome = parsed.payload.outcome ?? proj.work.outcome;
      if (to === "COMPLETED" && outcome === undefined) {
        issues.push(issue(event, "INV-WORK-04", "COMPLETED requires a WorkProof outcome"));
        break;
      }
      proj.work = {
        ...proj.work,
        state: to,
        state_reason: reason,
        outcome,
        last_event_seq: event.seq,
        updated_at: event.recorded_at,
      };
      break;
    }
    case "goal_contract.versioned": {
      if (event.actor.kind === "EXECUTOR") {
        issues.push(issue(event, "D15_EXECUTOR_CANNOT_VERSION", "executor-authored goal_contract.versioned dropped"));
        break;
      }
      const gc = parsed.payload.goal_contract;
      if (proj.work && gc.work_id !== proj.work.work_id) {
        issues.push(issue(event, "STRUCT", "goal contract work_id mismatch"));
        break;
      }
      proj.goals.set(gc.version, gc);
      if (proj.work) {
        proj.work = {
          ...proj.work,
          goal_contract_ref: { id: gc.goal_contract_id, version: gc.version },
          last_event_seq: event.seq,
          updated_at: event.recorded_at,
        };
      }
      break;
    }
    case "goal_contract.accepted": {
      const gc = proj.goals.get(parsed.payload.version);
      if (!gc || gc.goal_contract_id !== parsed.payload.goal_contract_id) {
        issues.push(issue(event, "STRUCT", "accepted version not in projection"));
        break;
      }
      if (gc.ambiguities.some((a) => a.status === "OPEN" && a.blocking)) {
        issues.push(issue(event, "INV-GC-03", "cannot accept with OPEN blocking ambiguities"));
        break;
      }
      if (!gc.acceptance_criteria.some((c) => c.mandatory)) {
        issues.push(issue(event, "INV-GC-02", "ACCEPTED needs a mandatory criterion"));
        break;
      }
      const accepted: GoalContract = { ...gc, status: "ACCEPTED" };
      const v = assertConforms(accepted);
      if (!v.valid) {
        issues.push(issue(event, "INV-GC-02", v.issues.map((i) => i.message).join("; ")));
        break;
      }
      proj.goals.set(accepted.version, accepted);
      proj.accepted_version = accepted.version;
      if (proj.work) {
        proj.work = {
          ...proj.work,
          goal_contract_ref: { id: accepted.goal_contract_id, version: accepted.version },
          last_event_seq: event.seq,
          updated_at: event.recorded_at,
        };
      }
      break;
    }
    case "task.planned": {
      if (event.actor.kind === "EXECUTOR") {
        issues.push(issue(event, "D15_EXECUTOR_CANNOT_VERSION", "executors cannot plan the authoritative graph"));
        break;
      }
      const task = { ...parsed.payload.task, progress_status: progressForTaskState(parsed.payload.task.state, parsed.payload.task.progress_status) };
      if (task.progress_status === "CONFIRMED" && task.state !== "VERIFIED" && task.state !== "OBSOLETE") {
        issues.push(issue(event, "INV-TASK-04", "CONFIRMED progress is not allowed on planned tasks"));
        break;
      }
      proj.tasks.set(task.task_id, { ...task, updated_at: event.recorded_at });
      const graphIssues = validateTaskGraph([...proj.tasks.values()]);
      if (graphIssues.length > 0) {
        proj.tasks.delete(task.task_id);
        for (const g of graphIssues) issues.push(issue(event, g.code, g.message));
      } else if (proj.work) {
        proj.work = { ...proj.work, last_event_seq: event.seq, updated_at: event.recorded_at };
      }
      break;
    }
    case "task.state_changed": {
      const current = proj.tasks.get(parsed.payload.task_id);
      if (!current) {
        issues.push(issue(event, "STRUCT", `unknown task ${parsed.payload.task_id}`));
        break;
      }
      if (current.state !== parsed.payload.from) {
        issues.push(issue(event, "INV-TASK-STATE", `expected from=${current.state}`));
        break;
      }
      if (parsed.payload.to === "VERIFIED" && event.actor.kind === "EXECUTOR") {
        issues.push(issue(event, "INV-TASK-03", "executors cannot set VERIFIED"));
        break;
      }
      const progress = progressForTaskState(parsed.payload.to, parsed.payload.progress_status);
      const evidence_ids = parsed.payload.evidence_ids ?? current.evidence_ids;
      const next: Task = {
        ...current,
        state: parsed.payload.to,
        progress_status: parsed.payload.to === "VERIFIED" ? "CONFIRMED" : progress,
        evidence_ids,
        updated_at: event.recorded_at,
      };
      const v = assertConforms(next);
      if (!v.valid) {
        issues.push(issue(event, v.issues[0]?.code ?? "STRUCT", v.issues.map((i) => i.message).join("; ")));
        break;
      }
      proj.tasks.set(next.task_id, next);
      if (proj.work) {
        proj.work = { ...proj.work, last_event_seq: event.seq, updated_at: event.recorded_at };
      }
      break;
    }
  }

  if (proj.work && issues.length === 0) {
    proj.work = { ...proj.work, last_event_seq: event.seq };
  }
  return issues;
}

export function applyEvents(proj: WorkProjection, events: readonly WorkEvent[]): ProjectionIssue[] {
  const all: ProjectionIssue[] = [];
  for (const e of events) {
    if (proj.work && e.work_id !== proj.work.work_id) {
      all.push(issue(e, "INV-EVT-01", "event work_id does not match projection"));
      continue;
    }
    all.push(...applyEvent(proj, e));
  }
  return all;
}

export function workStateOf(proj: WorkProjection): WorkState | undefined {
  return proj.work?.state;
}
