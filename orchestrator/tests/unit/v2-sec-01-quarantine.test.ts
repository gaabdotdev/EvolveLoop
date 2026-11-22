/**
 * V2-SEC-01 — Quarentena Tainted (memory/action derived from tainted context).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  QuarantineStore,
  QuarantineError,
  assertPromotionNotQuarantined,
  taint,
  clean,
  joinTaint,
  quarantineDerivedFromTaint,
} from "../../src/v3/security/index.js";
import {
  MemoryBroker,
  MemoryPromotionError,
  assertPromotionGate,
  promotionGateAllowed,
} from "../../src/v3/memory/index.js";

describe("V2-SEC-01 QuarantineStore", () => {
  let store: QuarantineStore;
  let nowMs: number;

  beforeEach(() => {
    nowMs = Date.parse("2026-11-21T18:00:00.000Z");
    store = new QuarantineStore({ clock: () => new Date(nowMs) });
  });

  it("places memory_id derived from tainted into QUARANTINED", () => {
    const dirty = taint("paste payload", "user_paste");
    const item = store.quarantineFromTaint({
      item_id: "mem-1",
      item_kind: "memory",
      source_agent_id: "agent-writer",
      tracked: dirty,
    });
    expect(item).not.toBeNull();
    expect(item!.status).toBe("QUARANTINED");
    expect(item!.item_kind).toBe("memory");
    expect(item!.taint_sources).toContain("user_paste");
    expect(store.isQuarantined("mem-1")).toBe(true);
  });

  it("places action_id derived from tainted into QUARANTINED via taint bridge", () => {
    const joined = joinTaint("shell-cmd", clean("echo"), taint("rm", "untrusted_input"));
    const item = quarantineDerivedFromTaint(store, {
      item_id: "act-42",
      item_kind: "action",
      source_agent_id: "agent-runner",
      tracked: joined,
      reason: "action_from_tainted_context",
    });
    expect(item?.status).toBe("QUARANTINED");
    expect(item?.item_kind).toBe("action");
    expect(store.get("act-42")?.reason).toBe("action_from_tainted_context");
  });

  it("does not quarantine clean tracked values", () => {
    const item = store.quarantineFromTaint({
      item_id: "mem-clean",
      item_kind: "memory",
      source_agent_id: "agent-a",
      tracked: clean("ok"),
    });
    expect(item).toBeNull();
    expect(store.isQuarantined("mem-clean")).toBe(false);
  });

  it("blocks promotion to ACTIVE/VERIFIED while quarantined", () => {
    store.place({
      item_id: "mem-q",
      item_kind: "memory",
      source_agent_id: "agent-a",
      taint_sources: ["agent_proposal"],
    });

    expect(() => assertPromotionNotQuarantined(store, "mem-q", "ACTIVE")).toThrow(
      QuarantineError,
    );
    expect(() => assertPromotionNotQuarantined(store, "mem-q", "VERIFIED")).toThrow(
      /QUARANTINED|cannot promote/,
    );

    expect(() =>
      assertPromotionGate(promotionGateAllowed("mso", "promote anyway"), {
        quarantine: store,
        item_id: "mem-q",
        target_status: "ACTIVE",
      }),
    ).toThrow(MemoryPromotionError);

    expect(() =>
      assertPromotionGate(promotionGateAllowed("validator", "verify"), {
        quarantine: store,
        item_id: "mem-q",
        target_status: "VERIFIED",
      }),
    ).toThrow(/QUARANTINED/);
  });

  it("releaseOnlyAfterReview requires reviewer != source agent", () => {
    store.quarantineFromTaint({
      item_id: "mem-r",
      item_kind: "memory",
      source_agent_id: "agent-source",
      tracked: taint("x", "external_url"),
    });

    expect(() =>
      store.releaseOnlyAfterReview({ reviewer_id: "agent-source", item_id: "mem-r" }),
    ).toThrow(QuarantineError);
    expect(() =>
      store.releaseOnlyAfterReview({ reviewer_id: "agent-source", item_id: "mem-r" }),
    ).toThrow(/REVIEWER_IS_SOURCE|differ/);

    nowMs += 1_000;
    const released = store.releaseOnlyAfterReview({
      reviewer_id: "human-reviewer",
      item_id: "mem-r",
    });
    expect(released.status).toBe("RELEASED");
    expect(released.reviewer_id).toBe("human-reviewer");
    expect(released.released_at).toBeTruthy();
    expect(store.isQuarantined("mem-r")).toBe(false);

    expect(() =>
      assertPromotionNotQuarantined(store, "mem-r", "ACTIVE"),
    ).not.toThrow();
  });

  it("listQuarantined returns only active quarantine rows", () => {
    store.place({
      item_id: "a1",
      item_kind: "action",
      source_agent_id: "ag",
      taint_sources: ["holdout_leak"],
    });
    store.place({
      item_id: "m1",
      item_kind: "memory",
      source_agent_id: "ag",
      taint_sources: ["memory_tainted"],
    });
    store.releaseOnlyAfterReview({ reviewer_id: "rev", item_id: "a1" });
    const open = store.listQuarantined();
    expect(open).toHaveLength(1);
    expect(open[0]!.item_id).toBe("m1");
  });
});

describe("V2-SEC-01 MemoryBroker + quarantine integration", () => {
  let tmp: string;
  let store: QuarantineStore;
  let broker: MemoryBroker;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v2-sec01-"));
    store = new QuarantineStore();
    broker = new MemoryBroker(path.join(tmp, "mem.db"), "proj-sec01", {
      quarantine: store,
    });
  });

  afterEach(async () => {
    broker.close();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("auto-quarantines tainted propose and blocks promote until review", () => {
    const dirty = broker.propose({
      memory_type: "decision",
      title: "tainted decision",
      body: "use leaked holdout",
      source: "agent-alpha",
      tainted: true,
    });
    expect(store.isQuarantined(dirty.memory_id)).toBe(true);

    expect(() =>
      broker.promote(dirty.memory_id, promotionGateAllowed("mso", "try promote")),
    ).toThrow(MemoryPromotionError);

    store.releaseOnlyAfterReview({
      reviewer_id: "validator-beta",
      item_id: dirty.memory_id,
    });

    const promoted = broker.promote(
      dirty.memory_id,
      promotionGateAllowed("mso", "promote after quarantine release"),
    );
    expect(promoted.status).toBe("ACTIVE");
  });

  it("clean propose is not quarantined and promotes normally", () => {
    const cleanMem = broker.propose({
      memory_type: "semantic",
      title: "safe",
      body: "workspace isolation",
      source: "agent-alpha",
      tainted: false,
    });
    expect(store.isQuarantined(cleanMem.memory_id)).toBe(false);
    const promoted = broker.promote(
      cleanMem.memory_id,
      promotionGateAllowed("human", "promote clean"),
    );
    expect(promoted.status).toBe("ACTIVE");
  });
});
