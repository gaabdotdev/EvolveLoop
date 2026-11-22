/**
 * V2-SEC-01 — Quarentena automática para memória/ação derivada de contexto tainted.
 * Promotion to VERIFIED/ACTIVE blocked until independent review releases the item.
 */

import type { TaintSource, TrackedValue } from "./taint.js";
import { isTainted } from "./taint.js";

export type QuarantineItemKind = "memory" | "action";

export type QuarantineStatus = "QUARANTINED" | "RELEASED";

/** Promotion targets blocked while an item remains quarantined. */
export type QuarantineBlockedPromotionStatus = "VERIFIED" | "ACTIVE";

export const QUARANTINE_BLOCKED_PROMOTION_STATUSES: readonly QuarantineBlockedPromotionStatus[] = [
  "VERIFIED",
  "ACTIVE",
] as const;

export interface QuarantineItem {
  kind: "QuarantineItem";
  item_id: string;
  item_kind: QuarantineItemKind;
  status: QuarantineStatus;
  /** Agent (or writer) that produced the tainted-derived item — cannot self-release. */
  source_agent_id: string;
  taint_sources: TaintSource[];
  reason: string;
  quarantined_at: string;
  released_at?: string;
  reviewer_id?: string;
}

export interface QuarantineFromTaintInput {
  item_id: string;
  item_kind: QuarantineItemKind;
  source_agent_id: string;
  /** Tracked / taint-marked value that the item derives from. */
  tracked: TrackedValue | { tainted?: boolean; sources?: TaintSource[] } | null | undefined;
  reason?: string;
}

export interface ReleaseAfterReviewInput {
  reviewer_id: string;
  item_id: string;
}

export class QuarantineError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "QuarantineError";
  }
}

function nowIso(clock?: () => Date): string {
  return (clock?.() ?? new Date()).toISOString();
}

function collectSources(
  tracked: TrackedValue | { tainted?: boolean; sources?: TaintSource[] } | null | undefined,
): TaintSource[] {
  if (!tracked || !("sources" in tracked) || !Array.isArray(tracked.sources)) {
    return isTainted(tracked) ? ["untrusted_input"] : [];
  }
  return [...new Set(tracked.sources)];
}

/**
 * In-memory quarantine ledger for tainted-derived memory_id / action_id items.
 */
export class QuarantineStore {
  private readonly items = new Map<string, QuarantineItem>();
  private readonly clock: () => Date;

  constructor(opts?: { clock?: () => Date }) {
    this.clock = opts?.clock ?? (() => new Date());
  }

  /**
   * If `tracked` is tainted, place the item in QUARANTINED (idempotent while still quarantined).
   * Returns null when inputs are clean (no quarantine).
   */
  quarantineFromTaint(input: QuarantineFromTaintInput): QuarantineItem | null {
    if (!input.item_id?.trim()) {
      throw new QuarantineError("ITEM_ID_REQUIRED", "quarantine requires item_id");
    }
    if (!input.source_agent_id?.trim()) {
      throw new QuarantineError("SOURCE_AGENT_REQUIRED", "quarantine requires source_agent_id");
    }
    if (!isTainted(input.tracked)) {
      return null;
    }

    const existing = this.items.get(input.item_id);
    if (existing && existing.status === "QUARANTINED") {
      return { ...existing, taint_sources: [...existing.taint_sources] };
    }

    const item: QuarantineItem = {
      kind: "QuarantineItem",
      item_id: input.item_id.trim(),
      item_kind: input.item_kind,
      status: "QUARANTINED",
      source_agent_id: input.source_agent_id.trim(),
      taint_sources: collectSources(input.tracked),
      reason: input.reason?.trim() || "derived_from_tainted_context",
      quarantined_at: nowIso(this.clock),
    };
    this.items.set(item.item_id, item);
    return { ...item, taint_sources: [...item.taint_sources] };
  }

  /** Force-place an item as QUARANTINED (e.g. after joinTaint on a derived action). */
  place(input: {
    item_id: string;
    item_kind: QuarantineItemKind;
    source_agent_id: string;
    taint_sources: TaintSource[];
    reason?: string;
  }): QuarantineItem {
    return (
      this.quarantineFromTaint({
        item_id: input.item_id,
        item_kind: input.item_kind,
        source_agent_id: input.source_agent_id,
        tracked: {
          kind: "TaintedValue",
          value: input.item_id,
          tainted: true,
          sources: input.taint_sources.length > 0 ? input.taint_sources : ["untrusted_input"],
        },
        reason: input.reason,
      }) ??
      (() => {
        throw new QuarantineError("PLACE_FAILED", "expected tainted place to quarantine");
      })()
    );
  }

  get(item_id: string): QuarantineItem | undefined {
    const item = this.items.get(item_id);
    return item ? { ...item, taint_sources: [...item.taint_sources] } : undefined;
  }

  isQuarantined(item_id: string): boolean {
    return this.items.get(item_id)?.status === "QUARANTINED";
  }

  listQuarantined(): QuarantineItem[] {
    return [...this.items.values()]
      .filter((i) => i.status === "QUARANTINED")
      .map((i) => ({ ...i, taint_sources: [...i.taint_sources] }));
  }

  /**
   * Release only after independent review — reviewer_id must differ from source_agent_id.
   */
  /**
   * Alias used by MemoryBroker / callers that bridge from the taint tracker.
   * Same semantics as quarantineFromTaint.
   */
  quarantineDerivedFromTaint(input: QuarantineFromTaintInput): QuarantineItem | null {
    return this.quarantineFromTaint(input);
  }

  releaseOnlyAfterReview(input: ReleaseAfterReviewInput): QuarantineItem {
    const reviewer = input.reviewer_id?.trim();
    const item_id = input.item_id?.trim();
    if (!reviewer) {
      throw new QuarantineError("REVIEWER_REQUIRED", "releaseOnlyAfterReview requires reviewer_id");
    }
    if (!item_id) {
      throw new QuarantineError("ITEM_ID_REQUIRED", "releaseOnlyAfterReview requires item_id");
    }

    const current = this.items.get(item_id);
    if (!current) {
      throw new QuarantineError("NOT_FOUND", `quarantine item not found: ${item_id}`);
    }
    if (current.status !== "QUARANTINED") {
      throw new QuarantineError(
        "NOT_QUARANTINED",
        `item ${item_id} is not QUARANTINED (status=${current.status})`,
      );
    }
    if (reviewer === current.source_agent_id) {
      throw new QuarantineError(
        "REVIEWER_IS_SOURCE",
        `reviewer_id must differ from source agent (${current.source_agent_id})`,
      );
    }

    const released: QuarantineItem = {
      ...current,
      status: "RELEASED",
      reviewer_id: reviewer,
      released_at: nowIso(this.clock),
    };
    this.items.set(item_id, released);
    return { ...released, taint_sources: [...released.taint_sources] };
  }
}

/**
 * Fail-closed: block promotion to VERIFIED/ACTIVE while the item is quarantined.
 */
export function assertPromotionNotQuarantined(
  store: QuarantineStore,
  item_id: string,
  targetStatus: QuarantineBlockedPromotionStatus = "ACTIVE",
): void {
  if (!QUARANTINE_BLOCKED_PROMOTION_STATUSES.includes(targetStatus)) {
    return;
  }
  if (store.isQuarantined(item_id)) {
    throw new QuarantineError(
      "QUARANTINED",
      `cannot promote to ${targetStatus} while item ${item_id} is QUARANTINED — releaseOnlyAfterReview required`,
    );
  }
}

/**
 * Module-level bridge from taint tracker → QuarantineStore (V2-SEC-01).
 */
export function quarantineDerivedFromTaint(
  store: QuarantineStore,
  input: QuarantineFromTaintInput,
): QuarantineItem | null {
  return store.quarantineFromTaint(input);
}
