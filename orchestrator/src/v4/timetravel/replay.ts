/**
 * Replay of a recorded step: RECORDED (reuse captured I/O) or REEXECUTE
 * (new executor call). External side effects are never auto-reapplied.
 * REEXECUTE that needs EXTERNAL creates a new EffectRecord with a new id
 * and fresh authorization (ADR-V4-0007). No absolute determinism claim (§14).
 */

import { decideRetry, isValidId, type AppendOutcome, type EffectRecord, type WorkEventDraft } from "../contracts/index.js";
import { allocateId } from "../goal/ids.js";
import { REPLAY_DETERMINISM_CLAIM, REPLAY_IS_ABSOLUTE_DETERMINISM } from "./guarantees.js";
import { TIMETRAVEL_ERROR, TimeTravelError } from "./errors.js";
import { draftM05Event } from "./events.js";
import type { CapturedIO, ReplayRequest, ReplayResult, TimeTravelDeps } from "./types.js";

void REPLAY_IS_ABSOLUTE_DETERMINISM;

function capturedFrom(record: EffectRecord): CapturedIO {
  return {
    effect_id: record.effect_id,
    effect_class: record.effect_class,
    intent: { ...record.intent },
    state: record.state,
    evidence_ids: [...record.evidence_ids],
    recorded_at: record.updated_at,
  };
}

async function appendReplayStarted(
  deps: TimeTravelDeps,
  work_id: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const now = (deps.clock ?? (() => new Date().toISOString()))();
  const actor = deps.actor ?? { kind: "PLATFORM" as const, id: "v4-m05-timetravel" };
  const draft: WorkEventDraft = draftM05Event({
    work_id,
    type: "replay.started",
    occurred_at: now,
    actor,
    correlation_id: work_id,
    payload,
  });
  const head = await deps.ledger.head(work_id);
  const outcome: AppendOutcome = await deps.ledger.append(work_id, [draft], { expected_head_seq: head });
  if (outcome.status === "APPENDED" || outcome.status === "DUPLICATE") {
    return outcome.events.find((e) => e.event_id === draft.event_id)?.event_id ?? draft.event_id;
  }
  throw new TimeTravelError(TIMETRAVEL_ERROR.APPEND_FAILED, `replay.started append ${outcome.status}`, {
    work_id,
    status: outcome.status,
  });
}

async function planFreshExternal(
  deps: TimeTravelDeps,
  source: EffectRecord,
  request: ReplayRequest,
): Promise<EffectRecord> {
  if (!deps.effects) {
    throw new TimeTravelError(
      TIMETRAVEL_ERROR.EFFECTS_REQUIRED,
      "REEXECUTE of EXTERNAL requires M03 EffectLedger",
      { effect_id: source.effect_id },
    );
  }
  if (!request.authorization) {
    throw new TimeTravelError(
      TIMETRAVEL_ERROR.AUTHORIZATION_REQUIRED,
      "REEXECUTE of EXTERNAL requires a new authorization (D08); inherited grants/decisions are not reused",
      { source_effect_id: source.effect_id },
    );
  }
  if (source.authorization && request.authorization.policy_decision_id === source.authorization.policy_decision_id) {
    throw new TimeTravelError(
      TIMETRAVEL_ERROR.AUTHORIZATION_REQUIRED,
      "REEXECUTE must not reuse the inherited policy_decision_id",
      { policy_decision_id: request.authorization.policy_decision_id },
    );
  }

  const planned = await deps.effects.plan({
    kind: "EffectRecord",
    schema_version: source.schema_version,
    tenant_id: source.tenant_id,
    effect_id: allocateId("effect"),
    work_id: request.work_id,
    task_id: source.task_id,
    execution_id: allocateId("execution"),
    executor_ref: { ...source.executor_ref },
    effect_class: "EXTERNAL",
    intent: { ...source.intent },
    integration: {
      integration_id: source.integration.integration_id,
      capabilities: { ...source.integration.capabilities },
    },
    authorization: request.authorization,
    idempotency_key: `${source.idempotency_key ?? source.effect_id}:reexecute:${allocateId("event")}`,
    fork_inherited: false,
  });

  const authorized = await deps.effects.authorize(planned.effect_id, request.authorization, {
    expected_state: "PLANNED",
  });
  // Never beginDispatch — side effects are not auto-applied.
  const decision = decideRetry(authorized);
  if (decision.action === "DISPATCH_ALLOWED") {
    // Authorization exists so dispatch *could* happen later; this replay did not send it.
    return authorized;
  }
  return authorized;
}

export async function replayStep(deps: TimeTravelDeps, request: ReplayRequest): Promise<ReplayResult> {
  if (!isValidId("work", request.work_id)) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.INVALID, "work_id failed isValidId", { work_id: request.work_id });
  }
  if (!isValidId("effect", request.effect_id)) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.INVALID, "effect_id failed isValidId", { effect_id: request.effect_id });
  }
  if (request.mode !== "RECORDED" && request.mode !== "REEXECUTE") {
    throw new TimeTravelError(TIMETRAVEL_ERROR.INVALID, "replay mode must be RECORDED or REEXECUTE", {
      mode: request.mode,
    });
  }
  if (!deps.effects) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.EFFECTS_REQUIRED, "replay requires M03 EffectLedger", {
      effect_id: request.effect_id,
    });
  }

  const source = await deps.effects.get(request.effect_id);
  if (!source) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.NOT_FOUND, "effect not found", { effect_id: request.effect_id });
  }
  if (source.work_id !== request.work_id) {
    throw new TimeTravelError(TIMETRAVEL_ERROR.INVALID, "effect does not belong to this work", {
      effect_id: request.effect_id,
      work_id: request.work_id,
      effect_work_id: source.work_id,
    });
  }

  const captured = capturedFrom(source);

  if (request.mode === "RECORDED") {
    const replay_event_id = await appendReplayStarted(deps, request.work_id, {
      mode: "RECORDED",
      source_effect_id: source.effect_id,
      auto_reapplied_external: false,
      determinism_claim: REPLAY_DETERMINISM_CLAIM,
      effect_class: source.effect_class,
    });
    return {
      mode: "RECORDED",
      work_id: request.work_id,
      source_effect_id: source.effect_id,
      captured,
      auto_reapplied_external: false,
      determinism_claim: REPLAY_DETERMINISM_CLAIM,
      replay_event_id,
    };
  }

  // REEXECUTE
  if (source.effect_class === "EXTERNAL") {
    if (source.fork_inherited) {
      const blocked = decideRetry(source);
      if (blocked.action !== "FORBIDDEN") {
        throw new TimeTravelError(
          TIMETRAVEL_ERROR.REPLAY_FORBIDDEN,
          "fork_inherited EXTERNAL must be FORBIDDEN to re-dispatch",
          { retry: blocked },
        );
      }
    }
    const created = await planFreshExternal(deps, source, request);
    const replay_event_id = await appendReplayStarted(deps, request.work_id, {
      mode: "REEXECUTE",
      source_effect_id: source.effect_id,
      new_effect_id: created.effect_id,
      auto_reapplied_external: false,
      determinism_claim: REPLAY_DETERMINISM_CLAIM,
      effect_class: "EXTERNAL",
    });
    return {
      mode: "REEXECUTE",
      work_id: request.work_id,
      source_effect_id: source.effect_id,
      captured,
      auto_reapplied_external: false,
      determinism_claim: REPLAY_DETERMINISM_CLAIM,
      new_effect: created,
      replay_event_id,
    };
  }

  let internal_reexecution: ReplayResult["internal_reexecution"] = { status: "NEED_EXECUTOR" };
  if (request.reexecuteInternal) {
    internal_reexecution = await request.reexecuteInternal(captured);
  }
  const replay_event_id = await appendReplayStarted(deps, request.work_id, {
    mode: "REEXECUTE",
    source_effect_id: source.effect_id,
    auto_reapplied_external: false,
    determinism_claim: REPLAY_DETERMINISM_CLAIM,
    effect_class: "INTERNAL",
  });
  return {
    mode: "REEXECUTE",
    work_id: request.work_id,
    source_effect_id: source.effect_id,
    captured,
    auto_reapplied_external: false,
    determinism_claim: REPLAY_DETERMINISM_CLAIM,
    internal_reexecution,
    replay_event_id,
  };
}
