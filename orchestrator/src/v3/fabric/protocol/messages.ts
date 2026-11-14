/**
 * Versioned remote protocol message envelopes.
 */

import { randomUUID } from "node:crypto";
import type { ProtocolChannel } from "../types.js";
import { FABRIC_PROTOCOL_VERSION } from "../types.js";

export interface ProtocolEnvelope<T = unknown> {
  protocol_version: typeof FABRIC_PROTOCOL_VERSION;
  channel: ProtocolChannel;
  type: string;
  request_id: string;
  correlation_id: string;
  seq?: number;
  ack_of?: string;
  deadline_at?: string;
  worker_node_id?: string;
  payload: T;
  issued_at: string;
}

export function envelope<T>(
  channel: ProtocolChannel,
  type: string,
  payload: T,
  opts?: Partial<ProtocolEnvelope<T>>,
): ProtocolEnvelope<T> {
  return {
    protocol_version: FABRIC_PROTOCOL_VERSION,
    channel,
    type,
    request_id: opts?.request_id ?? randomUUID(),
    correlation_id: opts?.correlation_id ?? randomUUID(),
    seq: opts?.seq,
    ack_of: opts?.ack_of,
    deadline_at: opts?.deadline_at,
    worker_node_id: opts?.worker_node_id,
    payload,
    issued_at: new Date().toISOString(),
  };
}

export function assertProtocolVersion(v: string): void {
  if (v !== FABRIC_PROTOCOL_VERSION) {
    throw new Error(`protocol_version_mismatch:got=${v}`);
  }
}

export function assertProtocolEnvelope(value: unknown): asserts value is ProtocolEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_envelope:object_required");
  }
  const msg = value as Record<string, unknown>;
  assertProtocolVersion(String(msg.protocol_version ?? ""));
  if (!(["control", "task", "telemetry", "artifact", "health"] as unknown[]).includes(msg.channel)) {
    throw new Error("invalid_envelope:channel");
  }
  if (typeof msg.type !== "string" || msg.type.length < 1 || msg.type.length > 128) {
    throw new Error("invalid_envelope:type");
  }
  if (typeof msg.request_id !== "string" || msg.request_id.length < 1 || msg.request_id.length > 128) {
    throw new Error("invalid_envelope:request_id");
  }
  if (typeof msg.correlation_id !== "string" || msg.correlation_id.length < 1 || msg.correlation_id.length > 128) {
    throw new Error("invalid_envelope:correlation_id");
  }
  if (typeof msg.issued_at !== "string" || !Number.isFinite(Date.parse(msg.issued_at))) {
    throw new Error("invalid_envelope:issued_at");
  }
  if (msg.deadline_at !== undefined && (typeof msg.deadline_at !== "string" || !Number.isFinite(Date.parse(msg.deadline_at)))) {
    throw new Error("invalid_envelope:deadline_at");
  }
  if (msg.seq !== undefined && (!Number.isSafeInteger(msg.seq) || Number(msg.seq) < 0)) {
    throw new Error("invalid_envelope:seq");
  }
  if (!Object.prototype.hasOwnProperty.call(msg, "payload")) {
    throw new Error("invalid_envelope:payload_missing");
  }
}
