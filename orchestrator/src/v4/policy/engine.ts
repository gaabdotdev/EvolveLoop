/**
 * Deny-by-default Policy Decision Point (constitution §4.10, §9; ADR-V4-0011).
 * Implements PolicyDecisionPort. Caller-asserted identity is ignored (F02 / R4).
 */

import {
  assertConforms,
  combineRuleEffects,
  DEFAULT_TENANT_ID,
  isValidId,
  MAX_DECISION_TTL_MS,
  POLICY_DECISION_SCHEMA_VERSION,
  sha256Canonical,
  type AutonomyLevel,
  type Policy,
  type PolicyDecision,
  type PolicyDecisionPort,
  type PolicyDecisionRequest,
  type PolicyEffect,
  type PolicyRule,
} from "../contracts/index.js";
import { ApprovalRegistry } from "./approvals.js";
import { POLICY_ENGINE_PRINCIPAL } from "./authn.js";
import { applyAutonomyOverlay, effectiveAutonomy } from "./autonomy.js";
import { GrantRegistry } from "./grants.js";
import { newPolicyDecisionId } from "./ids.js";
import { ruleMatches } from "./match.js";
import { PolicyStore } from "./store.js";
import type {
  Approval,
  ApprovalDecisionResult,
  AuditedPolicyDecision,
  AuthenticatedPrincipal,
  Clock,
  ConsumeResult,
  Grant,
  PolicyEventSink,
  WorkPolicyContext,
} from "./types.js";
import { principalToActor, SYSTEM_CLOCK } from "./types.js";

export class InvalidPolicyRequest extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPolicyRequest";
  }
}

export interface WorkContextPort {
  get(work_id: string): WorkPolicyContext | undefined;
}

export class InMemoryWorkContext implements WorkContextPort {
  private readonly items = new Map<string, WorkPolicyContext>();

  set(ctx: WorkPolicyContext): void {
    this.items.set(ctx.work_id, ctx);
  }

  get(work_id: string): WorkPolicyContext | undefined {
    return this.items.get(work_id);
  }
}

function sanitizeRequest(raw: PolicyDecisionRequest): PolicyDecisionRequest {
  return {
    work_id: raw.work_id,
    task_id: raw.task_id,
    subject: {
      executor_id: raw.subject.executor_id,
      executor_version: raw.subject.executor_version,
    },
    action: raw.action,
    resource: raw.resource,
    environment: raw.environment,
    risk: raw.risk,
  };
}

export interface DenyByDefaultEngineOptions {
  store: PolicyStore;
  policy_id: string;
  contexts: WorkContextPort;
  clock?: Clock;
  grants?: GrantRegistry;
  approvals?: ApprovalRegistry;
  events?: PolicyEventSink;
  decision_ttl_ms?: number;
  approval_ttl_ms?: number;
}

export class DenyByDefaultPolicyEngine implements PolicyDecisionPort {
  readonly grants: GrantRegistry;
  readonly approvals: ApprovalRegistry;
  private readonly clock: Clock;
  private readonly ttlMs: number;
  private readonly approvalTtlMs: number;
  private readonly cache = new Map<string, AuditedPolicyDecision>();

  private cacheKey(req: PolicyDecisionRequest, epoch: number): string {
    return sha256Canonical({ ...req, policy_id: this.opts.policy_id, epoch });
  }

  constructor(private readonly opts: DenyByDefaultEngineOptions) {
    if (!isValidId("policy", opts.policy_id)) {
      throw new InvalidPolicyRequest("invalid policy_id");
    }
    this.clock = opts.clock ?? SYSTEM_CLOCK;
    this.grants = opts.grants ?? new GrantRegistry(this.clock);
    this.approvals = opts.approvals ?? new ApprovalRegistry(this.clock);
    const ttl = opts.decision_ttl_ms ?? 60_000;
    this.ttlMs = Math.min(Math.max(ttl, 1), MAX_DECISION_TTL_MS);
    this.approvalTtlMs = opts.approval_ttl_ms ?? 3_600_000;
  }

  async currentEpoch(policy_id: string): Promise<number> {
    const p = this.opts.store.get(policy_id);
    if (!p) throw new InvalidPolicyRequest(`unknown policy ${policy_id}`);
    return p.epoch;
  }

  async decide(request: PolicyDecisionRequest): Promise<AuditedPolicyDecision> {
    // Extra keys such as actor/decided_by are dropped; they never become decided_by (R4 / F02).
    const req = sanitizeRequest(request);
    this.assertRequestShape(req);

    const policy = this.opts.store.get(this.opts.policy_id);
    const now = this.clock.now();
    const nowIso = now.toISOString();
    const until = new Date(now.getTime() + this.ttlMs).toISOString();
    const cached = this.cache.get(this.cacheKey(req, policy?.epoch ?? 0));
    if (cached && this.isStillValid(cached) && cached.decision !== "REQUIRE_APPROVAL") {
      return cached;
    }

    if (!policy || policy.status !== "ACTIVE") {
      return this.emitDecision(req, {
        decision: "DENY",
        matched: [],
        reason: policy ? "policy_not_active" : "no_active_policy",
        obligations: [],
        nowIso,
        until,
        policy,
      });
    }

    const ctx = this.opts.contexts.get(req.work_id);
    const level: AutonomyLevel = effectiveAutonomy(policy, ctx?.autonomy);
    const labels = ctx?.executor_labels ?? [];

    const matchedRules = policy.rules.filter((rule) =>
      ruleMatches(rule, {
        subject: req.subject,
        action: req.action,
        resource: req.resource,
        environment: req.environment,
        risk: req.risk,
        labels,
        nowMs: now.getTime(),
      }),
    );
    const combined = combineRuleEffects(matchedRules.map((r) => r.effect));
    const overlay = applyAutonomyOverlay(combined, {
      level,
      action: req.action,
      risk: req.risk,
      matchedAllowRules: matchedRules.filter((r) => r.effect === "ALLOW"),
    });
    const decision: PolicyEffect = overlay.effect;
    const reason =
      overlay.reason ??
      (matchedRules.length === 0 ? "deny_by_default_no_match" : `combined_${combined}_autonomy_${level}`);

    const obligations = matchedRules.flatMap((r) => r.obligations ?? []);
    const decided = this.emitDecision(req, {
      decision,
      matched: matchedRules,
      reason,
      obligations,
      nowIso,
      until,
      policy,
    });

    if (decision === "REQUIRE_APPROVAL") {
      const approval = this.approvals.create({
        work_id: req.work_id,
        task_id: req.task_id,
        subject_executor_id: req.subject.executor_id,
        action: req.action,
        resource: req.resource,
        environment: req.environment,
        risk: req.risk,
        policy_id: policy.policy_id,
        policy_version: policy.version,
        policy_epoch: policy.epoch,
        decision_id: decided.decision_id,
        expires_at: new Date(now.getTime() + this.approvalTtlMs).toISOString(),
      });
      this.opts.events?.emit("approval.requested", {
        approval_id: approval.approval_id,
        decision_id: decided.decision_id,
        work_id: req.work_id,
        action: req.action,
        resource: req.resource,
      });
    }

    return decided;
  }

  /**
   * Enforcement-point re-check: cached ALLOW is invalid after TTL or epoch bump (D14).
   */
  isStillValid(decision: PolicyDecision): boolean {
    const now = this.clock.now().getTime();
    if (Date.parse(decision.valid_until) <= now) return false;
    const p = this.opts.store.get(decision.policy_ref.policy_id);
    if (!p || p.status !== "ACTIVE") return false;
    if (p.epoch !== decision.policy_ref.epoch) return false;
    return true;
  }

  resolveApproval(
    approval_id: string,
    principal: AuthenticatedPrincipal,
    to: "APPROVED" | "REJECTED",
    note?: string,
  ): ApprovalDecisionResult {
    if (!principal) return { ok: false, reason: "AUTH_REQUIRED" };
    const result = this.approvals.decide(approval_id, principal, to, note);
    if (!result.ok) return result;
    let grant: Grant | undefined;
    if (to === "APPROVED") {
      const a = result.approval;
      const policy = this.opts.store.get(a.policy_id);
      if (!policy || policy.epoch !== a.policy_epoch) {
        return { ok: false, reason: "NOT_PENDING" };
      }
      grant = this.grants.issue({
        work_id: a.work_id,
        subject_executor_id: a.subject_executor_id,
        action: a.action,
        resource: a.resource,
        policy_id: a.policy_id,
        policy_version: a.policy_version,
        policy_epoch: a.policy_epoch,
        approval_id: a.approval_id,
        max_uses: 1,
        expires_at: a.expires_at,
      });
      this.approvals.attachGrant(a.approval_id, grant.grant_id);
      result.approval.grant_id = grant.grant_id;
    }
    this.opts.events?.emit("approval.decided", {
      approval_id: result.approval.approval_id,
      state: result.approval.state,
      decided_by: result.approval.decided_by,
      grant_id: grant?.grant_id,
    });
    return grant ? { ok: true, approval: result.approval, grant } : result;
  }

  consumeGrant(input: {
    grant_id: string;
    effect_id: string;
    work_id: string;
    action: string;
    resource: string;
  }): ConsumeResult {
    const epoch = this.opts.store.get(this.opts.policy_id)?.epoch ?? -1;
    return this.grants.consume({ ...input, current_epoch: epoch });
  }

  revokeGrant(grant_id: string): Grant | undefined {
    const g = this.grants.revoke(grant_id);
    if (g) {
      this.opts.events?.emit("grant.revoked", {
        grant_id: g.grant_id,
        work_id: g.work_id,
        policy_epoch: g.policy_epoch,
      });
    }
    return g;
  }

  pendingForDecision(decision_id: string): Approval | undefined {
    return this.approvals.pendingForDecision(decision_id);
  }

  private assertRequestShape(req: PolicyDecisionRequest): void {
    if (!isValidId("work", req.work_id)) throw new InvalidPolicyRequest("invalid work_id");
    if (req.task_id !== undefined && !isValidId("task", req.task_id)) {
      throw new InvalidPolicyRequest("invalid task_id");
    }
    if (!isValidId("executor", req.subject.executor_id)) {
      throw new InvalidPolicyRequest("invalid subject.executor_id");
    }
    if (!req.subject.executor_version) throw new InvalidPolicyRequest("missing executor_version");
    if (!req.action) throw new InvalidPolicyRequest("missing action");
    if (!req.resource) throw new InvalidPolicyRequest("missing resource");
    if (!req.environment) throw new InvalidPolicyRequest("missing environment");
  }

  private emitDecision(
    req: PolicyDecisionRequest,
    parts: {
      decision: PolicyEffect;
      matched: readonly PolicyRule[];
      reason: string;
      obligations: string[];
      nowIso: string;
      until: string;
      policy: Policy | undefined;
    },
  ): AuditedPolicyDecision {
    const decided: AuditedPolicyDecision = {
      kind: "PolicyDecision",
      schema_version: POLICY_DECISION_SCHEMA_VERSION,
      tenant_id: DEFAULT_TENANT_ID,
      decision_id: newPolicyDecisionId(),
      request: req,
      decision: parts.decision,
      policy_ref: {
        policy_id: parts.policy?.policy_id ?? this.opts.policy_id,
        version: parts.policy?.version ?? 1,
        epoch: parts.policy?.epoch ?? 0,
      },
      matched_rule_ids: parts.matched.map((r) => r.rule_id),
      reason: parts.reason,
      obligations: parts.obligations,
      decided_at: parts.nowIso,
      valid_until: parts.until,
      decided_by: principalToActor(POLICY_ENGINE_PRINCIPAL),
    };
    const report = assertConforms(decided);
    if (!report.valid) {
      throw new InvalidPolicyRequest(`decision failed schema: ${report.issues.map((i) => i.code).join(",")}`);
    }
    this.opts.events?.emit("policy.decided", {
      decision_id: decided.decision_id,
      work_id: req.work_id,
      action: req.action,
      resource: req.resource,
      decision: decided.decision,
      policy_ref: decided.policy_ref,
      decided_by: decided.decided_by,
      reason: decided.reason,
    });
    this.cache.set(this.cacheKey(req, decided.policy_ref.epoch), decided);
    return decided;
  }
}
