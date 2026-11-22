/**
 * V2-ORCH-03 — withIdempotency wrapper over IdempotencyStore.
 * Replay completed results; reject in-flight / payload conflicts with typed errors.
 */

import type { IdempotencyRecord, IdempotencyStore } from "./store.js";

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT" as const;
  constructor(
    message: string,
    readonly existing: IdempotencyRecord,
  ) {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export class IdempotencyInFlightError extends Error {
  readonly code = "IDEMPOTENCY_IN_FLIGHT" as const;
  constructor(
    message: string,
    readonly record: IdempotencyRecord,
  ) {
    super(message);
    this.name = "IdempotencyInFlightError";
  }
}

export interface WithIdempotencyOpts {
  work_id: string;
  /** Prefer buildIdempotencyKey({ contract_version, task_id, input_fingerprint }). */
  key: string;
  /** Bound into payload_hash; reuse with a different payload → conflict. */
  payload: unknown;
  operation?: string;
}

export type WithIdempotencyResult<T> =
  | { status: "executed"; result: T; record: IdempotencyRecord }
  | { status: "replay"; result: T; record: IdempotencyRecord };

/**
 * Execute `effect` at most once per (work_id, key, payload).
 * Same key + same payload after commit → replay stored result (effect not called).
 * Same key + different payload → IdempotencyConflictError.
 * Pending claim still open → IdempotencyInFlightError.
 */
export async function withIdempotency<T>(
  store: IdempotencyStore,
  opts: WithIdempotencyOpts,
  effect: () => T | Promise<T>,
): Promise<WithIdempotencyResult<T>> {
  const operation = opts.operation ?? "effect";
  const gate = store.beginOrReplay(opts.work_id, opts.key, operation, opts.payload, {
    claim: true,
  });

  if (gate.status === "conflict") {
    throw new IdempotencyConflictError(gate.reason, gate.existing);
  }
  if (gate.status === "in_flight") {
    throw new IdempotencyInFlightError(
      `idempotency key '${opts.key}' is already in flight`,
      gate.record,
    );
  }
  if (gate.status === "replay") {
    return {
      status: "replay",
      result: gate.record.result as T,
      record: gate.record,
    };
  }

  try {
    const result = await effect();
    const record = store.commit(gate.record, result);
    return { status: "executed", result, record };
  } catch (err) {
    store.abandon(gate.record);
    throw err;
  }
}
