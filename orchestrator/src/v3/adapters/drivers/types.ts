/**
 * Adapter driver interface — Core may only claim execution a driver actually performs.
 * Missing/blocked drivers must fail closed (never silent success).
 */

import type { AdapterId } from "../types.js";
import type { V3DataPaths } from "../../paths.js";

export type DriverInvokeStatus =
  | "accepted"
  | "blocked"
  | "unsupported"
  | "failed";

export interface AdapterInvokeRequest {
  work_id: string;
  task_id: string;
  agent_id?: string;
  /** Optional IR path when routing through ExecutionEngine / jobs. */
  ir_path?: string;
  provider_mode?: "mock" | "real";
  note?: string;
}

export interface AdapterInvokeResult {
  kind: "AdapterInvokeResult";
  adapter_id: AdapterId;
  status: DriverInvokeStatus;
  code: string;
  message: string;
  /** Present only when a real bridge accepted work (e.g. cursor jobs). */
  bridge_ref?: string;
  limitations: string[];
}

export interface AgentAdapterDriver {
  readonly adapter_id: AdapterId;
  /** True only if Core can start/drive work without pretending. */
  readonly can_invoke: boolean;
  describe(): { adapter_id: AdapterId; can_invoke: boolean; notes: string[] };
  invoke(paths: V3DataPaths, request: AdapterInvokeRequest): Promise<AdapterInvokeResult>;
}
