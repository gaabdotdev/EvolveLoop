/**
 * V3-TEST-02 — Deterministic Simulation Testing (DST).
 *
 * Gate (plano §5.2): ≥10_000 cenários simulados → 0 deadlocks, 0 split-brain,
 * same seed → identical transcript hash.
 */

import { describe, it, expect } from "vitest";
import {
  DST_SCHEMA_VERSION,
  DST_DEFAULT_SEED,
  DST_MIN_SCENARIOS,
  SimulationWorld,
  runScenarios,
  assertDstGate,
  assertSeedReproducibility,
} from "../../src/v3/evaluation/index.js";

describe("V3-TEST-02 DST — schema + virtual subsystems", () => {
  it("schema version and default seed are fixed for evidence", () => {
    expect(DST_SCHEMA_VERSION).toBe(1);
    expect(DST_DEFAULT_SEED).toBe((0xd57_0002 ^ 0x5eed_cafe) >>> 0);
    expect(DST_MIN_SCENARIOS).toBe(10_000);
  });

  it("SimulationWorld clock/fs/proc/net are seeded and record transcript", () => {
    const w = new SimulationWorld(DST_DEFAULT_SEED);
    const t0 = w.clock.nowMs;
    w.clock.tick(7);
    expect(w.clock.nowMs).toBe(t0 + 7);

    w.fs.write("/a.txt", "hello");
    expect(w.fs.read("/a.txt")).toBe("hello");
    expect(w.fs.read("/missing")).toBeUndefined();

    const p = w.spawn("agent-0");
    expect(p.pid).toBe(1);
    expect(w.tryAcquire(p, "r0")).toBe(true);
    expect(w.locks.get("r0")).toBe("agent-0");
    w.releaseLock(p, "r0");
    w.exit(p);

    const mid = w.net.send("a", "b", "ping", 2);
    expect(mid).toBe(1);
    expect(w.net.deliverDue(w.clock.nowMs)).toHaveLength(0);
    w.clock.tick(2);
    expect(w.net.deliverDue(w.clock.nowMs)).toHaveLength(1);

    expect(w.transcript.length).toBeGreaterThan(5);
    expect(w.transcriptHash()).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fencing rejects stale writers (split-brain prevention)", () => {
    const w = new SimulationWorld(42);
    const gen1 = w.acquireFence("coord-a", "lead");
    expect(w.leaderAct("coord-a", "lead", gen1, "ok")).toBe(true);
    const gen2 = w.acquireFence("coord-b", "lead");
    expect(w.leaderAct("coord-a", "lead", gen1, "stale")).toBe(false);
    expect(w.leaderAct("coord-b", "lead", gen2, "ok")).toBe(true);
    expect(
      w.detectSplitBrain([
        { resource: "lead", holder: "coord-a", generation: gen1 },
        { resource: "lead", holder: "coord-b", generation: gen2 },
      ]),
    ).toBe(false);
  });

  it("lock acquire refuses wait-for cycles (deadlock prevention)", () => {
    const w = new SimulationWorld(7);
    const a = w.spawn("A");
    const b = w.spawn("B");
    expect(w.tryAcquire(a, "r1")).toBe(true);
    expect(w.tryAcquire(b, "r2")).toBe(true);
    // A waits on r2 (held by B) — no cycle yet; harness returns false without parking.
    expect(w.tryAcquire(a, "r2")).toBe(false);
    // Force a waiting edge A→r2 and B→r1 to probe cycle detector.
    a.waitingOn = "r2";
    a.state = "waiting";
    b.waitingOn = "r1";
    b.state = "waiting";
    expect(w.detectDeadlock()).toBe(true);
    // tryAcquire should refuse creating a cycle from a fresh waiter C.
    const c = w.spawn("C");
    // Clear artificial waits for clean refuse path via tryAcquire:
    a.waitingOn = null;
    a.state = "running";
    b.waitingOn = null;
    b.state = "running";
    // Hold r1 by A, B waits on r1 then tries to make A wait on something B holds —
    // simpler: A holds r1, B holds r2; if A waits on r2 while B waits on r1 → cycle.
    a.waitingOn = "r2";
    a.state = "waiting";
    expect(w.tryAcquire(b, "r1")).toBe(false);
    expect(
      w.transcript.some((e) => e.kind === "lock_refuse_deadlock"),
    ).toBe(true);
  });
});

describe("V3-TEST-02 DST — runScenarios gate (≥10k)", () => {
  it("runScenarios(seed, 10000) → 0 deadlock, 0 split-brain + seed reproducibility", () => {
    const stats = runScenarios(DST_DEFAULT_SEED, DST_MIN_SCENARIOS);
    expect(stats.schema_version).toBe(DST_SCHEMA_VERSION);
    expect(stats.seed).toBe(DST_DEFAULT_SEED);
    expect(stats.n).toBe(DST_MIN_SCENARIOS);
    expect(stats.deadlocks).toBe(0);
    expect(stats.split_brains).toBe(0);
    expect(stats.scenarios_ok).toBe(DST_MIN_SCENARIOS);
    expect(stats.transcript_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stats.event_count).toBeGreaterThan(DST_MIN_SCENARIOS);
    expect(assertDstGate(stats)).toEqual({ ok: true });

    // Second full battery with same seed must match transcript hash.
    const again = runScenarios(DST_DEFAULT_SEED, DST_MIN_SCENARIOS);
    expect(again.transcript_hash).toBe(stats.transcript_hash);
    expect(again.deadlocks).toBe(0);
    expect(again.split_brains).toBe(0);
  });

  it("same seed → identical transcript hash; different seed diverges", () => {
    const repro = assertSeedReproducibility(DST_DEFAULT_SEED, 2_000);
    expect(repro.ok).toBe(true);
    if (repro.ok) expect(repro.hash).toMatch(/^[a-f0-9]{64}$/);

    const a = runScenarios(DST_DEFAULT_SEED, 500);
    const b = runScenarios(DST_DEFAULT_SEED, 500);
    expect(a.transcript_hash).toBe(b.transcript_hash);

    const c = runScenarios((DST_DEFAULT_SEED ^ 0x1111) >>> 0, 500);
    expect(c.transcript_hash).not.toBe(a.transcript_hash);
  });

  it("assertDstGate fails when n below minimum", () => {
    const stats = runScenarios(DST_DEFAULT_SEED, 100);
    const gate = assertDstGate(stats, DST_MIN_SCENARIOS);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reasons.some((r) => r.includes("n="))).toBe(true);
    }
  });
});
