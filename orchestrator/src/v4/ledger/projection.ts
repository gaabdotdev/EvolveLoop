/**
 * Derived projection of a per-work event stream (ADR-V4-0003).
 *
 * The log is authoritative. This fold is rebuildable and must never advance
 * past the last durable event. Experimental `x.mNN.*` events do not mutate
 * the projection. Payload F12 names are not CONTROL (R2): we never copy
 * `next_action` / `objective` / `permissions` into workflow state.
 */

import {
  isRecord,
  isSha256,
  isValidId,
  sha256Canonical,
  type Sha256Hex,
} from "../contracts/common.js";
import { OPEN_EFFECT_STATES, type EffectState, EFFECT_STATES } from "../contracts/effect.js";
import type { ContentRef } from "../contracts/common.js";
import type { WorkEvent } from "../contracts/work-event.js";
import { isExperimentalEventType } from "./payloads.js";

export interface ProjectedTask {
  task_id: string;
  state: string;
}

export interface ProjectedEffect {
  effect_id: string;
  state: EffectState;
}

export interface LedgerProjection {
  work_id: string;
  event_seq: number;
  goal_contract_ref?: { id: string; version: number };
  work_state?: string;
  task_states: ProjectedTask[];
  effect_summary: ProjectedEffect[];
  artifact_refs: ContentRef[];
}

export function emptyProjection(work_id: string): LedgerProjection {
  return {
    work_id,
    event_seq: 0,
    task_states: [],
    effect_summary: [],
    artifact_refs: [],
  };
}

export function computeStateDigest(projection: LedgerProjection): Sha256Hex {
  return sha256Canonical({
    work_id: projection.work_id,
    event_seq: projection.event_seq,
    goal_contract_ref: projection.goal_contract_ref ?? null,
    work_state: projection.work_state ?? null,
    task_states: projection.task_states,
    effect_summary: projection.effect_summary,
    artifact_refs: projection.artifact_refs,
  });
}

function upsertTask(state: LedgerProjection, task_id: string, taskState: string): void {
  const i = state.task_states.findIndex((t) => t.task_id === task_id);
  if (i >= 0) state.task_states[i] = { task_id, state: taskState };
  else state.task_states.push({ task_id, state: taskState });
}

function upsertEffect(state: LedgerProjection, effect_id: string, effectState: EffectState): void {
  const i = state.effect_summary.findIndex((e) => e.effect_id === effect_id);
  if (i >= 0) state.effect_summary[i] = { effect_id, state: effectState };
  else state.effect_summary.push({ effect_id, state: effectState });
}

function addArtifact(state: LedgerProjection, sha256: string, size_bytes?: number, media_type?: string): void {
  if (state.artifact_refs.some((a) => a.sha256 === sha256)) return;
  const ref: ContentRef = { sha256 };
  if (size_bytes !== undefined) ref.size_bytes = size_bytes;
  if (media_type !== undefined) ref.media_type = media_type;
  state.artifact_refs.push(ref);
}

function asEffectState(value: unknown): EffectState | undefined {
  return typeof value === "string" && (EFFECT_STATES as readonly string[]).includes(value) ? (value as EffectState) : undefined;
}

/**
 * Fold one event. Returns the same object (mutated). Experimental events are
 * skipped on purpose so `x.m02.*` cannot rewrite work/task/effect/artifact state.
 */
export function applyEvent(state: LedgerProjection, event: WorkEvent): LedgerProjection {
  state.event_seq = event.seq;
  if (isExperimentalEventType(event.type)) return state;

  const payload = event.payload;
  switch (event.type) {
    case "work.created": {
      state.work_state = "CREATED";
      const g = payload.goal_contract_ref;
      if (isRecord(g) && isValidId("goal_contract", g.id) && typeof g.version === "number" && Number.isInteger(g.version) && g.version >= 1) {
        state.goal_contract_ref = { id: g.id, version: g.version };
      }
      break;
    }
    case "work.state_changed": {
      if (typeof payload.state === "string") state.work_state = payload.state;
      break;
    }
    case "goal_contract.versioned":
    case "goal_contract.accepted": {
      const id = typeof payload.goal_contract_id === "string" ? payload.goal_contract_id : isRecord(payload.goal_contract_ref) ? payload.goal_contract_ref.id : undefined;
      const version = typeof payload.version === "number" ? payload.version : isRecord(payload.goal_contract_ref) ? payload.goal_contract_ref.version : undefined;
      if (isValidId("goal_contract", id) && typeof version === "number" && Number.isInteger(version) && version >= 1) {
        state.goal_contract_ref = { id, version };
      }
      break;
    }
    case "task.planned":
    case "task.state_changed": {
      const task_id = payload.task_id;
      const taskState = payload.state;
      if (isValidId("task", task_id) && typeof taskState === "string") upsertTask(state, task_id, taskState);
      break;
    }
    case "effect.planned":
    case "effect.state_changed": {
      const effect_id = payload.effect_id;
      const effectState = asEffectState(payload.state) ?? (event.type === "effect.planned" ? "PLANNED" : undefined);
      if (isValidId("effect", effect_id) && effectState) upsertEffect(state, effect_id, effectState);
      break;
    }
    case "artifact.registered": {
      const content = payload.content;
      if (isRecord(content) && isSha256(content.sha256)) {
        addArtifact(
          state,
          content.sha256,
          typeof content.size_bytes === "number" ? content.size_bytes : undefined,
          typeof content.media_type === "string" ? content.media_type : undefined,
        );
      } else if (isSha256(payload.sha256)) {
        addArtifact(state, payload.sha256);
      }
      break;
    }
    default:
      break;
  }
  return state;
}

export function projectEvents(work_id: string, events: readonly WorkEvent[], throughSeq?: number): LedgerProjection {
  const state = emptyProjection(work_id);
  for (const event of events) {
    if (throughSeq !== undefined && event.seq > throughSeq) break;
    applyEvent(state, event);
  }
  return state;
}

export function openEffectIds(projection: LedgerProjection): string[] {
  return projection.effect_summary
    .filter((e) => (OPEN_EFFECT_STATES as readonly string[]).includes(e.state))
    .map((e) => e.effect_id);
}

export function cloneProjection(p: LedgerProjection): LedgerProjection {
  return {
    work_id: p.work_id,
    event_seq: p.event_seq,
    goal_contract_ref: p.goal_contract_ref ? { ...p.goal_contract_ref } : undefined,
    work_state: p.work_state,
    task_states: p.task_states.map((t) => ({ ...t })),
    effect_summary: p.effect_summary.map((e) => ({ ...e })),
    artifact_refs: p.artifact_refs.map((a) => ({ ...a })),
  };
}
