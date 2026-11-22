/**
 * V0-MEM-03 — agents only write PROPOSED; promotion requires an explicit gate.
 * V2-SEC-01 — also refuse VERIFIED/ACTIVE promotion while the item is quarantined.
 */

import type { PromotionGateDecision } from "./types.js";
import {
  assertPromotionNotQuarantined,
  QuarantineError,
  type QuarantineBlockedPromotionStatus,
  type QuarantineStore,
} from "../security/quarantine.js";

export class MemoryPromotionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MemoryPromotionError";
  }
}

const GATE_ACTORS = new Set(["validator", "human", "mso"]);

export interface PromotionGateOptions {
  /** When set with item_id, blocks VERIFIED/ACTIVE while quarantined. */
  quarantine?: QuarantineStore;
  item_id?: string;
  /** Default ACTIVE (MemoryBroker promote path). */
  target_status?: QuarantineBlockedPromotionStatus;
}

/** Fail-closed promotion check — never allow agent self-promotion. */
export function assertPromotionGate(
  gate: PromotionGateDecision,
  opts?: PromotionGateOptions,
): void {
  if (!gate.allow) {
    throw new MemoryPromotionError("GATE_DENIED", gate.reason || "promotion gate denied");
  }
  if (!GATE_ACTORS.has(gate.actor)) {
    throw new MemoryPromotionError(
      "GATE_ACTOR_INVALID",
      `promotion actor must be validator|human|mso, got ${String(gate.actor)}`,
    );
  }
  if (!gate.reason || !gate.reason.trim()) {
    throw new MemoryPromotionError("GATE_REASON_REQUIRED", "promotion gate requires a reason");
  }

  if (opts?.quarantine && opts.item_id) {
    try {
      assertPromotionNotQuarantined(
        opts.quarantine,
        opts.item_id,
        opts.target_status ?? "ACTIVE",
      );
    } catch (err) {
      if (err instanceof QuarantineError) {
        throw new MemoryPromotionError(err.code, err.message);
      }
      throw err;
    }
  }
}

export function promotionGateAllowed(
  actor: PromotionGateDecision["actor"],
  reason: string,
  extras?: Partial<PromotionGateDecision>,
): PromotionGateDecision {
  return {
    allow: true,
    actor,
    reason,
    ...extras,
  };
}
