/**
 * Isolation EventLedgerPort for M01 before M19 composition.
 *
 * NOT the Event Ledger (M02). No crash durability, no fencing (R7 — caller-supplied
 * epochs are ignored), hash chain is tamper-evidence not non-repudiation (R1).
 * M19 must inject M02's implementation.
 */

import {
  computeEventDigest,
  computePayloadDigest,
  validateWorkEvent,
  type AppendOutcome,
  type EventLedgerPort,
  type IsoTimestamp,
  type WorkEvent,
  type WorkEventDraft,
} from "../contracts/index.js";

export type IsolatedClock = () => IsoTimestamp;

export class IsolatedEventBuffer implements EventLedgerPort {
  private readonly streams = new Map<string, WorkEvent[]>();

  constructor(private readonly clock: IsolatedClock) {}

  async append(work_id: string, drafts: WorkEventDraft[], opts: { expected_head_seq: number }): Promise<AppendOutcome> {
    const current = this.streams.get(work_id) ?? [];
    const head = current.length;
    if (opts.expected_head_seq !== head) {
      return { status: "CONFLICT", reason: "EXPECTED_SEQ_MISMATCH", head_seq: head };
    }
    if (drafts.length === 0) {
      return { status: "APPENDED", events: [], head_seq: head };
    }

    const existingById = new Map(current.map((e) => [e.event_id, e]));
    const allDup = drafts.every((d) => {
      const prior = existingById.get(d.event_id);
      return prior !== undefined && prior.payload_digest === computePayloadDigest(d.payload);
    });
    if (allDup && drafts.every((d) => existingById.has(d.event_id))) {
      return { status: "DUPLICATE", events: current, head_seq: head };
    }
    for (const d of drafts) {
      const prior = existingById.get(d.event_id);
      if (prior && prior.payload_digest !== computePayloadDigest(d.payload)) {
        return { status: "CONFLICT", reason: "EVENT_ID_REUSED_WITH_DIFFERENT_PAYLOAD", head_seq: head };
      }
    }

    const recorded_at = this.clock();
    const events: WorkEvent[] = [];
    let prev = current.length === 0 ? ("GENESIS" as const) : current[current.length - 1]!.event_digest;
    for (let i = 0; i < drafts.length; i++) {
      const draft = drafts[i]!;
      if (draft.work_id !== work_id) {
        return {
          status: "INVALID",
          validation: { valid: false, issues: [{ code: "INV-EVT-01", path: "work_id", message: "draft work_id mismatch" }] },
          head_seq: head,
        };
      }
      const { fencing: _ignoredFencing, seq: _s, recorded_at: _r, event_digest: _d, ...rest } = draft as WorkEventDraft & {
        fencing?: unknown;
        seq?: number;
        recorded_at?: string;
      };
      void _ignoredFencing;
      void _s;
      void _r;
      void _d;
      const body: Omit<WorkEvent, "event_digest"> = {
        ...rest,
        work_id,
        seq: head + i + 1,
        recorded_at,
        payload_digest: computePayloadDigest(draft.payload),
        prev_event_digest: prev,
      };
      const event: WorkEvent = { ...body, event_digest: computeEventDigest(body) };
      const validation = validateWorkEvent(event);
      if (!validation.valid) return { status: "INVALID", validation, head_seq: head };
      events.push(event);
      prev = event.event_digest;
    }

    this.streams.set(work_id, [...current, ...events]);
    return { status: "APPENDED", events, head_seq: head + events.length };
  }

  async read(work_id: string, opts?: { from_seq?: number; to_seq?: number }): Promise<WorkEvent[]> {
    const all = this.streams.get(work_id) ?? [];
    return all.filter((e) => {
      if (opts?.from_seq !== undefined && e.seq < opts.from_seq) return false;
      if (opts?.to_seq !== undefined && e.seq > opts.to_seq) return false;
      return true;
    });
  }

  async head(work_id: string): Promise<number> {
    return this.streams.get(work_id)?.length ?? 0;
  }
}
