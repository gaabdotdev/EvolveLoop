/**
 * V5-M05 — PolicyStore (JSON) with checkPolicy(action).
 * Precedence: work > workspace.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  LifecycleControlAction,
  PolicyAction,
  PolicyCheckResult,
  PolicyDocument,
  PolicyStoreSnapshot,
  GovernancePolicyScope,
} from "./types.js";

export class PolicyStoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PolicyStoreError";
  }
}

/** @deprecated alias */
export class GovernancePolicyError extends PolicyStoreError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "GovernancePolicyError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

const LIMITATIONS = [
  "Policy deny is fail-closed overlay on Tool Registry assignment (M04)",
  "Precedence: work > workspace",
  "Empty deny_tool_ids does not imply allow-all — assignment still required",
  "deny_lifecycle_actions gate REMED pause/resume/cancel via thin wrapper only",
];

export const POLICY_PRECEDENCE: GovernancePolicyScope[] = ["work", "workspace"];

/** @deprecated alias */
export const GOVERNANCE_POLICY_PRECEDENCE = POLICY_PRECEDENCE;

export interface UpsertPolicyInput {
  scope: GovernancePolicyScope;
  work_id?: string;
  deny_tool_ids?: string[];
  deny_lifecycle_actions?: LifecycleControlAction[];
  require_approval_for_tools?: boolean;
  notes?: string[];
  policy_id?: string;
}

function normalizeLifecycle(
  actions: LifecycleControlAction[] | undefined,
): LifecycleControlAction[] {
  const allowed = new Set<LifecycleControlAction>(["pause", "resume", "cancel"]);
  return [...new Set((actions ?? []).filter((a) => allowed.has(a)))];
}

export class PolicyStore {
  private readonly path: string;

  constructor(rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
    this.path = join(rootDir, "policy.json");
  }

  load(): PolicyStoreSnapshot {
    if (!existsSync(this.path)) {
      return {
        kind: "PolicyStore",
        version: 0,
        updated_at: nowIso(),
        works: {},
        limitations: [...LIMITATIONS, "policy file absent"],
      };
    }
    const raw = JSON.parse(readFileSync(this.path, "utf-8")) as PolicyStoreSnapshot & {
      kind?: string;
    };
    // Accept legacy GovernancePolicyStore snapshots from human-governance WIP.
    if (raw.kind !== "PolicyStore" && raw.kind !== "GovernancePolicyStore") {
      throw new PolicyStoreError("INVALID", this.path);
    }
    return this.normalizeSnapshot(raw);
  }

  private normalizeDoc(doc: PolicyDocument & { kind?: string }): PolicyDocument {
    return {
      kind: "PolicyDocument",
      policy_id: doc.policy_id,
      scope: doc.scope,
      work_id: doc.work_id,
      deny_tool_ids: [...(doc.deny_tool_ids ?? [])],
      deny_lifecycle_actions: normalizeLifecycle(doc.deny_lifecycle_actions),
      require_approval_for_tools: doc.require_approval_for_tools ?? false,
      notes: doc.notes ?? [],
      updated_at: doc.updated_at,
      version: doc.version,
    };
  }

  private normalizeSnapshot(
    raw: PolicyStoreSnapshot & {
      workspace?: PolicyDocument & { kind?: string };
      works?: Record<string, PolicyDocument & { kind?: string }>;
    },
  ): PolicyStoreSnapshot {
    const works: Record<string, PolicyDocument> = {};
    for (const [k, v] of Object.entries(raw.works ?? {})) {
      works[k] = this.normalizeDoc(v);
    }
    return {
      kind: "PolicyStore",
      version: raw.version ?? 0,
      updated_at: raw.updated_at ?? nowIso(),
      workspace: raw.workspace ? this.normalizeDoc(raw.workspace) : undefined,
      works,
      limitations: raw.limitations?.length ? raw.limitations : [...LIMITATIONS],
    };
  }

  private persist(snap: PolicyStoreSnapshot): PolicyStoreSnapshot {
    atomicWrite(this.path, JSON.stringify(snap, null, 2));
    return snap;
  }

  upsert(input: UpsertPolicyInput): PolicyDocument {
    if (input.scope === "work" && !input.work_id?.trim()) {
      throw new PolicyStoreError("WORK_ID_REQUIRED", "scope=work needs work_id");
    }
    const snap = this.load();
    const ts = nowIso();
    const prev =
      input.scope === "workspace"
        ? snap.workspace
        : snap.works[input.work_id!.trim()];
    const doc: PolicyDocument = {
      kind: "PolicyDocument",
      policy_id:
        input.policy_id?.trim() ||
        prev?.policy_id ||
        (input.scope === "workspace"
          ? "policy-workspace"
          : `policy-work-${input.work_id!.trim()}`),
      scope: input.scope,
      work_id: input.scope === "work" ? input.work_id!.trim() : undefined,
      deny_tool_ids: [
        ...new Set((input.deny_tool_ids ?? prev?.deny_tool_ids ?? []).map(String)),
      ],
      deny_lifecycle_actions: normalizeLifecycle(
        input.deny_lifecycle_actions ?? prev?.deny_lifecycle_actions,
      ),
      require_approval_for_tools:
        input.require_approval_for_tools ??
        prev?.require_approval_for_tools ??
        false,
      notes: input.notes ?? prev?.notes ?? [],
      updated_at: ts,
      version: (prev?.version ?? 0) + 1,
    };

    if (input.scope === "workspace") {
      snap.workspace = doc;
    } else {
      snap.works[doc.work_id!] = doc;
    }

    this.persist({
      kind: "PolicyStore",
      version: Math.max(1, snap.version + 1),
      updated_at: ts,
      workspace: snap.workspace,
      works: snap.works,
      limitations: snap.limitations.length ? snap.limitations : [...LIMITATIONS],
    });
    return doc;
  }

  /**
   * Resolve effective policy for a work (work overrides workspace).
   */
  resolveForWork(workId?: string): {
    deny_tool_ids: string[];
    deny_lifecycle_actions: LifecycleControlAction[];
    require_approval_for_tools: boolean;
    resolved_from: GovernancePolicyScope | "none";
    reasons: string[];
    documents: PolicyDocument[];
  } {
    const snap = this.load();
    const reasons: string[] = [];
    const documents: PolicyDocument[] = [];
    const deny = new Set<string>();
    const denyLife = new Set<LifecycleControlAction>();
    let requireApproval = false;
    let resolved_from: GovernancePolicyScope | "none" = "none";

    if (snap.workspace) {
      documents.push(snap.workspace);
      for (const id of snap.workspace.deny_tool_ids) deny.add(id);
      for (const a of snap.workspace.deny_lifecycle_actions) denyLife.add(a);
      if (snap.workspace.require_approval_for_tools) requireApproval = true;
      resolved_from = "workspace";
      reasons.push("workspace_policy_applied");
    }

    const wid = workId?.trim();
    if (wid && snap.works[wid]) {
      const w = snap.works[wid];
      documents.push(w);
      for (const id of w.deny_tool_ids) deny.add(id);
      for (const a of w.deny_lifecycle_actions) denyLife.add(a);
      if (w.require_approval_for_tools) requireApproval = true;
      resolved_from = "work";
      reasons.push("work>workspace");
      reasons.push(`work_policy_applied:${wid}`);
    }

    if (resolved_from === "none") {
      reasons.push("no_policy_document");
    }

    return {
      deny_tool_ids: [...deny].sort(),
      deny_lifecycle_actions: [...denyLife].sort() as LifecycleControlAction[],
      require_approval_for_tools: requireApproval,
      resolved_from,
      reasons,
      documents,
    };
  }

  /**
   * Fail-closed policy check for tool_use or lifecycle controls.
   */
  checkPolicy(action: PolicyAction): PolicyCheckResult {
    const checked_at = nowIso();
    const workId =
      action.type === "tool_use" || action.type === "lifecycle"
        ? action.work_id
        : undefined;
    const resolved = this.resolveForWork(workId);
    const reasons: string[] = [...resolved.reasons];

    if (action.type === "tool_use") {
      if (resolved.deny_tool_ids.includes(action.tool_id)) {
        reasons.push(`deny_tool_ids:${action.tool_id}`);
        return {
          kind: "PolicyCheckResult",
          action,
          verdict: "deny",
          allowed: false,
          reasons,
          checked_at,
        };
      }
      return {
        kind: "PolicyCheckResult",
        action,
        verdict: "allow",
        allowed: true,
        reasons: reasons.length ? reasons : ["no_tool_deny"],
        checked_at,
      };
    }

    // lifecycle
    if (resolved.deny_lifecycle_actions.includes(action.control)) {
      reasons.push(`deny_lifecycle_actions:${action.control}`);
      return {
        kind: "PolicyCheckResult",
        action,
        verdict: "deny",
        allowed: false,
        reasons,
        checked_at,
      };
    }
    return {
      kind: "PolicyCheckResult",
      action,
      verdict: "allow",
      allowed: true,
      reasons: reasons.length ? reasons : ["lifecycle_not_denied"],
      checked_at,
    };
  }
}

/** @deprecated alias — prefer PolicyStore */
export class GovernancePolicyStore extends PolicyStore {}
