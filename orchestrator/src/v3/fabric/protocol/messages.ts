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
