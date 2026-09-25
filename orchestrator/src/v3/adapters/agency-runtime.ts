/**
 * Agency → ExecutionEngine runtime adapter (thin integration path).
 *
 * Flow: AgencyLoop.step → AutonomyGovernor.decide → IR skeleton | needs_planner
 *       → sandbox attestation gate (SEC-001) → ExecutionEngine.run
 *       → SuccessOracle → classifyOutcome / StagnationDetector / selectContainment.
 *
 * Prohibits inventing IR when needs_planner (unless caller supplies an explicit
 * fixture). Never claims PASS without oracle evaluation on eligible evidence.
 *
 * Limits (honest): no OS sandbox — `sandbox_attestation` / env / SafetySandboxContext
 * depth are host-declared readiness signals only (NOT OS isolation);
 * degrade skips run (does not constrain Policy); multi-step fabric → needs_planner;
 * world grounding is signal/risk bump only.
 */

import type { ExecutionEngine } from "../../engine/execution-engine.js";
import type { CapabilityIR, CapabilityRegistry, RunResult } from "../../types/index.js";
import { AgencyLoop } from "../agency/agency-loop.js";
import { AutonomyGovernor, type GovernorDecisionResult } from "../agency/governor.js";
import type {
  AgencyLoopResult,
  AgencyProposal,
  GovernorAction,
  PolicySnapshot,
  WorldSnapshot,
} from "../agency/types.js";
import {
  assertEffectAllowedAtDepth,
  sandboxDepthMeetsRequirement,
} from "../contracts/enforcement.js";
import {
  DEFAULT_SANDBOX_DEPTH_REQUIREMENTS,
  type AutonomyGovernorDecision,
  type EffectClassification,
  type GoalContract,
  type SafetySandboxContext,
  type SafetyState,
  type SandboxDepth,
  type SuccessOracleCriterion,
} from "../contracts/types.js";
import { proposalToCapabilityIRWithFabric } from "../fabric/bridge.js";
import { classifyOutcome } from "../failure/classify-outcome.js";
import {
  selectContainment,
  type ContainmentDecision,
} from "../failure/containment.js";
import { StagnationDetector } from "../failure/stagnation.js";
import {
  evaluateSafetyTransition,
  transitionSafetyState,
} from "../failure/safety-transitions.js";
import type {
  OutcomeStatus,
  StagnationReport,
  SafetyTransitionResult,
} from "../failure/types.js";
import type { GoalPortfolio } from "../goals/goal-store.js";
import {
  SuccessOracle,
  filterEligibleEvidenceRefs,
  type EvidenceRefBundle,
  type OracleEvalResult,
} from "../goals/success-oracle.js";
import type { WorldModelStore } from "../world-model/world-model-store.js";

/** Host env flag for sandbox attestation until OS sandbox exists (SEC-001). */
export const SANDBOX_ATTESTATION_ENV = "EVOLVELOOP_SANDBOX_ATTESTATION";

const EFFECT_HINT_PATTERNS: Array<{
  hint: "LOCAL_WRITE" | "DESTRUCTIVE" | "NETWORK";
  re: RegExp;
}> = [
  { hint: "LOCAL_WRITE", re: /\bLOCAL_WRITE\b|local[_-]?write|filesystem\.write|\.write\b/i },
  { hint: "DESTRUCTIVE", re: /\bDESTRUCTIVE\b|destructive|irreversible|wipe|rm\s+-rf/i },
  { hint: "NETWORK", re: /\bNETWORK\b|network|http\b|fetch\b|browser\./i },
];

/**
 * Infer destructive / write / network effect hints from proposal text surfaces.
 * Fail-closed: explicit tokens only — does not invent effects from silence.
 */
export function inferEffectHints(
  proposal: AgencyProposal,
): Array<"LOCAL_WRITE" | "DESTRUCTIVE" | "NETWORK"> {
  const haystack = [proposal.intent, proposal.capability_hint ?? "", proposal.rationale ?? ""].join(
    " ",
  );
  const found = new Set<"LOCAL_WRITE" | "DESTRUCTIVE" | "NETWORK">();
  for (const { hint, re } of EFFECT_HINT_PATTERNS) {
    if (re.test(haystack)) found.add(hint);
  }
  return [...found];
}

export function requiresSandboxAttestation(proposal: AgencyProposal): boolean {
  if (proposal.risk === "high" || proposal.risk === "critical") return true;
  return inferEffectHints(proposal).length > 0;
}

function effectHintToClassification(
  hint: "LOCAL_WRITE" | "DESTRUCTIVE" | "NETWORK",
): EffectClassification {
  if (hint === "NETWORK") return "COMMUNICATION";
  return hint;
}

/** Stricter (higher) of two sandbox depths. */
function maxSandboxDepth(a: SandboxDepth, b: SandboxDepth): SandboxDepth {
  return sandboxDepthMeetsRequirement(a, b) ? a : b;
}

/**
 * Minimum host-declared sandbox depth for this proposal (schema only — not OS).
 * high → DESTRUCTIVE (S3); critical → IRREVERSIBLE (S4); plus effect-hint mins.
 */
export function requiredDepthForProposal(proposal: AgencyProposal): SandboxDepth {
  let out: SandboxDepth = "S0";
  if (proposal.risk === "critical") {
    out = maxSandboxDepth(out, DEFAULT_SANDBOX_DEPTH_REQUIREMENTS.IRREVERSIBLE);
  } else if (proposal.risk === "high") {
    out = maxSandboxDepth(out, DEFAULT_SANDBOX_DEPTH_REQUIREMENTS.DESTRUCTIVE);
  }
  for (const hint of inferEffectHints(proposal)) {
    out = maxSandboxDepth(
      out,
      DEFAULT_SANDBOX_DEPTH_REQUIREMENTS[effectHintToClassification(hint)],
    );
  }
  return out;
}

/**
 * Host-declared attestation OR SafetySandboxContext depth meeting
 * DEFAULT_SANDBOX_DEPTH_REQUIREMENTS for inferred effects / risk.
 * Does NOT claim OS process isolation — NOT_IMPLEMENTED.
 */
export function hasSandboxAttestation(
  options: Pick<AgencyRuntimeOptions, "sandbox_attestation" | "safety_sandbox">,
  proposal: AgencyProposal,
): boolean {
  if (options.sandbox_attestation === true) return true;
  const env = process.env[SANDBOX_ATTESTATION_ENV];
  if (env === "1" || env === "true" || env === "yes") return true;

  const ctx = options.safety_sandbox;
  if (!ctx) return false;

  const depth = ctx.spec.sandbox_depth;
  const required = requiredDepthForProposal(proposal);
  if (!sandboxDepthMeetsRequirement(depth, required)) return false;

  // When context declares effect_classes, each must also pass FW-H02.
  const classes = ctx.spec.effect_classes;
  if (classes && classes.length > 0) {
    for (const cls of classes) {
      if (!assertEffectAllowedAtDepth(cls, depth).valid) return false;
    }
  }
  return true;
}

export type { OutcomeStatus };

export interface HumanGateRecord {
  proposal_id: string;
  goal_id: string;
  action: GovernorAction;
  reason: string;
  approved: boolean;
}

export interface AgencyRunEntry {
  proposal_id: string;
  goal_id: string;
  feature_id: string;
  status: OutcomeStatus;
  reason?: string;
  bridge_status: "ir" | "needs_planner" | "skipped";
  /** True only when ExecutionEngine.run was invoked. */
  executed: boolean;
  engine?: Pick<RunResult, "success" | "finished" | "state" | "blocked_reason">;
  evidence_refs: string[];
  /** Set when fabric multi-step was refused or marked pending. */
  composition_pending?: boolean;
}

export interface AgencyOracleEntry {
  goal_id: string;
  status: OutcomeStatus;
  oracle?: OracleEvalResult;
  reason?: string;
}

export interface AgencyContainmentEntry {
  proposal_id: string;
  goal_id: string;
  outcome: OutcomeStatus;
  containment: ContainmentDecision;
  safety_transition?: SafetyTransitionResult;
}

export interface AgencyRunReport {
  proposals: AgencyProposal[];
  decisions: Array<{
    proposal_id: string;
    action: GovernorAction;
    level: GovernorDecisionResult["level"];
    decision: AutonomyGovernorDecision;
  }>;
  runs: AgencyRunEntry[];
  oracle: AgencyOracleEntry[];
  human_gates: HumanGateRecord[];
  agency: AgencyLoopResult;
  /** Failure-module containment decisions (AR-C02). */
  containment: AgencyContainmentEntry[];
  /** Stagnation window after this tick. */
  stagnation: StagnationReport;
  /** Safety state after applying quarantine transitions (if any). */
  safety_state_after: SafetyState;
  emitted_at: string;
}

export interface AgencyRuntimeOptions {
  portfolio: GoalPortfolio;
  /** Prefer WorldModelStore.toSnapshot(); raw WorldSnapshot also accepted. */
  world: WorldSnapshot | WorldModelStore;
  policy: PolicySnapshot;
  safety_state: SafetyState;
  engine: ExecutionEngine;
  /** Required for fabric enrichment; also used as engine registry context. */
  registry?: CapabilityRegistry;
  /** Criteria registry for SuccessOracle — keyed by criterion_id. */
  criteriaById?: Map<string, SuccessOracleCriterion>;
  /**
   * Proposal ids (or goal ids) that have human approval for confirm gates.
   * Without approval, confirm → skip UNCERTAIN + human_gates entry.
   */
  approvals?: ReadonlySet<string> | readonly string[];
  /**
   * Explicit IR fixtures for needs_planner gaps (tests / host injection).
   * Keys: proposal_id or goal_id. Never invented by this adapter.
   */
  ir_fixtures?: ReadonlyMap<string, CapabilityIR> | Record<string, CapabilityIR>;
  /** When true and registry present, use proposalToCapabilityIRWithFabric. Default true. */
  use_fabric?: boolean;
  risk_by_goal?: Record<string, AgencyProposal["risk"]>;
  authority?: string;
  environment?: string;
  confidence?: number;
  agency?: AgencyLoop;
  governor?: AutonomyGovernor;
  oracle?: SuccessOracle;
  /** Shared stagnation detector across ticks (optional). */
  stagnation?: StagnationDetector;
  /** policy_id passed to ExecutionEngine.run; defaults to policy.policy_ref. */
  policy_id?: string;
  /**
   * SEC-001 (partial): host-declared sandbox attestation.
   * True means the host asserts readiness for high-risk / destructive effects.
   * This is NOT OS isolation — full OS sandbox remains NOT_IMPLEMENTED.
   * Also accepted via env `EVOLVELOOP_SANDBOX_ATTESTATION=true|1|yes`.
   */
  sandbox_attestation?: boolean;
  /**
   * Optional SafetySandboxContext — when depth >= DEFAULT_SANDBOX_DEPTH_REQUIREMENTS
   * for the proposal's risk/effect hints, satisfies attestation without the flag.
   * Schema/policy signal only; does not provision an OS sandbox.
   */
  safety_sandbox?: SafetySandboxContext;
}

function asApprovalSet(
  approvals?: ReadonlySet<string> | readonly string[],
): Set<string> {
  if (!approvals) return new Set();
  return approvals instanceof Set ? new Set(approvals) : new Set(approvals);
}

function asFixtureMap(
  fixtures?: ReadonlyMap<string, CapabilityIR> | Record<string, CapabilityIR>,
): Map<string, CapabilityIR> {
  if (!fixtures) return new Map();
  if (fixtures instanceof Map) return new Map(fixtures);
  return new Map(Object.entries(fixtures));
}

function resolveWorld(world: WorldSnapshot | WorldModelStore): WorldSnapshot {
  if (typeof (world as WorldModelStore).toSnapshot === "function") {
    return (world as WorldModelStore).toSnapshot();
  }
  return world as WorldSnapshot;
}

/**
 * Collect refs only from real Evidence objects on the run result.
 * AR-C01: NEVER inject synthetic `run:<feature>:<state>` stamps.
 */
function evidenceRefsFromRun(result: RunResult): string[] {
  const refs: string[] = [];
  for (const ev of result.evidence) {
    const node = ev.metadata.node_id;
    const run = ev.metadata.run_id;
    refs.push(`evidence:${run}:${node}`);
    if (ev.metadata.provider_id) {
      refs.push(`provider:${ev.metadata.provider_id}`);
    }
    for (const art of ev.spec.artifacts ?? []) {
      if (art.path) refs.push(art.path);
    }
    for (const check of ev.spec.checks ?? []) {
      if (check.dod_id) refs.push(`check:${check.dod_id}`);
    }
  }
  return filterEligibleEvidenceRefs(refs);
}

function mapOracleDecision(decision: OracleEvalResult["decision"]): OutcomeStatus {
  switch (decision) {
    case "success":
      return "PASS";
    case "failure":
      return "FAIL";
    case "partial_success":
      return "PARTIAL";
    case "uncertain":
    default:
      return "UNCERTAIN";
  }
}

function provisionalFromEngine(result: RunResult): OutcomeStatus {
  // Engine success alone is never PASS — only PARTIAL until oracle + eligible evidence.
  if (result.success) return "PARTIAL";
  if (result.blocked_reason) return "BLOCKED";
  return "FAIL";
}

function hasApproval(
  proposal: AgencyProposal,
  approvals: Set<string>,
): boolean {
  return approvals.has(proposal.proposal_id) || approvals.has(proposal.goal_id);
}

function lookupFixture(
  proposal: AgencyProposal,
  fixtures: Map<string, CapabilityIR>,
): CapabilityIR | undefined {
  return fixtures.get(proposal.proposal_id) ?? fixtures.get(proposal.goal_id);
}

function findGoal(portfolio: GoalPortfolio, goalId: string): GoalContract | undefined {
  return portfolio.goals.find((g) => g.metadata.id === goalId);
}

function shouldContain(outcome: OutcomeStatus, stagnant: boolean): boolean {
  if (stagnant) return true;
  return (
    outcome === "FAIL" ||
    outcome === "BLOCKED" ||
    outcome === "UNCERTAIN" ||
    outcome === "NOT_MEASURED" ||
    outcome === "DEGRADED" ||
    outcome === "PARTIAL"
  );
}

function applyContainmentSafety(
  from: SafetyState,
  containment: ContainmentDecision,
): { state: SafetyState; transition?: SafetyTransitionResult } {
  const hint = containment.safety_hint;
  if (hint === "unchanged") {
    return { state: from };
  }

  const to = hint as SafetyState;
  const transition = evaluateSafetyTransition(from, to);
  if (!transition.allowed) {
    return { state: from, transition };
  }

  // Quarantine / restriction transitions apply when containment maps them.
  const next = transitionSafetyState(from, to);
  return { state: next, transition: { ...transition, to: next } };
}

/**
 * One Agency tick wired through Governor → IR/fixture → ExecutionEngine → Oracle
 * → Failure classify/containment/stagnation.
 * Policy Engine inside ExecutionEngine remains the execution authority.
 */
export async function runAgencyRuntime(
  options: AgencyRuntimeOptions,
): Promise<AgencyRunReport> {
  const emitted_at = new Date().toISOString();
  const agency = options.agency ?? new AgencyLoop();
  const governor = options.governor ?? new AutonomyGovernor();
  const oracle = options.oracle ?? new SuccessOracle();
  const stagnationDetector = options.stagnation ?? new StagnationDetector();
  const approvals = asApprovalSet(options.approvals);
  const fixtures = asFixtureMap(options.ir_fixtures);
  const criteriaById = options.criteriaById ?? new Map();
  const useFabric = options.use_fabric !== false && !!options.registry;
  const policyId = options.policy_id ?? options.policy.policy_ref;
  const world = resolveWorld(options.world);

  let safetyState: SafetyState = options.safety_state;

  const agencyResult = agency.step({
    portfolio: options.portfolio,
    world,
    policy: options.policy,
    risk_by_goal: options.risk_by_goal,
  });

  const decisions: AgencyRunReport["decisions"] = [];
  const runs: AgencyRunEntry[] = [];
  const human_gates: HumanGateRecord[] = [];
  const containmentEntries: AgencyContainmentEntry[] = [];
  const evidenceByGoal = new Map<string, string[]>();

  for (const proposal of agencyResult.proposals) {
    const decided = governor.decide({
      proposal,
      safety_state: safetyState,
      authority: options.authority,
      environment: options.environment,
      confidence: options.confidence,
      policy_ref: options.policy.policy_ref,
    });

    decisions.push({
      proposal_id: proposal.proposal_id,
      action: decided.action,
      level: decided.level,
      decision: decided.decision,
    });

    if (decided.action === "deny") {
      runs.push({
        proposal_id: proposal.proposal_id,
        goal_id: proposal.goal_id,
        feature_id: proposal.goal_id,
        status: "BLOCKED",
        reason: "governor denied proposal",
        bridge_status: "skipped",
        executed: false,
        evidence_refs: [],
      });
      continue;
    }

    // AR-H02: degrade must NOT take the full allow/execute path.
    // Without OS sandbox / restricted Policy, skip ExecutionEngine.run.
    if (decided.action === "degrade") {
      const irreversibleHint =
        proposal.risk === "high" ||
        proposal.risk === "critical" ||
        /irreversible|destructive|wipe|prod/i.test(proposal.intent);

      if (irreversibleHint) {
        human_gates.push({
          proposal_id: proposal.proposal_id,
          goal_id: proposal.goal_id,
          action: "degrade",
          reason:
            "governor degrade — execution skipped; needs_human for irreversible/high-risk intent (no OS sandbox)",
          approved: false,
        });
      }

      runs.push({
        proposal_id: proposal.proposal_id,
        goal_id: proposal.goal_id,
        feature_id: proposal.goal_id,
        status: "DEGRADED",
        reason:
          "governor degrade — ExecutionEngine.run skipped (degrade must not execute full allow path; OS sandbox absent)",
        bridge_status: "skipped",
        executed: false,
        evidence_refs: [],
      });

      const stagn = stagnationDetector.observe({
        action_id: proposal.proposal_id,
        hypothesis_id: proposal.goal_id,
        failure_signature: "DEGRADED",
        state_fingerprint: `degrade:${proposal.goal_id}`,
        at: emitted_at,
      });

      if (shouldContain("DEGRADED", stagn.stagnant)) {
        const containment = selectContainment(
          "action",
          "DEGRADED",
          stagn.stagnant ? { escalate: true } : undefined,
        );
        const applied = applyContainmentSafety(safetyState, containment);
        safetyState = applied.state;
        containmentEntries.push({
          proposal_id: proposal.proposal_id,
          goal_id: proposal.goal_id,
          outcome: "DEGRADED",
          containment,
          safety_transition: applied.transition,
        });
      }
      continue;
    }

    if (decided.action === "confirm" && !hasApproval(proposal, approvals)) {
      human_gates.push({
        proposal_id: proposal.proposal_id,
        goal_id: proposal.goal_id,
        action: "confirm",
        reason: "governor requires human confirm",
        approved: false,
      });
      runs.push({
        proposal_id: proposal.proposal_id,
        goal_id: proposal.goal_id,
        feature_id: proposal.goal_id,
        status: "UNCERTAIN",
        reason: "confirm-required without approval",
        bridge_status: "skipped",
        executed: false,
        evidence_refs: [],
      });
      continue;
    }

    if (decided.action === "confirm" && hasApproval(proposal, approvals)) {
      human_gates.push({
        proposal_id: proposal.proposal_id,
        goal_id: proposal.goal_id,
        action: "confirm",
        reason: "human approval recorded — proceeding to IR",
        approved: true,
      });
    }

    const bridgeAction: GovernorAction =
      decided.action === "confirm" ? "allow" : decided.action;

    const bridge = proposalToCapabilityIRWithFabric(
      proposal,
      bridgeAction,
      useFabric && options.registry
        ? { registry: options.registry }
        : undefined,
    );

    let ir: CapabilityIR | undefined;
    let bridge_status: AgencyRunEntry["bridge_status"];
    let composition_pending = false;

    if (bridge.status === "ir") {
      ir = bridge.ir;
      bridge_status = "ir";
    } else {
      bridge_status = "needs_planner";
      composition_pending = /composition_pending/i.test(bridge.reason);

      // AR-H03: multi-step fabric plan — PARTIAL + composition_pending; never silent steps[0].
      if (composition_pending) {
        runs.push({
          proposal_id: proposal.proposal_id,
          goal_id: proposal.goal_id,
          feature_id: proposal.goal_id,
          status: "PARTIAL",
          reason: bridge.reason,
          bridge_status: "needs_planner",
          executed: false,
          evidence_refs: [],
          composition_pending: true,
        });
        continue;
      }

      const fixture = lookupFixture(proposal, fixtures);
      if (fixture) {
        ir = fixture;
      } else {
        runs.push({
          proposal_id: proposal.proposal_id,
          goal_id: proposal.goal_id,
          feature_id: proposal.goal_id,
          status: "NOT_MEASURED",
          reason: `needs_planner: ${bridge.reason}`,
          bridge_status: "needs_planner",
          executed: false,
          evidence_refs: [],
        });
        continue;
      }
    }

    const feature_id = proposal.goal_id;

    // SEC-001 (partial): fail-closed without host attestation / adequate sandbox depth.
    // Attestation is host-declared until OS sandbox exists — NOT OS isolation.
    if (
      requiresSandboxAttestation(proposal) &&
      !hasSandboxAttestation(options, proposal)
    ) {
      runs.push({
        proposal_id: proposal.proposal_id,
        goal_id: proposal.goal_id,
        feature_id,
        status: "BLOCKED",
        reason: "sandbox_attestation_required",
        bridge_status,
        executed: false,
        evidence_refs: [],
        composition_pending: composition_pending || undefined,
      });
      continue;
    }

    const engineResult = await options.engine.run({
      ir: ir!,
      policy_id: policyId,
      feature_id,
    });

    const evidence_refs = evidenceRefsFromRun(engineResult);
    const prev = evidenceByGoal.get(proposal.goal_id) ?? [];
    evidenceByGoal.set(proposal.goal_id, [...prev, ...evidence_refs]);

    const provisional = provisionalFromEngine(engineResult);
    // Fail-closed classify of engine surface status (never promote success→PASS here).
    const classified = classifyOutcome(
      engineResult.blocked_reason
        ? "BLOCKED"
        : engineResult.success
          ? "PARTIAL"
          : "FAIL",
    );

    runs.push({
      proposal_id: proposal.proposal_id,
      goal_id: proposal.goal_id,
      feature_id,
      status: classified.status === "PASS" ? provisional : classified.status,
      reason:
        bridge_status === "needs_planner"
          ? "executed via explicit ir_fixture (planner unavailable)"
          : engineResult.blocked_reason ??
            (engineResult.success
              ? "engine success — provisional PARTIAL pending eligible oracle evidence"
              : undefined),
      bridge_status,
      executed: true,
      engine: {
        success: engineResult.success,
        finished: engineResult.finished,
        state: engineResult.state,
        blocked_reason: engineResult.blocked_reason,
      },
      evidence_refs,
    });
  }

  const oracleEntries: AgencyOracleEntry[] = [];
  const evaluatedGoals = new Set<string>();

  for (const proposal of agencyResult.proposals) {
    if (evaluatedGoals.has(proposal.goal_id)) continue;
    evaluatedGoals.add(proposal.goal_id);

    const goal = findGoal(options.portfolio, proposal.goal_id);
    if (!goal) {
      oracleEntries.push({
        goal_id: proposal.goal_id,
        status: "UNCERTAIN",
        reason: "goal not found in portfolio",
      });
      continue;
    }

    const refs = filterEligibleEvidenceRefs(evidenceByGoal.get(proposal.goal_id) ?? []);
    const runForGoal = runs.filter((r) => r.goal_id === proposal.goal_id);
    const anyExecuted = runForGoal.some((r) => r.executed);
    const compositionPending = runForGoal.some((r) => r.composition_pending);

    if (compositionPending && !anyExecuted) {
      oracleEntries.push({
        goal_id: proposal.goal_id,
        status: "PARTIAL",
        reason: "composition_pending — oracle not claimed PASS",
      });
      continue;
    }

    if (!anyExecuted) {
      const dominant = runForGoal[0]?.status ?? "NOT_MEASURED";
      oracleEntries.push({
        goal_id: proposal.goal_id,
        status: dominant,
        reason: runForGoal[0]?.reason ?? "no execution — oracle not claimed",
      });
      continue;
    }

    if (goal.spec.success_criteria_refs.length === 0) {
      oracleEntries.push({
        goal_id: proposal.goal_id,
        status: "NOT_MEASURED",
        reason: "no success_criteria_refs — cannot claim PASS without oracle criteria",
      });
      continue;
    }

    // Engine success with zero eligible evidence → keep PARTIAL (never oracle PASS).
    if (refs.length === 0) {
      const status: OutcomeStatus = "PARTIAL";
      oracleEntries.push({
        goal_id: proposal.goal_id,
        status,
        reason:
          "engine ran but no eligible evidence refs — presence_of_evidence cannot PASS (AR-C01)",
      });
      for (const run of runs) {
        if (run.goal_id === proposal.goal_id && run.executed) {
          run.status = status;
          run.reason =
            "oracle withheld PASS: no eligible evidence (synthetic run:* rejected)";
        }
      }
      continue;
    }

    const evidence: EvidenceRefBundle = { evidence_refs: refs };
    const evalResult = oracle.evaluateGoal(goal, criteriaById, evidence);
    const status = mapOracleDecision(evalResult.decision);
    // Classify oracle outcome through fail-closed path (PASS only if explicit).
    const classifiedOracle = classifyOutcome(status);
    const finalStatus = classifiedOracle.status;

    oracleEntries.push({
      goal_id: proposal.goal_id,
      status: finalStatus,
      oracle: evalResult,
    });

    for (const run of runs) {
      if (run.goal_id === proposal.goal_id && run.executed) {
        run.status = finalStatus;
        run.reason = `oracle:${evalResult.decision}`;
      }
    }
  }

  // AR-C02: post-oracle containment + stagnation for executed / failed outcomes.
  for (const run of runs) {
    if (run.status === "DEGRADED" && containmentEntries.some((c) => c.proposal_id === run.proposal_id)) {
      continue; // already contained on degrade path
    }

    const stagn = stagnationDetector.observe({
      action_id: run.proposal_id,
      hypothesis_id: run.goal_id,
      failure_signature: run.status,
      state_fingerprint: `${run.status}:${run.evidence_refs.length}:${run.executed}`,
      at: emitted_at,
    });

    if (!shouldContain(run.status, stagn.stagnant)) continue;
    if (run.status === "PASS" && !stagn.stagnant) continue;

    const domain =
      run.status === "FAIL" || run.status === "BLOCKED" ? "capability" : "action";
    const containment = selectContainment(
      domain,
      run.status,
      stagn.stagnant ? { escalate: true } : undefined,
    );

    const applied = applyContainmentSafety(safetyState, containment);
    safetyState = applied.state;
    containmentEntries.push({
      proposal_id: run.proposal_id,
      goal_id: run.goal_id,
      outcome: run.status,
      containment,
      safety_transition: applied.transition,
    });
  }

  return {
    proposals: agencyResult.proposals,
    decisions,
    runs,
    oracle: oracleEntries,
    human_gates,
    agency: agencyResult,
    containment: containmentEntries,
    stagnation: stagnationDetector.evaluate(),
    safety_state_after: safetyState,
    emitted_at,
  };
}

export class AgencyRuntime {
  constructor(private readonly defaults: Partial<AgencyRuntimeOptions> = {}) {}

  run(options: AgencyRuntimeOptions): Promise<AgencyRunReport> {
    return runAgencyRuntime({ ...this.defaults, ...options });
  }
}
