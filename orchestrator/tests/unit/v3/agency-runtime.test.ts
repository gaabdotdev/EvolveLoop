import { describe, it, expect } from "vitest";
import {
  ExecutionEngine,
  ProviderRouter,
  createMockProvider,
  GoalStore,
  AgencyRuntime,
  runAgencyRuntime,
  WorldModelStore,
  V3_API_VERSION,
  V3_SCHEMA_VERSION,
  evaluateCriterion,
  isEligibleEvidenceRef,
  type SuccessOracleCriterion,
  type AgencyRunReport,
} from "../../../src/index.js";
import { loginDashboardIR, testRegistry } from "../../fixtures/login-dashboard.js";

function criterion(id: string): SuccessOracleCriterion {
  return {
    apiVersion: V3_API_VERSION,
    kind: "SuccessOracleCriterion",
    metadata: { schema_version: V3_SCHEMA_VERSION },
    spec: {
      criterion_id: id,
      type: "functional",
      required: true,
      measurement: "stub",
      threshold: "ok",
      evidence_source: "test",
      verification_method: "presence_of_evidence",
      status: "pending",
    },
  };
}

function setupEngine() {
  const router = new ProviderRouter();
  const ids = new Set<string>();
  for (const cap of Object.values(testRegistry.capabilities)) {
    for (const p of cap.providers) ids.add(p.id);
  }
  for (const id of ids) {
    router.register(createMockProvider(id));
  }
  return new ExecutionEngine({ registry: testRegistry, providers: router });
}

function policySnapshot(ref = "rapid-prototype") {
  return {
    snapshot_id: "pol-1",
    policy_ref: ref,
    captured_at: "2026-09-24T00:00:00.000Z",
  };
}

function worldStub(extra?: {
  open_signals?: string[];
  belief_ids?: string[];
}) {
  return {
    snapshot_id: "w1",
    observed_at: "2026-09-24T00:00:00.000Z",
    ...extra,
  };
}

/** Single low-risk goal with documentation hint — governor allow under NORMAL. */
function allowPortfolio() {
  const store = new GoalStore();
  store.create({
    id: "goal-doc",
    desired_outcome: "Generate report",
    risk_policy: "low capability=documentation",
    non_goals: ["capability:documentation"],
    success_criteria_refs: ["c-presence"],
  });
  store.accept("goal-doc", { reason: "accept" });
  store.activate("goal-doc", { reason: "activate" });
  return store.portfolio("pf-allow");
}

/** High risk → confirm under NORMAL. */
function confirmPortfolio() {
  const store = new GoalStore();
  store.create({
    id: "goal-high",
    desired_outcome: "Deploy production",
    risk_policy: "high",
    constraints: ["no-prod-without-gate"],
    success_criteria_refs: ["c-presence"],
  });
  store.accept("goal-high", { reason: "accept" });
  store.activate("goal-high", { reason: "activate" });
  return store.portfolio("pf-confirm");
}

/** Critical risk → deny. */
function denyPortfolio() {
  const store = new GoalStore();
  store.create({
    id: "goal-crit",
    desired_outcome: "Irreversible wipe",
    risk_policy: "critical",
  });
  store.accept("goal-crit", { reason: "accept" });
  store.activate("goal-crit", { reason: "activate" });
  return store.portfolio("pf-deny");
}

/** Low risk but no capability_hint → needs_planner after allow. */
function needsPlannerPortfolio() {
  const store = new GoalStore();
  store.create({
    id: "goal-plan",
    desired_outcome: "Something novel",
    risk_policy: "low",
    success_criteria_refs: ["c-presence"],
  });
  store.accept("goal-plan", { reason: "accept" });
  store.activate("goal-plan", { reason: "activate" });
  return store.portfolio("pf-plan");
}

function assertNoPassWithoutOracle(report: AgencyRunReport) {
  for (const run of report.runs) {
    if (run.status === "PASS") {
      const o = report.oracle.find((x) => x.goal_id === run.goal_id);
      expect(o?.oracle).toBeTruthy();
      expect(o?.status).toBe("PASS");
      // AR-C01: PASS requires at least one eligible (non-run:) evidence ref
      expect(run.evidence_refs.some((r) => isEligibleEvidenceRef(r))).toBe(true);
      expect(run.evidence_refs.every((r) => !/^run:/i.test(r))).toBe(true);
    }
  }
}

describe("V3 AgencyRuntime adapter", () => {
  const criteriaById = new Map([["c-presence", criterion("c-presence")]]);

  it("denies critical proposals with BLOCKED and never calls engine semantics", async () => {
    const engine = setupEngine();
    const report = await runAgencyRuntime({
      portfolio: denyPortfolio(),
      world: worldStub(),
      policy: policySnapshot(),
      safety_state: "NORMAL",
      engine,
      registry: testRegistry,
      criteriaById,
    });

    expect(report.proposals).toHaveLength(1);
    expect(report.decisions[0]!.action).toBe("deny");
    expect(report.runs[0]!.status).toBe("BLOCKED");
    expect(report.runs[0]!.executed).toBe(false);
    expect(report.runs[0]!.bridge_status).toBe("skipped");
    expect(report.human_gates).toHaveLength(0);
    expect(report.containment.length).toBeGreaterThanOrEqual(1);
    expect(report.stagnation).toBeTruthy();
    assertNoPassWithoutOracle(report);
  });

  it("skips confirm without approval as UNCERTAIN + human_gates", async () => {
    const report = await runAgencyRuntime({
      portfolio: confirmPortfolio(),
      world: worldStub(),
      policy: policySnapshot(),
      safety_state: "NORMAL",
      engine: setupEngine(),
      registry: testRegistry,
      criteriaById,
    });

    expect(report.decisions[0]!.action).toBe("confirm");
    expect(report.runs[0]!.status).toBe("UNCERTAIN");
    expect(report.runs[0]!.executed).toBe(false);
    expect(report.human_gates).toHaveLength(1);
    expect(report.human_gates[0]!.approved).toBe(false);
    assertNoPassWithoutOracle(report);
  });

  it("allow + hint runs engine; PASS only with eligible evidence (never synthetic run:)", async () => {
    const report = await runAgencyRuntime({
      portfolio: allowPortfolio(),
      world: new WorldModelStore(),
      policy: policySnapshot(),
      safety_state: "NORMAL",
      engine: setupEngine(),
      registry: testRegistry,
      criteriaById,
    });

    expect(report.decisions[0]!.action).toBe("allow");
    expect(report.runs).toHaveLength(1);
    expect(report.runs[0]!.executed).toBe(true);
    expect(report.runs[0]!.bridge_status).toBe("ir");
    expect(report.runs[0]!.feature_id).toBe("goal-doc");
    expect(report.runs[0]!.engine?.finished).toBe(true);
    // AR-C01: no synthetic run: stamps
    expect(report.runs[0]!.evidence_refs.every((r) => !/^run:/i.test(r))).toBe(true);

    if (report.runs[0]!.evidence_refs.length === 0) {
      // Engine success alone → PARTIAL, never oracle PASS
      expect(report.runs[0]!.status).toBe("PARTIAL");
      expect(report.oracle[0]!.status).toBe("PARTIAL");
    } else {
      expect(report.oracle[0]!.oracle).toBeTruthy();
      if (report.runs[0]!.status === "PASS") {
        expect(report.oracle[0]!.status).toBe("PASS");
      }
    }
    assertNoPassWithoutOracle(report);
  });

  it("AR-C01: synthetic run: refs do not satisfy presence_of_evidence", () => {
    const c = criterion("c-presence");
    const rejected = evaluateCriterion(c, {
      evidence_refs: ["run:goal-doc:finished", "run:feature:state"],
    });
    expect(rejected.pass).toBe(false);
    expect(rejected.rationale).toMatch(/evidence:|run:\*/i);
    expect(isEligibleEvidenceRef("run:x:y")).toBe(false);
    expect(isEligibleEvidenceRef("evidence:r1:n1")).toBe(true);
    expect(isEligibleEvidenceRef("/bare/path")).toBe(false);
  });

  it("AR-H02: degrade skips ExecutionEngine and emits DEGRADED", async () => {
    const report = await runAgencyRuntime({
      portfolio: allowPortfolio(),
      world: worldStub(),
      policy: policySnapshot(),
      safety_state: "RESTRICTED", // low risk → degrade
      engine: setupEngine(),
      registry: testRegistry,
      criteriaById,
    });

    expect(report.decisions[0]!.action).toBe("degrade");
    expect(report.runs[0]!.status).toBe("DEGRADED");
    expect(report.runs[0]!.executed).toBe(false);
    expect(report.runs[0]!.bridge_status).toBe("skipped");
    expect(report.runs[0]!.reason).toMatch(/skipped/i);
    expect(report.containment.some((c) => c.outcome === "DEGRADED")).toBe(true);
    assertNoPassWithoutOracle(report);
  });

  it("AR-C02: FAIL/BLOCKED path wires containment + stagnation into report", async () => {
    const report = await runAgencyRuntime({
      portfolio: denyPortfolio(),
      world: worldStub(),
      policy: policySnapshot(),
      safety_state: "NORMAL",
      engine: setupEngine(),
      registry: testRegistry,
      criteriaById,
    });

    expect(report.runs[0]!.status).toBe("BLOCKED");
    expect(report.containment.length).toBeGreaterThanOrEqual(1);
    expect(report.containment[0]!.containment.action).toBeTruthy();
    expect(report.stagnation).toMatchObject({
      stagnant: expect.any(Boolean),
      signals: expect.any(Array),
      recommended_action: expect.any(String),
    });
    expect(report.safety_state_after).toBeTruthy();
  });

  it("needs_planner without fixture returns NOT_MEASURED and does not invent IR", async () => {
    const report = await runAgencyRuntime({
      portfolio: needsPlannerPortfolio(),
      world: worldStub(),
      policy: policySnapshot(),
      safety_state: "NORMAL",
      engine: setupEngine(),
      registry: testRegistry,
      criteriaById,
      use_fabric: false,
    });

    expect(report.runs[0]!.status).toBe("NOT_MEASURED");
    expect(report.runs[0]!.bridge_status).toBe("needs_planner");
    expect(report.runs[0]!.executed).toBe(false);
    expect(report.runs[0]!.reason).toMatch(/needs_planner/);
    assertNoPassWithoutOracle(report);
  });

  it("needs_planner with explicit loginDashboardIR fixture runs engine", async () => {
    const report = await runAgencyRuntime({
      portfolio: needsPlannerPortfolio(),
      world: worldStub(),
      policy: policySnapshot(),
      safety_state: "NORMAL",
      engine: setupEngine(),
      registry: testRegistry,
      criteriaById,
      use_fabric: false,
      ir_fixtures: { "goal-plan": loginDashboardIR },
    });

    expect(report.runs[0]!.executed).toBe(true);
    expect(report.runs[0]!.bridge_status).toBe("needs_planner");
    expect(report.runs[0]!.engine?.finished).toBe(true);
    // Fixture harness may PASS only with eligible evidence — never synthetic run:
    expect(report.runs[0]!.evidence_refs.every((r) => !/^run:/i.test(r))).toBe(true);
    assertNoPassWithoutOracle(report);
  });

  it("confirm with approval proceeds to IR / fixture path", async () => {
    const report = await runAgencyRuntime({
      portfolio: confirmPortfolio(),
      world: worldStub(),
      policy: policySnapshot(),
      safety_state: "NORMAL",
      engine: setupEngine(),
      registry: testRegistry,
      criteriaById,
      approvals: ["goal-high"],
      ir_fixtures: { "goal-high": loginDashboardIR },
      // SEC-001: high risk requires host-declared attestation (not OS sandbox)
      sandbox_attestation: true,
    });

    expect(report.decisions[0]!.action).toBe("confirm");
    expect(report.human_gates[0]!.approved).toBe(true);
    expect(report.runs[0]!.executed).toBe(true);
    assertNoPassWithoutOracle(report);
  });

  it("SEC-001: high risk without sandbox_attestation is BLOCKED (fail-closed)", async () => {
    const report = await runAgencyRuntime({
      portfolio: confirmPortfolio(),
      world: worldStub(),
      policy: policySnapshot(),
      safety_state: "NORMAL",
      engine: setupEngine(),
      registry: testRegistry,
      criteriaById,
      approvals: ["goal-high"],
      ir_fixtures: { "goal-high": loginDashboardIR },
    });

    expect(report.decisions[0]!.action).toBe("confirm");
    expect(report.runs[0]!.status).toBe("BLOCKED");
    expect(report.runs[0]!.executed).toBe(false);
    expect(report.runs[0]!.reason).toBe("sandbox_attestation_required");
    assertNoPassWithoutOracle(report);
  });

  it("SEC-001: SafetySandboxContext depth can satisfy attestation without flag", async () => {
    const report = await runAgencyRuntime({
      portfolio: confirmPortfolio(),
      world: worldStub(),
      policy: policySnapshot(),
      safety_state: "NORMAL",
      engine: setupEngine(),
      registry: testRegistry,
      criteriaById,
      approvals: ["goal-high"],
      ir_fixtures: { "goal-high": loginDashboardIR },
      safety_sandbox: {
        apiVersion: V3_API_VERSION,
        kind: "SafetySandboxContext",
        metadata: { schema_version: V3_SCHEMA_VERSION },
        spec: {
          safety_state: "NORMAL",
          sandbox_depth: "S3", // DESTRUCTIVE min for high risk
          updated_at: "2026-09-24T00:00:00.000Z",
        },
      },
    });

    expect(report.runs[0]!.executed).toBe(true);
    expect(report.runs[0]!.reason).not.toBe("sandbox_attestation_required");
    assertNoPassWithoutOracle(report);
  });

  it("AgencyRuntime class delegates to runAgencyRuntime", async () => {
    const runtime = new AgencyRuntime({
      safety_state: "NORMAL",
      registry: testRegistry,
      criteriaById,
    });
    const report = await runtime.run({
      portfolio: denyPortfolio(),
      world: worldStub(),
      policy: policySnapshot(),
      safety_state: "NORMAL",
      engine: setupEngine(),
    });
    expect(report.runs[0]!.status).toBe("BLOCKED");
  });
});
