import { describe, it, expect } from "vitest";
import {
  OUTCOME_STATUSES,
  CONTAINMENT_ACTIONS,
  RECOVERY_HIERARCHY_STEPS,
  classifyOutcome,
  classifyOutcomeStatus,
  assertPassOutcome,
  isExplicitPass,
  SilentPassForbiddenError,
  selectContainment,
  escalateContainment,
  RecoveryHierarchy,
  recoverySteps,
  nextRecoveryStep,
  RecoveryExhaustedError,
  StagnationDetector,
  evaluateSafetyTransition,
  transitionSafetyState,
  canTransitionSafetyState,
  suggestDegrade,
  suggestRecover,
  InvalidSafetyTransitionError,
  SAFETY_STATES,
} from "../../../src/v3/index.js";

describe("V3 Zero Silent Failure — classifyOutcome", () => {
  it("never maps UNKNOWN / null / undefined / empty to PASS", () => {
    for (const raw of [null, undefined, "", "  ", "UNKNOWN", "unknown", "Unknown"]) {
      const result = classifyOutcome(raw);
      expect(result.status).toBe("NOT_MEASURED");
      expect(result.is_pass).toBe(false);
      expect(result.fail_closed).toBe(true);
      expect(isExplicitPass(raw)).toBe(false);
    }
  });

  it("maps SUCCESS/FAILURE aliases and canonical statuses", () => {
    expect(classifyOutcomeStatus("SUCCESS")).toBe("PASS");
    expect(classifyOutcomeStatus("PASS")).toBe("PASS");
    expect(classifyOutcomeStatus("FAILURE")).toBe("FAIL");
    expect(classifyOutcomeStatus("FAIL")).toBe("FAIL");
    expect(classifyOutcomeStatus("BLOCKED")).toBe("BLOCKED");
    expect(classifyOutcomeStatus("UNCERTAIN")).toBe("UNCERTAIN");
    expect(classifyOutcomeStatus("PARTIAL")).toBe("PARTIAL");
    expect(classifyOutcomeStatus("DEGRADED")).toBe("DEGRADED");
    expect(classifyOutcomeStatus("NOT_MEASURED")).toBe("NOT_MEASURED");
  });

  it("maps unrecognized tokens to UNCERTAIN (fail-closed, not PASS)", () => {
    const r = classifyOutcome("maybe-ok");
    expect(r.status).toBe("UNCERTAIN");
    expect(r.is_pass).toBe(false);
    expect(r.fail_closed).toBe(true);
  });

  it("maps non-string to NOT_MEASURED", () => {
    expect(classifyOutcomeStatus(42)).toBe("NOT_MEASURED");
    expect(classifyOutcomeStatus({ status: "PASS" })).toBe("NOT_MEASURED");
  });

  it("assertPassOutcome throws SilentPassForbiddenError for non-PASS", () => {
    expect(() => assertPassOutcome("UNKNOWN")).toThrow(SilentPassForbiddenError);
    expect(() => assertPassOutcome(null)).toThrow(SilentPassForbiddenError);
    expect(() => assertPassOutcome("FAIL")).toThrow(SilentPassForbiddenError);
    expect(() => assertPassOutcome("PASS")).not.toThrow();
  });

  it("exposes full OutcomeStatus enum without PASS-only coercion path", () => {
    expect(OUTCOME_STATUSES).toEqual([
      "PASS",
      "FAIL",
      "BLOCKED",
      "UNCERTAIN",
      "PARTIAL",
      "DEGRADED",
      "NOT_MEASURED",
    ]);
  });
});

describe("V3 Failure Containment", () => {
  it("exposes required ContainmentAction set", () => {
    expect(CONTAINMENT_ACTIONS).toEqual([
      "quarantine_goal",
      "quarantine_capability",
      "pause_agency",
      "escalate_human",
      "degrade_autonomy",
    ]);
  });

  it("selects narrow containment for capability FAIL", () => {
    const d = selectContainment("capability", "FAIL");
    expect(d.action).toBe("quarantine_capability");
    expect(d.safety_hint).toBe("QUARANTINED");
  });

  it("fail-closes NOT_MEASURED with degrade_autonomy + SUSPECT", () => {
    const d = selectContainment("action", "NOT_MEASURED");
    expect(d.action).toBe("degrade_autonomy");
    expect(d.safety_hint).toBe("SUSPECT");
  });

  it("escalates domain when local containment fails", () => {
    const d = escalateContainment("capability", "FAIL");
    expect(d.domain).toBe("provider");
    const toSystem = escalateContainment("workspace", "BLOCKED");
    expect(toSystem.action).toBe("escalate_human");
    expect(toSystem.domain).toBe("system");
  });
});

describe("V3 RecoveryHierarchy", () => {
  it("orders steps retry → replan → rollback_checkpoint → quarantine → human_gate", () => {
    expect(recoverySteps()).toEqual([
      "retry",
      "replan",
      "rollback_checkpoint",
      "quarantine",
      "human_gate",
    ]);
    expect(RECOVERY_HIERARCHY_STEPS).toEqual(recoverySteps());
    expect(nextRecoveryStep("retry")).toBe("replan");
    expect(nextRecoveryStep("human_gate")).toBeNull();
  });

  it("walks the hierarchy via next() and exhausts at human_gate", () => {
    const h = new RecoveryHierarchy();
    expect(h.current).toBe("retry");
    expect(h.next().current).toBe("replan");
    expect(h.next().current).toBe("rollback_checkpoint");
    expect(h.next().current).toBe("quarantine");
    const last = h.next();
    expect(last.current).toBe("human_gate");
    expect(last.exhausted).toBe(true);
    expect(() => h.next()).toThrow(RecoveryExhaustedError);
  });

  it("failCurrent retries in-place then escalates", () => {
    const h = new RecoveryHierarchy({ max_attempts_per_step: 2 });
    const first = h.failCurrent();
    expect(first.current).toBe("retry");
    const second = h.failCurrent();
    expect(second.previous).toBe("retry");
    expect(second.current).toBe("replan");
  });

  it("refuse silent downgrade via escalateTo", () => {
    const h = new RecoveryHierarchy();
    h.escalateTo("quarantine");
    expect(h.current).toBe("quarantine");
    expect(() => h.escalateTo("retry")).toThrow(RecoveryExhaustedError);
  });
});

describe("V3 StagnationDetector", () => {
  it("detects repeated action without state progress", () => {
    const d = new StagnationDetector({
      window_size: 5,
      repeat_threshold: 3,
      no_progress_threshold: 3,
    });
    d.observe({ action_id: "a1", state_fingerprint: "s0" });
    d.observe({ action_id: "a1", state_fingerprint: "s0" });
    const report = d.observe({ action_id: "a1", state_fingerprint: "s0" });
    expect(report.stagnant).toBe(true);
    expect(report.signals).toContain("repeated_action");
    expect(report.signals).toContain("no_state_progress");
    expect(report.recommended_action).not.toBe("continue");
  });

  it("detects repeated hypothesis and failure", () => {
    const d = new StagnationDetector({ repeat_threshold: 3, window_size: 5 });
    d.observe({ hypothesis_id: "h1", failure_signature: "e1" });
    d.observe({ hypothesis_id: "h1", failure_signature: "e1" });
    const report = d.observe({ hypothesis_id: "h1", failure_signature: "e1" });
    expect(report.signals).toContain("repeated_hypothesis");
    expect(report.signals).toContain("repeated_failure");
    expect(report.recommended_action).toBe("escalate");
  });

  it("does not flag progress when fingerprint changes", () => {
    const d = new StagnationDetector({
      window_size: 4,
      repeat_threshold: 3,
      no_progress_threshold: 3,
    });
    d.observe({ action_id: "a1", state_fingerprint: "s1" });
    d.observe({ action_id: "a2", state_fingerprint: "s2" });
    const report = d.observe({ action_id: "a3", state_fingerprint: "s3" });
    expect(report.stagnant).toBe(false);
    expect(report.recommended_action).toBe("continue");
  });
});

describe("V3 SafetyState transitions", () => {
  it("aligns with existing SAFETY_STATES enum", () => {
    expect(SAFETY_STATES).toEqual([
      "NORMAL",
      "SUSPECT",
      "RESTRICTED",
      "QUARANTINED",
      "RECOVERING",
      "RESTORED",
    ]);
  });

  it("allows progressive degrade and progressive recover", () => {
    expect(canTransitionSafetyState("NORMAL", "SUSPECT")).toBe(true);
    expect(canTransitionSafetyState("SUSPECT", "RESTRICTED")).toBe(true);
    expect(canTransitionSafetyState("RESTRICTED", "QUARANTINED")).toBe(true);
    expect(canTransitionSafetyState("QUARANTINED", "RECOVERING")).toBe(true);
    expect(canTransitionSafetyState("RECOVERING", "RESTORED")).toBe(true);
    expect(canTransitionSafetyState("RESTORED", "NORMAL")).toBe(true);
  });

  it("prohibits QUARANTINED → NORMAL / RESTORED (§256)", () => {
    const jump = evaluateSafetyTransition("QUARANTINED", "NORMAL");
    expect(jump.allowed).toBe(false);
    expect(jump.reason).toMatch(/RECOVERING/);
    expect(() => transitionSafetyState("QUARANTINED", "NORMAL")).toThrow(
      InvalidSafetyTransitionError,
    );
    expect(() => transitionSafetyState("QUARANTINED", "RESTORED")).toThrow(
      InvalidSafetyTransitionError,
    );
    expect(transitionSafetyState("QUARANTINED", "RECOVERING")).toBe("RECOVERING");
  });

  it("suggestDegrade / suggestRecover follow hierarchy", () => {
    expect(suggestDegrade("NORMAL")).toBe("SUSPECT");
    expect(suggestDegrade("SUSPECT")).toBe("RESTRICTED");
    expect(suggestDegrade("RESTRICTED")).toBe("QUARANTINED");
    expect(suggestRecover("QUARANTINED")).toBe("RECOVERING");
    expect(suggestRecover("RECOVERING")).toBe("RESTORED");
    expect(suggestRecover("RESTORED")).toBe("NORMAL");
  });
});
