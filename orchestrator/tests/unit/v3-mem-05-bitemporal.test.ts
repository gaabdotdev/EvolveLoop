/**
 * V3-MEM-05 — Bi-Temporal Graph (valid time ≠ transaction time).
 * Point-in-time: "o que era verdade na data T?" under transaction as-of.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  BitemporalGraph,
  BitemporalGraphError,
  BITEMPORAL_SCHEMA_VERSION,
  isValidAt,
  isKnownAsOf,
} from "../../src/v3/memory/index.js";

/** Fixed clock so default as_of in queries is deterministic when omitted. */
const CLOCK = "2026-06-01T00:00:00.000Z";

describe("V3-MEM-05 Bi-Temporal Graph", () => {
  let g: BitemporalGraph;

  beforeEach(() => {
    g = new BitemporalGraph(":memory:", "proj-mem05", { now: () => CLOCK });
  });

  afterEach(() => {
    g.close();
  });

  it("schema version is recorded", () => {
    expect(g.schemaVersion()).toBe(BITEMPORAL_SCHEMA_VERSION);
  });

  it("assertFact stores valid time and transaction time independently", () => {
    // Fact true in Jan–Mar, but only recorded in April (late knowledge).
    const fact = g.assertFact({
      subject: "File:src/auth.ts",
      predicate: "PROTECTED_BY",
      object: "Test:tests/auth.test.ts",
      valid_from: "2026-01-01T00:00:00.000Z",
      valid_to: "2026-03-01T00:00:00.000Z",
      tx_time: "2026-04-15T12:00:00.000Z",
      payload: { source: "audit-late" },
      fact_id: "f-late",
    });

    expect(fact.valid_from).toBe("2026-01-01T00:00:00.000Z");
    expect(fact.valid_to).toBe("2026-03-01T00:00:00.000Z");
    expect(fact.tx_time).toBe("2026-04-15T12:00:00.000Z");
    expect(fact.tx_until).toBeNull();
    expect(fact.status).toBe("ASSERTED");
    expect(fact.payload).toEqual({ source: "audit-late" });

    // valid time ≠ transaction time (core invariant of this gate)
    expect(fact.valid_from < fact.tx_time).toBe(true);
  });

  it("queryPointInTime(T) returns facts valid at T under current as-of", () => {
    g.assertFact({
      subject: "Decision:dec-auth",
      predicate: "DECIDES",
      object: "File:src/auth.ts",
      valid_from: "2026-01-01T00:00:00.000Z",
      valid_to: "2026-06-01T00:00:00.000Z",
      tx_time: "2026-01-02T00:00:00.000Z",
      fact_id: "f-auth",
    });
    g.assertFact({
      subject: "Decision:dec-sandbox",
      predicate: "DECIDES",
      object: "File:src/sandbox.ts",
      valid_from: "2026-03-01T00:00:00.000Z",
      valid_to: null,
      tx_time: "2026-03-02T00:00:00.000Z",
      fact_id: "f-sandbox",
    });

    const midJan = g.queryPointInTime("2026-01-15T00:00:00.000Z");
    expect(midJan.map((f) => f.fact_id)).toEqual(["f-auth"]);

    const midMar = g.queryPointInTime("2026-03-15T00:00:00.000Z");
    expect(midJan.length).toBe(1);
    expect(midMar.map((f) => f.fact_id).sort()).toEqual(["f-auth", "f-sandbox"]);

    // Half-open: valid_to exclusive
    const atEnd = g.queryPointInTime("2026-06-01T00:00:00.000Z");
    expect(atEnd.map((f) => f.fact_id)).toEqual(["f-sandbox"]);
  });

  it("late-recorded fact invisible before tx_time even if valid_at is inside valid interval", () => {
    g.assertFact({
      subject: "File:a.ts",
      predicate: "DEPENDS_ON",
      object: "File:b.ts",
      valid_from: "2026-01-01T00:00:00.000Z",
      valid_to: "2026-12-31T00:00:00.000Z",
      tx_time: "2026-04-01T00:00:00.000Z",
      fact_id: "f-late-dep",
    });

    // Asking "what was true on Feb 1?" as-of March → system did not know yet
    const beforeTx = g.queryPointInTime("2026-02-01T00:00:00.000Z", {
      as_of: "2026-03-01T00:00:00.000Z",
    });
    expect(beforeTx).toEqual([]);

    // Same valid T, as-of after recording → fact appears
    const afterTx = g.queryPointInTime("2026-02-01T00:00:00.000Z", {
      as_of: "2026-04-15T00:00:00.000Z",
    });
    expect(afterTx.map((f) => f.fact_id)).toEqual(["f-late-dep"]);
  });

  it("invalidate closes transaction time; prior as-of still reconstructs", () => {
    g.assertFact({
      subject: "File:a.ts",
      predicate: "PROTECTS",
      object: "Test:a.test.ts",
      valid_from: "2026-01-01T00:00:00.000Z",
      valid_to: null,
      tx_time: "2026-01-10T00:00:00.000Z",
      fact_id: "f-inv",
    });

    const invalidated = g.invalidate("f-inv", "2026-02-20T00:00:00.000Z");
    expect(invalidated.status).toBe("INVALIDATED");
    expect(invalidated.tx_until).toBe("2026-02-20T00:00:00.000Z");
    // Valid interval unchanged by invalidate
    expect(invalidated.valid_from).toBe("2026-01-01T00:00:00.000Z");
    expect(invalidated.valid_to).toBeNull();

    const asOfBefore = g.queryPointInTime("2026-01-15T00:00:00.000Z", {
      as_of: "2026-02-01T00:00:00.000Z",
    });
    expect(asOfBefore.map((f) => f.fact_id)).toEqual(["f-inv"]);

    const asOfAfter = g.queryPointInTime("2026-01-15T00:00:00.000Z", {
      as_of: "2026-02-20T00:00:00.000Z",
    });
    expect(asOfAfter).toEqual([]);

    // Current clock also does not see invalidated fact
    expect(g.queryPointInTime("2026-01-15T00:00:00.000Z")).toEqual([]);
  });

  it("supersede replaces fact; PIT before/after tx shows old then new", () => {
    g.assertFact({
      subject: "Decision:dec-auth",
      predicate: "DECIDES",
      object: "File:src/auth-v1.ts",
      valid_from: "2026-01-01T00:00:00.000Z",
      valid_to: null,
      tx_time: "2026-01-05T00:00:00.000Z",
      payload: { rev: 1 },
      fact_id: "f-old",
    });

    const { prior, next } = g.supersede({
      fact_id: "f-old",
      tx_time: "2026-03-01T00:00:00.000Z",
      replacement: {
        subject: "Decision:dec-auth",
        predicate: "DECIDES",
        object: "File:src/auth-v2.ts",
        valid_from: "2026-01-01T00:00:00.000Z",
        valid_to: null,
        payload: { rev: 2 },
        fact_id: "f-new",
      },
    });

    expect(prior.status).toBe("SUPERSEDED");
    expect(prior.superseded_by).toBe("f-new");
    expect(prior.tx_until).toBe("2026-03-01T00:00:00.000Z");
    expect(next.status).toBe("ASSERTED");
    expect(next.object).toBe("File:src/auth-v2.ts");
    expect(next.payload).toEqual({ rev: 2 });

    // as-of Feb → still believed auth-v1
    const feb = g.queryPointInTime("2026-02-01T00:00:00.000Z", {
      as_of: "2026-02-15T00:00:00.000Z",
      predicate: "DECIDES",
    });
    expect(feb).toHaveLength(1);
    expect(feb[0]!.fact_id).toBe("f-old");
    expect(feb[0]!.object).toBe("File:src/auth-v1.ts");

    // as-of after supersede → auth-v2
    const apr = g.queryPointInTime("2026-02-01T00:00:00.000Z", {
      as_of: "2026-04-01T00:00:00.000Z",
      predicate: "DECIDES",
    });
    expect(apr).toHaveLength(1);
    expect(apr[0]!.fact_id).toBe("f-new");
    expect(apr[0]!.object).toBe("File:src/auth-v2.ts");
  });

  it("listVersions returns full bi-temporal history for a triple key", () => {
    g.assertFact({
      subject: "File:a.ts",
      predicate: "DEPENDS_ON",
      object: "File:b.ts",
      valid_from: "2026-01-01T00:00:00.000Z",
      tx_time: "2026-01-02T00:00:00.000Z",
      fact_id: "v1",
    });
    g.supersede({
      fact_id: "v1",
      tx_time: "2026-02-01T00:00:00.000Z",
      replacement: {
        subject: "File:a.ts",
        predicate: "DEPENDS_ON",
        object: "File:c.ts",
        valid_from: "2026-01-01T00:00:00.000Z",
        fact_id: "v2",
      },
    });

    const versions = g.listVersions("File:a.ts", "DEPENDS_ON");
    expect(versions.map((v) => v.fact_id)).toEqual(["v1", "v2"]);
    expect(versions[0]!.status).toBe("SUPERSEDED");
    expect(versions[1]!.status).toBe("ASSERTED");
  });

  it("rejects empty valid interval and double invalidate", () => {
    expect(() =>
      g.assertFact({
        subject: "a",
        predicate: "R",
        object: "b",
        valid_from: "2026-05-01T00:00:00.000Z",
        valid_to: "2026-05-01T00:00:00.000Z",
        tx_time: "2026-05-02T00:00:00.000Z",
      }),
    ).toThrow(BitemporalGraphError);

    expect(() =>
      g.assertFact({
        subject: "a",
        predicate: "R",
        object: "b",
        valid_from: "2026-06-01T00:00:00.000Z",
        valid_to: "2026-05-01T00:00:00.000Z",
        tx_time: "2026-06-02T00:00:00.000Z",
      }),
    ).toThrow(/TEMPORAL_ORDER|valid_from/);

    g.assertFact({
      subject: "a",
      predicate: "R",
      object: "b",
      valid_from: "2026-01-01T00:00:00.000Z",
      tx_time: "2026-01-02T00:00:00.000Z",
      fact_id: "once",
    });
    g.invalidate("once", "2026-02-01T00:00:00.000Z");
    expect(() => g.invalidate("once", "2026-03-01T00:00:00.000Z")).toThrow(BitemporalGraphError);
    try {
      g.invalidate("once", "2026-03-01T00:00:00.000Z");
      expect.unreachable("expected FACT_NOT_CURRENT");
    } catch (err) {
      expect(err).toBeInstanceOf(BitemporalGraphError);
      expect((err as BitemporalGraphError).code).toBe("FACT_NOT_CURRENT");
    }
  });

  it("helpers isValidAt / isKnownAsOf match query semantics", () => {
    const fact = g.assertFact({
      subject: "s",
      predicate: "p",
      object: "o",
      valid_from: "2026-01-01T00:00:00.000Z",
      valid_to: "2026-02-01T00:00:00.000Z",
      tx_time: "2026-01-10T00:00:00.000Z",
      fact_id: "helpers",
    });
    g.invalidate("helpers", "2026-01-20T00:00:00.000Z");
    const closed = g.getFact("helpers")!;

    expect(isValidAt(fact, "2026-01-15T00:00:00.000Z")).toBe(true);
    expect(isValidAt(fact, "2026-02-01T00:00:00.000Z")).toBe(false);
    expect(isKnownAsOf(closed, "2026-01-15T00:00:00.000Z")).toBe(true);
    expect(isKnownAsOf(closed, "2026-01-20T00:00:00.000Z")).toBe(false);
  });

  it("queryPointInTime object form + filters are stable-ordered", () => {
    g.assertFact({
      subject: "File:z.ts",
      predicate: "DEPENDS_ON",
      object: "File:a.ts",
      valid_from: "2026-01-01T00:00:00.000Z",
      tx_time: "2026-01-02T00:00:00.000Z",
      fact_id: "z-a",
    });
    g.assertFact({
      subject: "File:a.ts",
      predicate: "DEPENDS_ON",
      object: "File:b.ts",
      valid_from: "2026-01-01T00:00:00.000Z",
      tx_time: "2026-01-02T00:00:00.000Z",
      fact_id: "a-b",
    });
    g.assertFact({
      subject: "File:a.ts",
      predicate: "REFERENCES",
      object: "Symbol:foo",
      valid_from: "2026-01-01T00:00:00.000Z",
      tx_time: "2026-01-02T00:00:00.000Z",
      fact_id: "a-sym",
    });

    const hits = g.queryPointInTime({
      valid_at: "2026-01-15T00:00:00.000Z",
      as_of: CLOCK,
    });
    const keys = hits.map((f) => `${f.subject}|${f.predicate}|${f.object}|${f.fact_id}`);
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));

    const onlyDeps = g.queryPointInTime({
      valid_at: "2026-01-15T00:00:00.000Z",
      predicate: "DEPENDS_ON",
    });
    expect(onlyDeps.every((f) => f.predicate === "DEPENDS_ON")).toBe(true);
    expect(onlyDeps).toHaveLength(2);
  });
});
