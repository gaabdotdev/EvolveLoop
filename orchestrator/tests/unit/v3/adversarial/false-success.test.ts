/**
 * Adversarial red-team: try to make FALSE SUCCESS look like PASS / oracle success.
 * Each attack asserts the system REJECTS the bad outcome (or documents OPEN via it.fails).
 */
import { describe, it, expect } from "vitest";
import {
  V3_API_VERSION,
  V3_SCHEMA_VERSION,
  GoalStore,
  AgencyLoop,
  AgencyRuntime,
  runAgencyRuntime,
  evaluateGoal,
  evaluateCriterion,
  isEligibleEvidenceRef,
  selectGovernorAction,
  FAKE_EVIDENCE_PREFIX_ATTACKS,
  NARRATIVE_EVIDENCE_ATTACKS,
  legitimateEvidenceBundle,
  executorIsVerifierBundle,
  allRefsIneligible,
  EXECUTOR_ID,
  VERIFIER_ID,
  type SuccessOracleCriterion,
} from "../../../../src/v3/index.js";
import {
  ExecutionEngine,
  ProviderRouter,
  createMockProvider,
} from "../../../../src/index.js";
import { testRegistry } from "../../../fixtures/login-dashboard.js";

function criterion(
  id: string,
  method = "presence_of_evidence",
): SuccessOracleCriterion {
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
      verification_method: method,
      status: "pending",
    },
  };
}

function activate(store: GoalStore, id: string): void {
  store.accept(id, { reason: "accept", actor: "rt" });
  store.activate(id, { reason: "activate", actor: "rt" });
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

describe("Adversarial RT — false success must be rejectable", () => {
  // -------------------------------------------------------------------------
  // 1. Fake evidence ref with wrong prefix
  // -------------------------------------------------------------------------
  it("RT-01: fake/plausible wrong prefixes must NOT satisfy presence_of_evidence", () => {
    const c = criterion("c-fake");
    expect(allRefsIneligible(FAKE_EVIDENCE_PREFIX_ATTACKS)).toBe(true);

    const result = evaluateCriterion(c, {
      evidence_refs: [...FAKE_EVIDENCE_PREFIX_ATTACKS],
    });
    expect(result.pass).toBe(false);
    expect(result.status).toBe("unmet");
    for (const ref of FAKE_EVIDENCE_PREFIX_ATTACKS) {
      expect(isEligibleEvidenceRef(ref)).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // 2. Engine success + empty evidence → must NOT be oracle PASS
  // -------------------------------------------------------------------------
  it("RT-02: engine success with empty eligible evidence must NOT oracle PASS", async () => {
    const store = new GoalStore();
    store.create({
      id: "goal-empty-ev",
      desired_outcome: "Generate report",
      risk_policy: "low capability=documentation",
      non_goals: ["capability:documentation"],
      success_criteria_refs: ["c-presence"],
    });
    activate(store, "goal-empty-ev");

    const report = await runAgencyRuntime({
      portfolio: store.portfolio("pf-rt02"),
      world: {
        snapshot_id: "w",
        observed_at: "2026-09-24T00:00:00.000Z",
      },
      policy: {
        snapshot_id: "p",
        policy_ref: "rapid-prototype",
        captured_at: "2026-09-24T00:00:00.000Z",
      },
      safety_state: "NORMAL",
      engine: setupEngine(),
      registry: testRegistry,
      criteriaById: new Map([["c-presence", criterion("c-presence")]]),
    });

    expect(report.runs[0]!.executed).toBe(true);
    // If engine produced no eligible refs, never promote to PASS
    if (report.runs[0]!.evidence_refs.length === 0) {
      expect(report.runs[0]!.status).not.toBe("PASS");
      expect(report.oracle[0]!.status).not.toBe("PASS");
    } else {
      // Eligible evidence path still must not claim PASS without oracle object
      if (report.runs[0]!.status === "PASS") {
        expect(report.oracle[0]!.oracle).toBeTruthy();
      }
    }
    expect(report.oracle.some((o) => o.status === "PASS" && !o.oracle)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 3. Artifact path as evidence without evidence: prefix
  // -------------------------------------------------------------------------
  it("RT-03: bare artifact paths must NOT count as evidence", () => {
    const paths = [
      "artifacts/out/report.json",
      "/tmp/build/dist/app.js",
      "./evidence/fake-proof.bin",
      "out/coverage/lcov.info",
    ];
    const c = criterion("c-path");
    const result = evaluateCriterion(c, { evidence_refs: paths });
    expect(result.pass).toBe(false);
    expect(allRefsIneligible(paths)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 4. Agent claim / narrative in rationale as evidence
  // -------------------------------------------------------------------------
  it("RT-04: agent narrative / rationale text must NOT be eligible evidence", () => {
    const c = criterion("c-narr");
    expect(allRefsIneligible(NARRATIVE_EVIDENCE_ATTACKS)).toBe(true);
    const result = evaluateCriterion(c, {
      evidence_refs: [...NARRATIVE_EVIDENCE_ATTACKS],
    });
    expect(result.pass).toBe(false);
    expect(result.status).toBe("unmet");
  });

  // -------------------------------------------------------------------------
  // 5. Stale evidence_id reused after goal mutation
  // -------------------------------------------------------------------------
  it("RT-05: evidence stamped under older goal revision must NOT yield success", () => {
    const store = new GoalStore();
    store.create({
      id: "g-stale",
      desired_outcome: "v1 outcome",
      success_criteria_refs: ["c1"],
    });
    activate(store, "g-stale");
    const revBefore = store.get("g-stale")!.spec.goal_version.revision;

    store.mutateSpec(
      "g-stale",
      { desired_outcome: "v2 completely different outcome" },
      { reason: "scope change", actor: "rt" },
    );
    const goal = store.get("g-stale")!;
    expect(goal.spec.goal_version.revision).toBeGreaterThan(revBefore);

    const map = new Map([["c1", criterion("c1")]]);
    const stale = evaluateGoal(
      goal,
      map,
      legitimateEvidenceBundle(["evidence:old-run:node"], {
        evidence_goal_revision: revBefore,
      }),
    );
    expect(stale.decision).not.toBe("success");
    expect(stale.proof.spec.assumptions.some((a) => /stale/i.test(a))).toBe(true);
  });

  /**
   * RT-05b FIXED: omitting evidence_goal_revision after mutation must refuse success.
   */
  it(
    "RT-05b: omitting revision stamp after mutation must still refuse success",
    () => {
      const store = new GoalStore();
      store.create({
        id: "g-stale2",
        desired_outcome: "old",
        success_criteria_refs: ["c1"],
      });
      activate(store, "g-stale2");
      store.mutateSpec(
        "g-stale2",
        { desired_outcome: "new unmet outcome" },
        { reason: "mutate", actor: "rt" },
      );
      const map = new Map([["c1", criterion("c1")]]);
      // Attack: reuse old refs with executor≠verifier but NO revision binding
      const attack = evaluateGoal(store.get("g-stale2")!, map, {
        evidence_refs: ["evidence:pre-mutation:node"],
        executor_id: EXECUTOR_ID,
        verifier_id: VERIFIER_ID,
        outcome_met: true,
      });
      expect(attack.decision).not.toBe("success");
      expect(
        attack.proof.spec.assumptions.some((a) => /evidence_goal_revision required/i.test(a)),
      ).toBe(true);
    },
  );

  // -------------------------------------------------------------------------
  // 6. Same object as executor and verifier
  // -------------------------------------------------------------------------
  it("RT-06: executor_id === verifier_id must NOT yield success", () => {
    const store = new GoalStore();
    store.create({
      id: "g-self",
      desired_outcome: "self-verify",
      success_criteria_refs: ["c1"],
    });
    activate(store, "g-self");
    const map = new Map([["c1", criterion("c1")]]);
    const same = evaluateGoal(
      store.get("g-self")!,
      map,
      executorIsVerifierBundle(["evidence:self:node"]),
    );
    expect(same.decision).not.toBe("success");

    const missing = evaluateGoal(store.get("g-self")!, map, {
      evidence_refs: ["evidence:self:node"],
    });
    expect(missing.decision).not.toBe("success");

    const ok = evaluateGoal(
      store.get("g-self")!,
      map,
      legitimateEvidenceBundle(["evidence:self:node"], {
        evidence_goal_revision: store.get("g-self")!.spec.goal_version.revision,
        outcome_met: true,
      }),
    );
    expect(ok.decision).toBe("success");
  });

  // -------------------------------------------------------------------------
  // 7. Policy / governor deny path must not execute
  // -------------------------------------------------------------------------
  it("RT-07: governor deny must not execute engine (no false PASS)", async () => {
    const store = new GoalStore();
    store.create({
      id: "goal-crit",
      desired_outcome: "Irreversible wipe",
      risk_policy: "critical",
      success_criteria_refs: ["c-presence"],
    });
    activate(store, "goal-crit");

    let engineCalls = 0;
    const engine = setupEngine();
    const origRun = engine.run.bind(engine);
    engine.run = async (req) => {
      engineCalls += 1;
      return origRun(req);
    };

    const report = await runAgencyRuntime({
      portfolio: store.portfolio("pf-deny"),
      world: { snapshot_id: "w", observed_at: "2026-09-24T00:00:00.000Z" },
      policy: {
        snapshot_id: "p",
        policy_ref: "rapid-prototype",
        captured_at: "2026-09-24T00:00:00.000Z",
      },
      safety_state: "NORMAL",
      engine,
      registry: testRegistry,
      criteriaById: new Map([["c-presence", criterion("c-presence")]]),
    });

    expect(report.decisions[0]!.action).toBe("deny");
    expect(report.runs[0]!.executed).toBe(false);
    expect(report.runs[0]!.status).toBe("BLOCKED");
    expect(engineCalls).toBe(0);
    expect(report.oracle.every((o) => o.status !== "PASS")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 8. Governor degrade must not execute (regression)
  // -------------------------------------------------------------------------
  it("RT-08: governor degrade must skip ExecutionEngine (regression)", async () => {
    const store = new GoalStore();
    store.create({
      id: "goal-doc",
      desired_outcome: "Generate report",
      risk_policy: "low capability=documentation",
      non_goals: ["capability:documentation"],
      success_criteria_refs: ["c-presence"],
    });
    activate(store, "goal-doc");

    let engineCalls = 0;
    const engine = setupEngine();
    const origRun = engine.run.bind(engine);
    engine.run = async (req) => {
      engineCalls += 1;
      return origRun(req);
    };

    const report = await runAgencyRuntime({
      portfolio: store.portfolio("pf-deg"),
      world: { snapshot_id: "w", observed_at: "2026-09-24T00:00:00.000Z" },
      policy: {
        snapshot_id: "p",
        policy_ref: "rapid-prototype",
        captured_at: "2026-09-24T00:00:00.000Z",
      },
      safety_state: "RESTRICTED",
      engine,
      registry: testRegistry,
      criteriaById: new Map([["c-presence", criterion("c-presence")]]),
    });

    expect(report.decisions[0]!.action).toBe("degrade");
    expect(report.runs[0]!.executed).toBe(false);
    expect(report.runs[0]!.status).toBe("DEGRADED");
    expect(engineCalls).toBe(0);
    expect(report.oracle.every((o) => o.status !== "PASS")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 9. Criteria presence met but desired_outcome explicitly unmet
  // -------------------------------------------------------------------------
  it("RT-09: outcome_met=false must block success despite eligible evidence", () => {
    const store = new GoalStore();
    store.create({
      id: "g-outcome",
      desired_outcome: "Ship production release with signed artifacts",
      success_criteria_refs: ["c-tasks"],
    });
    activate(store, "g-outcome");
    const map = new Map([["c-tasks", criterion("c-tasks")]]);

    // "All tasks done" via presence refs, but outcome explicitly unmet
    const result = evaluateGoal(
      store.get("g-outcome")!,
      map,
      legitimateEvidenceBundle(["evidence:tasks:all-done"], {
        outcome_met: false,
      }),
    );
    expect(result.decision).not.toBe("success");
    expect(result.proof.spec.requested_outcome).toContain("Ship production");
  });

  /**
   * RT-09b FIXED: presence_of_evidence without outcome_met must not claim success
   * when desired_outcome is set.
   */
  it(
    "RT-09b: presence-only without outcome_met must not claim success",
    () => {
      const store = new GoalStore();
      store.create({
        id: "g-outcome2",
        desired_outcome: "Ship production release",
        success_criteria_refs: ["c-tasks"],
      });
      activate(store, "g-outcome2");
      const map = new Map([["c-tasks", criterion("c-tasks")]]);
      const result = evaluateGoal(
        store.get("g-outcome2")!,
        map,
        legitimateEvidenceBundle(["evidence:tasks:done"], {
          evidence_goal_revision: store.get("g-outcome2")!.spec.goal_version.revision,
        }),
      );
      expect(result.decision).not.toBe("success");
      expect(result.decision).toBe("partial_success");
    },
  );

  it("RT-09b positive: outcome_met:true with matching revision yields success", () => {
    const store = new GoalStore();
    store.create({
      id: "g-outcome-ok",
      desired_outcome: "Ship production release",
      success_criteria_refs: ["c-tasks"],
    });
    activate(store, "g-outcome-ok");
    const map = new Map([["c-tasks", criterion("c-tasks")]]);
    const result = evaluateGoal(
      store.get("g-outcome-ok")!,
      map,
      legitimateEvidenceBundle(["evidence:tasks:done"], {
        evidence_goal_revision: store.get("g-outcome-ok")!.spec.goal_version.revision,
        outcome_met: true,
      }),
    );
    expect(result.decision).toBe("success");
  });

  // -------------------------------------------------------------------------
  // 10. World model contradiction must not stay on silent ALLOW (low risk)
  // -------------------------------------------------------------------------
  it("RT-10: world contradiction must not leave low-risk on ALLOW", () => {
    const store = new GoalStore();
    store.create({
      id: "g-contr",
      desired_outcome: "Stay healthy",
      risk_policy: "low capability=documentation",
      non_goals: ["capability:documentation"],
      success_criteria_refs: ["c1"],
    });
    activate(store, "g-contr");

    const loop = new AgencyLoop();
    const result = loop.step({
      portfolio: store.portfolio("pf-contr"),
      world: {
        snapshot_id: "wm-bad",
        observed_at: "2026-09-24T00:00:00.000Z",
        open_signals: ["contradictory:belief-a-vs-b", "invalidates:b-old"],
        belief_ids: ["b-a", "b-b"],
      },
      policy: {
        snapshot_id: "p1",
        policy_ref: "default",
        captured_at: "2026-09-24T00:00:00.000Z",
      },
    });

    expect(result.proposals).toHaveLength(1);
    const proposal = result.proposals[0]!;
    expect(proposal.rationale).toMatch(/contradict/i);
    // Must escalate off silent allow path (confirm or deny under NORMAL)
    const action = selectGovernorAction(proposal.risk, "NORMAL");
    expect(action).not.toBe("allow");
    expect(["confirm", "deny"]).toContain(action);
  });

  it("RT-smoke: AgencyRuntime class still constructs after hardening exports", async () => {
    const runtime = new AgencyRuntime({ safety_state: "NORMAL" });
    expect(runtime).toBeTruthy();
  });
});
