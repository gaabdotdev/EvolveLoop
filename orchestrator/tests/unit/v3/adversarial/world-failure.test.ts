/**
 * Adversarial red-team: World Model poisoning, Belief contamination,
 * Failure classification coercion, Stagnation false-negative, Recovery wiring.
 * Assert REJECT / risk bump / WIRED recovery (WF-05).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgencyLoop,
  WorldModelStore,
  makeObservation,
  makeBelief,
  ChannelSeparationError,
  looksLikeInferenceLanguage,
  classifyOutcome,
  isExplicitPass,
  StagnationDetector,
  RecoveryHierarchy,
  hasContradictionSignals,
  selectGovernorAction,
} from "../../../../src/v3/index.js";
import { GoalStore } from "../../../../src/v3/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const AGENCY_RUNTIME_SRC = join(
  HERE,
  "../../../../src/v3/adapters/agency-runtime.ts",
);

function activate(store: GoalStore, id: string): void {
  store.accept(id, { reason: "accept", actor: "wf-rt" });
  store.activate(id, { reason: "activate", actor: "wf-rt" });
}

describe("Adversarial WF — world-model / failure / stagnation / recovery", () => {
  // -------------------------------------------------------------------------
  // 1. putObservation with inference language that should be Belief
  // -------------------------------------------------------------------------
  it("WF-01: inference language on Observation channel must be rejected", () => {
    const store = new WorldModelStore();
    const attacks = [
      "I infer the database is down from the latency spike",
      "Therefore the service is unhealthy",
      "It seems that auth is broken",
      "My hypothesis: cache poisoning",
      "We can conclude the outage is regional",
      "Probably because the pool is exhausted",
    ];

    attacks.forEach((raw, i) => {
      expect(looksLikeInferenceLanguage(raw)).toBe(true);
      expect(() =>
        store.putObservation(
          makeObservation({
            observation_id: `poison-${i}`,
            raw,
            source: "agent-narrative",
          }),
        ),
      ).toThrow(ChannelSeparationError);
    });

    // Raw sensor fact still accepted
    const ok = store.putObservation(
      makeObservation({
        observation_id: "obs-fact",
        raw: "HTTP 500 from /api/health at 12:00Z",
        source: "probe",
      }),
    );
    expect(ok.spec.raw).toContain("HTTP 500");
    expect(store.listObservations()).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // 2. Belief contradiction must surface in toSnapshot open_signals
  // -------------------------------------------------------------------------
  it("WF-02: belief↔belief contradicts edge must appear in toSnapshot open_signals", () => {
    const store = new WorldModelStore();
    store.putObservation(
      makeObservation({
        observation_id: "obs-shared",
        raw: "metric probe completed",
        source: "metrics",
        observed_at: "2026-09-24T18:00:00.000Z",
      }),
    );
    store.putBelief(
      makeBelief({
        belief_id: "b-up",
        statement: "service is up",
        status: "supported",
        confidence: 0.8,
        supporting_observation_refs: ["obs-shared"],
        updated_at: "2026-09-24T18:00:00.000Z",
      }),
    );
    store.putBelief(
      makeBelief({
        belief_id: "b-down",
        statement: "service is down",
        status: "supported",
        confidence: 0.8,
        supporting_observation_refs: ["obs-shared"],
        updated_at: "2026-09-24T18:00:00.000Z",
      }),
    );
    store.addRevisionEdge("b-up", "b-down", "contradicts");

    const snap = store.toSnapshot({
      snapshot_id: "wf-02",
      observed_at: "2026-09-24T18:00:00.000Z",
    });

    expect(snap.open_signals?.length).toBeGreaterThan(0);
    expect(hasContradictionSignals(snap.open_signals ?? [])).toBe(true);
    expect(snap.open_signals?.some((s) => s.startsWith("contradictory:"))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. classifyOutcome coercion games — no silent PASS from unknown shapes
  // -------------------------------------------------------------------------
  it("WF-03: coercion games must not silent-PASS; UNKNOWN→NOT_MEASURED", () => {
    // Explicit recognized strings may be PASS — that is not silent coercion.
    expect(classifyOutcome("PASS").is_pass).toBe(true);
    expect(classifyOutcome("success").is_pass).toBe(true);
    expect(classifyOutcome("SUCCESS").status).toBe("PASS");

    // Unknown / non-string shapes must NEVER become PASS
    const noPassAttacks: unknown[] = [
      true,
      false,
      1,
      0,
      { ok: true },
      { status: "PASS" },
      { success: true },
      ["PASS"],
      ["success"],
      null,
      undefined,
      "",
      "  ",
      "UNKNOWN",
      "unknown",
      "Unknown",
      "N/A",
      "none",
      "true",
      "yes",
      "1",
    ];

    for (const raw of noPassAttacks) {
      const c = classifyOutcome(raw);
      expect(c.is_pass).toBe(false);
      expect(isExplicitPass(raw)).toBe(false);
      expect(c.status).not.toBe("PASS");
    }

    // Ground truth: UNKNOWN / nullish / non-string family → NOT_MEASURED
    for (const u of [null, undefined, "", "  ", "UNKNOWN", "unknown", "Unknown", "N/A", "none", true, { ok: true }]) {
      const c = classifyOutcome(u);
      expect(c.status).toBe("NOT_MEASURED");
      expect(c.is_pass).toBe(false);
      expect(c.fail_closed).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // 4. StagnationDetector: same action ×20 with tiny content change
  // -------------------------------------------------------------------------
  it("WF-04: same action 20× with tiny fingerprint drift must still detect stagnation", () => {
    const d = new StagnationDetector({
      window_size: 20,
      repeat_threshold: 3,
      no_progress_threshold: 3,
    });

    let report = d.observe({
      action_id: "retry-fix",
      state_fingerprint: "fp-0",
    });
    for (let i = 1; i < 20; i++) {
      // Tiny content change — must not evade repeated_action
      report = d.observe({
        action_id: "retry-fix",
        state_fingerprint: `fp-0${".".repeat(i % 3)}${i}`,
      });
    }

    expect(report.stagnant).toBe(true);
    expect(report.signals).toContain("repeated_action");
    expect(report.recommended_action).not.toBe("continue");
  });

  /**
   * WF-04b: near-duplicate action_ids (case/whitespace) must collapse after normalize.
   */
  it(
    "WF-04b: case/whitespace action_id variants must still detect stagnation",
    () => {
      const d = new StagnationDetector({
        window_size: 10,
        repeat_threshold: 3,
        no_progress_threshold: 3,
      });
      const variants = [
        "retry-fix",
        "Retry-fix",
        "retry-fix ",
        "RETRY-FIX",
        "retry-fix",
        " retry-fix",
      ];
      let report = d.observe({
        action_id: variants[0],
        state_fingerprint: "s0",
      });
      for (let i = 1; i < variants.length; i++) {
        report = d.observe({
          action_id: variants[i],
          state_fingerprint: "s0",
        });
      }
      expect(report.stagnant).toBe(true);
      expect(report.signals).toContain("repeated_action");
    },
  );

  // -------------------------------------------------------------------------
  // 5. RecoveryHierarchy must be reachable from agency-runtime failure path
  // -------------------------------------------------------------------------
  it("WF-05: RecoveryHierarchy is WIRED from agency-runtime", () => {
    const src = readFileSync(AGENCY_RUNTIME_SRC, "utf-8");

    expect(typeof RecoveryHierarchy).toBe("function");
    expect(src).toMatch(/RecoveryHierarchy/);
    expect(src).toMatch(/recovery-hierarchy/);
    expect(src).toMatch(/\brecovery\b/);
    expect(src).toMatch(/advanceRecoveryHierarchy|failCurrent/);

    // Sibling failure-path modules remain wired
    expect(src).toMatch(/StagnationDetector/);
    expect(src).toMatch(/classifyOutcome/);
    expect(src).toMatch(/selectContainment/);
  });

  // -------------------------------------------------------------------------
  // 6. World drift: observation Y vs belief X → contradictory → AgencyLoop risk bump
  // -------------------------------------------------------------------------
  it("WF-06: obs Y vs belief X → contradictory open_signals → AgencyLoop bumps risk", () => {
    const wm = new WorldModelStore();
    // Observation Y: service is failing
    wm.putObservation(
      makeObservation({
        observation_id: "obs-Y",
        raw: "endpoint /health returns HTTP 500 — service down",
        source: "probe",
        observed_at: "2026-09-24T20:00:00.000Z",
      }),
    );
    // Belief X: still claims healthy while citing Y (contamination / drift)
    wm.putBelief(
      makeBelief({
        belief_id: "belief-X",
        statement: "service is healthy and online",
        status: "supported",
        confidence: 0.9,
        supporting_observation_refs: ["obs-Y"],
        updated_at: "2026-09-24T20:00:00.000Z",
      }),
    );

    const report = wm.reconcile({ now: "2026-09-24T20:00:00.000Z" });
    expect(report.has_drift).toBe(true);
    expect(
      report.drifts.some(
        (d) =>
          d.type === "contradictory" &&
          d.subject_id === "belief-X" &&
          (d.related_refs?.includes("obs-Y") ?? false),
      ),
    ).toBe(true);

    const world = wm.toSnapshot({
      snapshot_id: "wf-06",
      observed_at: "2026-09-24T20:00:00.000Z",
    });
    expect(hasContradictionSignals(world.open_signals ?? [])).toBe(true);

    const goals = new GoalStore();
    goals.create({
      id: "g-drift",
      desired_outcome: "Keep service healthy",
      risk_policy: "low capability=documentation",
      non_goals: ["capability:documentation"],
    });
    activate(goals, "g-drift");

    const step = new AgencyLoop().step({
      portfolio: goals.portfolio("pf-wf06"),
      world,
      policy: {
        snapshot_id: "p-wf06",
        policy_ref: "rapid-prototype",
        captured_at: "2026-09-24T20:00:00.000Z",
      },
    });

    const proposal = step.proposals[0]!;
    expect(proposal.risk).toBe("high");
    expect(proposal.rationale).toMatch(/world_contradiction:risk_bump/);
    expect(proposal.governor_required).toBe(true);
    // Under NORMAL, high risk → confirm (not silent allow)
    expect(selectGovernorAction(proposal.risk, "NORMAL")).toBe("confirm");
  });
});
