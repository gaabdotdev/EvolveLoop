/**
 * V2-INT-04 — Delegated Authority Matrix.
 * Explicit, scoped, time-bound, revocable, auditable grants.
 * Child grants are a hard subset of the parent — no self-expansion.
 */

import { resolve } from "node:path";
import type { CapabilityAction } from "./types.js";

/** Sensitive action categories gated by delegated authority. */
export type DelegationCategory = "destroy" | "network" | "credential";

export const DELEGATION_CATEGORIES: readonly DelegationCategory[] = [
  "destroy",
  "network",
  "credential",
] as const;

/** Map CapabilityAction → delegation category (undefined = not delegation-gated). */
export const ACTION_TO_DELEGATION_CATEGORY: Readonly<
  Partial<Record<CapabilityAction, DelegationCategory>>
> = {
  "filesystem.delete": "destroy",
  "deploy.publish": "destroy",
  "sandbox.disable": "destroy",
  "git.mutate": "destroy",
  "network.egress": "network",
  "package.install": "network",
  "mcp.invoke": "network",
  "secrets.read": "credential",
  "secrets.inject": "credential",
};

export interface DelegationGrant {
  grant_id: string;
  principal: string;
  categories: DelegationCategory[];
  scope_paths: string[];
  not_before: string;
  not_after: string;
  revoked_at?: string;
  issued_by: string;
  parent_grant_id?: string;
}

export type DelegationAuditEventType =
  | "issue"
  | "revoke"
  | "allow"
  | "deny"
  | "reject_expansion";

export interface DelegationAuditEvent {
  event_id: string;
  at: string;
  type: DelegationAuditEventType;
  principal?: string;
  grant_id?: string;
  parent_grant_id?: string;
  category?: DelegationCategory | string;
  path?: string;
  reason: string;
  details?: Record<string, unknown>;
}

export interface IssueGrantInput {
  grant_id?: string;
  principal: string;
  categories: DelegationCategory[];
  scope_paths: string[];
  not_before: string;
  not_after: string;
  issued_by: string;
  parent_grant_id?: string;
}

export interface DelegationAllowDecision {
  allowed: boolean;
  reason: string;
  grant_id?: string;
  checked_at: string;
}

export class DelegationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DelegationError";
  }
}

function nowIso(clock?: () => Date): string {
  return (clock?.() ?? new Date()).toISOString();
}

function isCategory(c: string): c is DelegationCategory {
  return (DELEGATION_CATEGORIES as readonly string[]).includes(c);
}

/** Normalize path for prefix comparisons (absolute-ish, trailing slash stripped). */
export function normalizeScopePath(p: string): string {
  const trimmed = p.trim();
  if (!trimmed) return "";
  const abs = trimmed.startsWith("/") ? trimmed : resolve("/", trimmed);
  return abs.replace(/\/+$/, "") || "/";
}

/** True iff `child` is equal to or under `parent` path. */
export function pathUnderScope(child: string, parent: string): boolean {
  const c = normalizeScopePath(child);
  const p = normalizeScopePath(parent);
  if (!c || !p) return false;
  return c === p || c.startsWith(p.endsWith("/") ? p : p + "/");
}

export function categoriesAreSubset(
  child: readonly string[],
  parent: readonly string[],
): boolean {
  const set = new Set(parent);
  return child.every((c) => set.has(c));
}

export function scopesAreSubset(
  childScopes: readonly string[],
  parentScopes: readonly string[],
): boolean {
  if (childScopes.length === 0) return false;
  return childScopes.every((cs) =>
    parentScopes.some((ps) => pathUnderScope(cs, ps)),
  );
}

/** Child validity must sit entirely inside parent validity window. */
export function validityIsSubset(
  child: { not_before: string; not_after: string },
  parent: { not_before: string; not_after: string },
): boolean {
  const c0 = Date.parse(child.not_before);
  const c1 = Date.parse(child.not_after);
  const p0 = Date.parse(parent.not_before);
  const p1 = Date.parse(parent.not_after);
  if ([c0, c1, p0, p1].some((n) => Number.isNaN(n))) return false;
  if (c0 > c1) return false;
  return c0 >= p0 && c1 <= p1;
}

export function isGrantActive(grant: DelegationGrant, at: Date): boolean {
  if (grant.revoked_at) return false;
  const t = at.getTime();
  const nb = Date.parse(grant.not_before);
  const na = Date.parse(grant.not_after);
  if (Number.isNaN(nb) || Number.isNaN(na)) return false;
  return t >= nb && t <= na;
}

export function assertSubsetOfParent(
  child: Pick<DelegationGrant, "categories" | "scope_paths" | "not_before" | "not_after">,
  parent: DelegationGrant,
): { ok: true } | { ok: false; reason: string } {
  if (!categoriesAreSubset(child.categories, parent.categories)) {
    return { ok: false, reason: "categories_expand_beyond_parent" };
  }
  if (!scopesAreSubset(child.scope_paths, parent.scope_paths)) {
    return { ok: false, reason: "scope_paths_expand_beyond_parent" };
  }
  if (!validityIsSubset(child, parent)) {
    return { ok: false, reason: "validity_expands_beyond_parent" };
  }
  return { ok: true };
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export interface DelegationRegistryOptions {
  /** Injectable clock for validity tests. */
  clock?: () => Date;
}

/**
 * In-memory append-only audit + grant store.
 * issue/revoke/isAllowed are pure relative to registry state (no I/O).
 */
export class DelegationRegistry {
  private readonly grants = new Map<string, DelegationGrant>();
  private readonly audit: DelegationAuditEvent[] = [];
  private readonly clock: () => Date;

  constructor(opts?: DelegationRegistryOptions) {
    this.clock = opts?.clock ?? (() => new Date());
  }

  getAuditLog(): readonly DelegationAuditEvent[] {
    return this.audit;
  }

  getGrant(grantId: string): DelegationGrant | undefined {
    const g = this.grants.get(grantId);
    return g ? { ...g, categories: [...g.categories], scope_paths: [...g.scope_paths] } : undefined;
  }

  listGrants(principal?: string): DelegationGrant[] {
    const all = [...this.grants.values()].map((g) => ({
      ...g,
      categories: [...g.categories],
      scope_paths: [...g.scope_paths],
    }));
    return principal ? all.filter((g) => g.principal === principal) : all;
  }

  private appendAudit(
    partial: Omit<DelegationAuditEvent, "event_id" | "at"> & { at?: string },
  ): DelegationAuditEvent {
    const event: DelegationAuditEvent = {
      event_id: nextId("aud"),
      at: partial.at ?? nowIso(this.clock),
      type: partial.type,
      principal: partial.principal,
      grant_id: partial.grant_id,
      parent_grant_id: partial.parent_grant_id,
      category: partial.category,
      path: partial.path,
      reason: partial.reason,
      details: partial.details,
    };
    this.audit.push(event);
    return event;
  }

  /**
   * Issue a grant. With parent_grant_id, child must be a strict subset
   * (categories ⊆, scopes under parent, validity inside parent). Expansion → reject + audit.
   */
  issue(input: IssueGrantInput): DelegationGrant {
    const categories = [...new Set(input.categories)];
    if (categories.length === 0 || !categories.every(isCategory)) {
      throw new DelegationError("INVALID_CATEGORIES", "categories must be non-empty known set");
    }
    const scope_paths = input.scope_paths.map(normalizeScopePath).filter(Boolean);
    if (scope_paths.length === 0) {
      throw new DelegationError("INVALID_SCOPE", "scope_paths must be non-empty");
    }
    const nb = Date.parse(input.not_before);
    const na = Date.parse(input.not_after);
    if (Number.isNaN(nb) || Number.isNaN(na) || nb > na) {
      throw new DelegationError("INVALID_VALIDITY", "not_before/not_after invalid");
    }
    if (!input.principal.trim() || !input.issued_by.trim()) {
      throw new DelegationError("INVALID_PRINCIPAL", "principal and issued_by required");
    }

    const grant_id = input.grant_id?.trim() || nextId("dlg");
    if (this.grants.has(grant_id)) {
      throw new DelegationError("DUPLICATE_GRANT", grant_id);
    }

    if (input.parent_grant_id) {
      const parent = this.grants.get(input.parent_grant_id);
      if (!parent) {
        throw new DelegationError("PARENT_NOT_FOUND", input.parent_grant_id);
      }
      if (parent.revoked_at) {
        throw new DelegationError("PARENT_REVOKED", input.parent_grant_id);
      }
      const subset = assertSubsetOfParent(
        { categories, scope_paths, not_before: input.not_before, not_after: input.not_after },
        parent,
      );
      if (!subset.ok) {
        this.appendAudit({
          type: "reject_expansion",
          principal: input.principal,
          parent_grant_id: parent.grant_id,
          reason: subset.reason,
          details: {
            attempted_categories: categories,
            attempted_scopes: scope_paths,
            attempted_not_before: input.not_before,
            attempted_not_after: input.not_after,
            parent_categories: parent.categories,
            parent_scopes: parent.scope_paths,
          },
        });
        throw new DelegationError("EXPANSION_REJECTED", subset.reason);
      }
    }

    const grant: DelegationGrant = {
      grant_id,
      principal: input.principal.trim(),
      categories,
      scope_paths,
      not_before: input.not_before,
      not_after: input.not_after,
      issued_by: input.issued_by.trim(),
      parent_grant_id: input.parent_grant_id,
    };
    this.grants.set(grant_id, grant);
    this.appendAudit({
      type: "issue",
      principal: grant.principal,
      grant_id: grant.grant_id,
      parent_grant_id: grant.parent_grant_id,
      reason: grant.parent_grant_id ? "issued_child_subset" : "issued_root",
      details: {
        categories: grant.categories,
        scope_paths: grant.scope_paths,
        not_before: grant.not_before,
        not_after: grant.not_after,
        issued_by: grant.issued_by,
      },
    });
    return { ...grant, categories: [...grant.categories], scope_paths: [...grant.scope_paths] };
  }

  revoke(grantId: string, reason = "revoked"): DelegationGrant {
    const grant = this.grants.get(grantId);
    if (!grant) throw new DelegationError("GRANT_NOT_FOUND", grantId);
    if (grant.revoked_at) {
      return { ...grant, categories: [...grant.categories], scope_paths: [...grant.scope_paths] };
    }
    grant.revoked_at = nowIso(this.clock);
    this.appendAudit({
      type: "revoke",
      principal: grant.principal,
      grant_id: grant.grant_id,
      parent_grant_id: grant.parent_grant_id,
      reason,
    });
    return { ...grant, categories: [...grant.categories], scope_paths: [...grant.scope_paths] };
  }

  isAllowed(
    principal: string,
    action_category: DelegationCategory | string,
    path: string,
  ): DelegationAllowDecision {
    const checked_at = nowIso(this.clock);
    const at = this.clock();
    if (!isCategory(action_category)) {
      const decision: DelegationAllowDecision = {
        allowed: false,
        reason: `unknown_category:${action_category}`,
        checked_at,
      };
      this.appendAudit({
        type: "deny",
        principal,
        category: action_category,
        path,
        reason: decision.reason,
      });
      return decision;
    }

    const normPath = normalizeScopePath(path);
    const candidates = [...this.grants.values()].filter(
      (g) => g.principal === principal && isGrantActive(g, at),
    );

    for (const g of candidates) {
      if (!g.categories.includes(action_category)) continue;
      if (!g.scope_paths.some((sp) => pathUnderScope(normPath, sp))) continue;
      const decision: DelegationAllowDecision = {
        allowed: true,
        reason: `grant:${g.grant_id}`,
        grant_id: g.grant_id,
        checked_at,
      };
      this.appendAudit({
        type: "allow",
        principal,
        grant_id: g.grant_id,
        category: action_category,
        path: normPath,
        reason: decision.reason,
      });
      return decision;
    }

    const decision: DelegationAllowDecision = {
      allowed: false,
      reason: "no_active_grant_covers_category_path",
      checked_at,
    };
    this.appendAudit({
      type: "deny",
      principal,
      category: action_category,
      path: normPath,
      reason: decision.reason,
    });
    return decision;
  }
}
