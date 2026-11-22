/**
 * V3-SEC-04 — Continuous automated red-teaming (sandbox + SSRF + DLP).
 * Synthetic payloads / in-process oracles only — no live network attacks.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runBattery,
  scheduleContinuous,
  evaluateRedTeamGate,
  REDTEAM_BATTERY_CASES,
  SANDBOX_ATTACK_CASES,
  SSRF_ATTACK_CASES,
  DLP_ATTACK_CASES,
  REDTEAM_CONTINUOUS_SCHEMA_VERSION,
  REDTEAM_CONTINUOUS_PROFILE_ID,
  DEFAULT_REDTEAM_INTERVAL_MS,
} from "../../src/v3/security/index.js";

const ORCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

afterEach(() => {
  vi.useRealTimers();
});

describe("V3-SEC-04 continuous red-team battery", () => {
  it("catalog covers sandbox escape, SSRF, and DLP exfil", () => {
    expect(SANDBOX_ATTACK_CASES.length).toBeGreaterThanOrEqual(10);
    expect(SSRF_ATTACK_CASES.length).toBeGreaterThanOrEqual(8);
    expect(DLP_ATTACK_CASES.length).toBeGreaterThanOrEqual(7);
    expect(REDTEAM_BATTERY_CASES.length).toBe(
      SANDBOX_ATTACK_CASES.length + SSRF_ATTACK_CASES.length + DLP_ATTACK_CASES.length,
    );
    const cats = new Set(REDTEAM_BATTERY_CASES.map((c) => c.category));
    expect(cats.has("sandbox_escape")).toBe(true);
    expect(cats.has("ssrf")).toBe(true);
    expect(cats.has("dlp_exfil")).toBe(true);
  });

  it("runBattery → bypass_rate === 0 and zero_bypass", () => {
    const battery = runBattery({
      workspace_root: ORCH_ROOT,
      now_ms: () => 1_700_000_000_000,
    });

    expect(battery.kind).toBe("RedTeamBatteryResult");
    expect(battery.schema_version).toBe(REDTEAM_CONTINUOUS_SCHEMA_VERSION);
    expect(battery.profile_id).toBe(REDTEAM_CONTINUOUS_PROFILE_ID);
    expect(battery.honesty).toBe("reported");
    expect(battery.ran_at_ms).toBe(1_700_000_000_000);
    expect(battery.cases.length).toBe(REDTEAM_BATTERY_CASES.length);
    expect(battery.total_attack_cases).toBeGreaterThan(0);
    expect(battery.bypass_count).toBe(0);
    expect(battery.bypass_rate).toBe(0);
    expect(battery.zero_bypass).toBe(true);
    expect(battery.blocked_count).toBe(battery.total_attack_cases);

    const bypassed = battery.cases.filter((c) => c.bypass);
    expect(bypassed, JSON.stringify(bypassed, null, 2)).toEqual([]);
  });

  it("every category contributes zero bypasses", () => {
    const battery = runBattery({ workspace_root: ORCH_ROOT });
    for (const cat of ["sandbox_escape", "ssrf", "dlp_exfil"] as const) {
      const subset = battery.cases.filter((c) => c.category === cat);
      expect(subset.length).toBeGreaterThan(0);
      expect(
        subset.every((c) => !c.bypass),
        `${cat} bypasses: ${JSON.stringify(subset.filter((c) => c.bypass))}`,
      ).toBe(true);
    }
  });

  it("evaluateRedTeamGate → PASS_SIMULATED when zero_bypass", () => {
    const battery = runBattery({ workspace_root: ORCH_ROOT });
    const gate = evaluateRedTeamGate(battery);
    expect(gate.gate_status).toBe("PASS_SIMULATED");
    expect(gate.bypass_rate).toBe(0);
    expect(gate.zero_bypass).toBe(true);
    expect(gate.honesty).toBe("reported");
  });

  it("attack outcomes are blocked; benign negatives are allowed", () => {
    const battery = runBattery({ workspace_root: ORCH_ROOT });
    for (const meta of REDTEAM_BATTERY_CASES) {
      const r = battery.cases.find((c) => c.id === meta.id)!;
      expect(r).toBeDefined();
      if (meta.expect_allow) {
        expect(r.outcome, meta.id).toBe("allowed");
        expect(r.bypass, meta.id).toBe(false);
      } else {
        expect(r.outcome, meta.id).toBe("blocked");
        expect(r.bypass, meta.id).toBe(false);
      }
    }
  });
});

describe("V3-SEC-04 scheduleContinuous (deterministic interval)", () => {
  it("runs immediately then on interval; stop is idempotent", () => {
    vi.useFakeTimers();
    const ticks: number[] = [];
    const rates: number[] = [];

    const handle = scheduleContinuous({
      workspace_root: ORCH_ROOT,
      interval_ms: 1_000,
      now_ms: () => Date.now(),
      on_tick: (t) => {
        ticks.push(t.tick);
        rates.push(t.battery.bypass_rate);
      },
      max_ticks: 3,
    });

    expect(handle.ticks).toBe(1);
    expect(ticks).toEqual([1]);
    expect(rates[0]).toBe(0);
    expect(handle.last_battery?.zero_bypass).toBe(true);

    vi.advanceTimersByTime(1_000);
    expect(handle.ticks).toBe(2);
    vi.advanceTimersByTime(1_000);
    expect(handle.ticks).toBe(3);
    expect(ticks).toEqual([1, 2, 3]);
    expect(rates.every((r) => r === 0)).toBe(true);
    expect(handle.running).toBe(false); // max_ticks reached

    handle.stop();
    handle.stop();
    expect(handle.running).toBe(false);
  });

  it("run_immediately=false waits for first interval", () => {
    vi.useFakeTimers();
    const ticks: number[] = [];
    const handle = scheduleContinuous({
      workspace_root: ORCH_ROOT,
      interval_ms: 500,
      run_immediately: false,
      max_ticks: 2,
      on_tick: (t) => ticks.push(t.tick),
    });

    expect(handle.ticks).toBe(0);
    expect(ticks).toEqual([]);
    vi.advanceTimersByTime(499);
    expect(handle.ticks).toBe(0);
    vi.advanceTimersByTime(1);
    expect(handle.ticks).toBe(1);
    vi.advanceTimersByTime(500);
    expect(handle.ticks).toBe(2);
    expect(ticks).toEqual([1, 2]);
    handle.stop();
  });

  it("default interval is DEFAULT_REDTEAM_INTERVAL_MS", () => {
    expect(DEFAULT_REDTEAM_INTERVAL_MS).toBe(60_000);
    vi.useFakeTimers();
    const handle = scheduleContinuous({
      workspace_root: ORCH_ROOT,
      run_immediately: false,
      max_ticks: 1,
    });
    vi.advanceTimersByTime(DEFAULT_REDTEAM_INTERVAL_MS - 1);
    expect(handle.ticks).toBe(0);
    vi.advanceTimersByTime(1);
    expect(handle.ticks).toBe(1);
    expect(handle.last_battery?.bypass_rate).toBe(0);
    handle.stop();
  });

  it("rejects invalid interval_ms", () => {
    expect(() =>
      scheduleContinuous({ workspace_root: ORCH_ROOT, interval_ms: -1 }),
    ).toThrow(/invalid_interval_ms/);
  });
});
