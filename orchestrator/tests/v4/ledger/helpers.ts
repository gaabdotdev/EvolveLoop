import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { V37LeaseFencingPort } from "../../../src/v4/contracts/adapters-v37.js";
import { DEFAULT_TENANT_ID } from "../../../src/v4/contracts/common.js";
import type { WorkEventDraft } from "../../../src/v4/contracts/ports.js";
import { computePayloadDigest, WORK_EVENT_SCHEMA_VERSION } from "../../../src/v4/contracts/work-event.js";
import { openM02, type M02Runtime } from "../../../src/v4/ledger/index.js";

export const WORK = "work_abc123def";
export const GOAL = "goal_abc123def";
export const TASK = "task_abc123def";
export const EFFECT = "eff_abc123def";
export const NOW = "2026-11-15T12:00:00.000Z";

export function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "v4-m02-"));
}

export function runtime(opts?: { root?: string; leases?: V37LeaseFencingPort }): { root: string; rt: M02Runtime } {
  const root = opts?.root ?? tempRoot();
  const rt = openM02({ root, clock: () => NOW, leases: opts?.leases });
  return { root, rt };
}

export function draft(
  type: string,
  payload: Record<string, unknown>,
  extra: Partial<WorkEventDraft> = {},
): WorkEventDraft {
  const { payload: _p, payload_digest: digestOverride, ...rest } = extra;
  void _p;
  const body: WorkEventDraft = {
    kind: "WorkEvent",
    schema_version: WORK_EVENT_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    event_id: `evt_${randomUUID()}`,
    work_id: WORK,
    type,
    type_version: 1,
    occurred_at: NOW,
    actor: { kind: "PLATFORM", id: "m02-test" },
    correlation_id: "corr-test",
    payload,
    payload_digest: digestOverride ?? computePayloadDigest(payload),
    prev_event_digest: "GENESIS",
    event_digest: "0".repeat(64),
    ...rest,
  };
  if (!digestOverride) body.payload_digest = computePayloadDigest(body.payload);
  return body;
}

export function workCreated(): WorkEventDraft {
  return draft("work.created", { goal_contract_ref: { id: GOAL, version: 1 } });
}

export function fakeLeases(lease: {
  lease_id: string;
  fencing_epoch: number;
  status: "active" | "expired" | "revoked" | "released";
}): V37LeaseFencingPort {
  const rec = lease;
  return {
    get: (id: string) => (id === rec.lease_id ? rec : undefined),
    issue: () => {
      throw new Error("unused");
    },
    renew: () => {
      throw new Error("unused");
    },
    revoke: () => {
      throw new Error("unused");
    },
    release: () => {
      throw new Error("unused");
    },
  } as unknown as V37LeaseFencingPort;
}
