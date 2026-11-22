/**
 * V2-INT-04 — Matriz de Autoridade Delegada (DelegationGrant + Registry + gate).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  DelegationRegistry,
  DelegationError,
  ACTION_TO_DELEGATION_CATEGORY,
  capabilityGate,
  evaluateCapability,
  agentWorkspaceProfile,
} from "../../src/v3/security/index.js";
import type { SandboxProfile } from "../../src/v3/security/types.js";
import {
  attachDelegationGrant,
  listAttachedGrants,
  queryGrillDelegation,
  validateGrillDelegationRefs,
  type GrillMeDelegationAttachment,
} from "../../src/v3/grill-me/index.js";

const T0 = Date.parse("2026-11-21T12:00:00.000Z");

function iso(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString();
}

describe("V2-INT-04 Delegated Authority Matrix", () => {
  let registry: DelegationRegistry;
  let nowMs: number;

  beforeEach(() => {
    nowMs = T0;
    registry = new DelegationRegistry({
      clock: () => new Date(nowMs),
    });
  });

  it("issue + allow within category/path/validity", () => {
    const g = registry.issue({
      grant_id: "g-root",
      principal: "agent-a",
      categories: ["destroy", "network"],
      scope_paths: ["/workspace/proj"],
      not_before: iso(0),
      not_after: iso(3_600_000),
      issued_by: "operator",
    });
    expect(g.grant_id).toBe("g-root");
    expect(registry.isAllowed("agent-a", "destroy", "/workspace/proj/src/a.ts").allowed).toBe(
      true,
    );
    expect(registry.isAllowed("agent-a", "network", "/workspace/proj").allowed).toBe(true);
  });

  it("deny outside category / path / validity", () => {
    registry.issue({
      grant_id: "g1",
      principal: "agent-a",
      categories: ["destroy"],
      scope_paths: ["/workspace/proj"],
      not_before: iso(0),
      not_after: iso(60_000),
      issued_by: "operator",
    });

    expect(registry.isAllowed("agent-a", "credential", "/workspace/proj/x").allowed).toBe(false);
    expect(registry.isAllowed("agent-a", "destroy", "/other/place").allowed).toBe(false);

    nowMs = T0 + 120_000;
    expect(registry.isAllowed("agent-a", "destroy", "/workspace/proj/x").allowed).toBe(false);
  });

  it("revoke stops allowance", () => {
    registry.issue({
      grant_id: "g-rev",
      principal: "agent-b",
      categories: ["credential"],
      scope_paths: ["/secrets"],
      not_before: iso(0),
      not_after: iso(3_600_000),
      issued_by: "operator",
    });
    expect(registry.isAllowed("agent-b", "credential", "/secrets/token").allowed).toBe(true);
    registry.revoke("g-rev");
    expect(registry.getGrant("g-rev")?.revoked_at).toBeTruthy();
    expect(registry.isAllowed("agent-b", "credential", "/secrets/token").allowed).toBe(false);
  });

  it("child grant cannot widen beyond parent (categories/scope/validity)", () => {
    registry.issue({
      grant_id: "parent",
      principal: "leader",
      categories: ["destroy", "network"],
      scope_paths: ["/workspace/proj"],
      not_before: iso(0),
      not_after: iso(3_600_000),
      issued_by: "operator",
    });

    // Valid subset child (validity strictly inside parent; active at clock T0)
    const child = registry.issue({
      grant_id: "child-ok",
      principal: "worker",
      categories: ["destroy"],
      scope_paths: ["/workspace/proj/src"],
      not_before: iso(0),
      not_after: iso(1_800_000),
      issued_by: "leader",
      parent_grant_id: "parent",
    });
    expect(child.parent_grant_id).toBe("parent");
    expect(registry.isAllowed("worker", "destroy", "/workspace/proj/src/a.ts").allowed).toBe(
      true,
    );

    // Category expansion
    expect(() =>
      registry.issue({
        grant_id: "child-cat",
        principal: "worker",
        categories: ["destroy", "credential"],
        scope_paths: ["/workspace/proj/src"],
        not_before: iso(1_000),
        not_after: iso(1_800_000),
        issued_by: "leader",
        parent_grant_id: "parent",
      }),
    ).toThrow(DelegationError);

    // Scope expansion
    expect(() =>
      registry.issue({
        grant_id: "child-scope",
        principal: "worker",
        categories: ["destroy"],
        scope_paths: ["/workspace"],
        not_before: iso(1_000),
        not_after: iso(1_800_000),
        issued_by: "leader",
        parent_grant_id: "parent",
      }),
    ).toThrow(/EXPANSION_REJECTED|scope_paths_expand/);

    // Validity expansion past parent
    expect(() =>
      registry.issue({
        grant_id: "child-time",
        principal: "worker",
        categories: ["destroy"],
        scope_paths: ["/workspace/proj/src"],
        not_before: iso(0),
        not_after: iso(7_200_000),
        issued_by: "leader",
        parent_grant_id: "parent",
      }),
    ).toThrow(DelegationError);
  });

  it("auto-expansion rejected + audited", () => {
    registry.issue({
      grant_id: "p",
      principal: "leader",
      categories: ["network"],
      scope_paths: ["/workspace/proj"],
      not_before: iso(0),
      not_after: iso(3_600_000),
      issued_by: "operator",
    });

    try {
      registry.issue({
        grant_id: "evil",
        principal: "leader",
        categories: ["network", "destroy"],
        scope_paths: ["/workspace/proj"],
        not_before: iso(0),
        not_after: iso(3_600_000),
        issued_by: "leader",
        parent_grant_id: "p",
      });
      expect.unreachable("should reject expansion");
    } catch (e) {
      expect(e).toBeInstanceOf(DelegationError);
      expect((e as DelegationError).code).toBe("EXPANSION_REJECTED");
    }

    const audit = registry.getAuditLog();
    expect(audit.some((ev) => ev.type === "reject_expansion")).toBe(true);
    expect(registry.getGrant("evil")).toBeUndefined();
  });

  it("audit trail is append-only and present for issue/allow/deny/revoke", () => {
    registry.issue({
      grant_id: "aud-g",
      principal: "agent-c",
      categories: ["destroy"],
      scope_paths: ["/w"],
      not_before: iso(0),
      not_after: iso(3_600_000),
      issued_by: "operator",
    });
    registry.isAllowed("agent-c", "destroy", "/w/a");
    registry.isAllowed("agent-c", "network", "/w/a");
    registry.revoke("aud-g");

    const log = registry.getAuditLog();
    expect(log.length).toBeGreaterThanOrEqual(4);
    expect(log.map((e) => e.type)).toEqual(
      expect.arrayContaining(["issue", "allow", "deny", "revoke"]),
    );
    // Append-only: cannot mutate prior entries via public API
    const snapshot = log.map((e) => e.event_id);
    registry.isAllowed("agent-c", "destroy", "/w/b");
    expect(registry.getAuditLog().slice(0, snapshot.length).map((e) => e.event_id)).toEqual(
      snapshot,
    );
  });

  it("runtime gate consults registry for destroy/network/credential", () => {
    const workspace = "/workspace/proj";
    const profile: SandboxProfile = {
      ...agentWorkspaceProfile(workspace),
      capabilities: [
        { action: "filesystem.delete", decision: "allow" },
        { action: "network.egress", decision: "allow" },
        { action: "secrets.read", decision: "allow" },
      ],
      network: { mode: "allowlist", allowlist: ["example.com"] },
    };

    registry.issue({
      grant_id: "gate-g",
      principal: "runner",
      categories: ["destroy"],
      scope_paths: [workspace],
      not_before: iso(0),
      not_after: iso(3_600_000),
      issued_by: "operator",
    });

    expect(ACTION_TO_DELEGATION_CATEGORY["filesystem.delete"]).toBe("destroy");
    expect(ACTION_TO_DELEGATION_CATEGORY["network.egress"]).toBe("network");
    expect(ACTION_TO_DELEGATION_CATEGORY["secrets.read"]).toBe("credential");

    const allowDestroy = capabilityGate({
      action: "filesystem.delete",
      profile,
      targetPath: `${workspace}/tmp`,
      principal: "runner",
      delegation_registry: registry,
    });
    expect(allowDestroy.verdict).toBe("allow");

    const denyNet = capabilityGate({
      action: "network.egress",
      profile,
      resource: "https://example.com",
      targetPath: workspace,
      principal: "runner",
      delegation_registry: registry,
    });
    expect(denyNet.verdict).toBe("BLOCKED");
    expect(denyNet.reason).toMatch(/delegation_denied:network/);

    const denyCred = evaluateCapability(profile, "secrets.read", {
      targetPath: `${workspace}/.env`,
      principal: "runner",
      delegation_registry: registry,
    });
    expect(denyCred.decision).toBe("deny");
    expect(denyCred.reason).toMatch(/delegation_denied:credential/);
  });

  it("Grill-Me can attach and query grants (pure API)", () => {
    const attachments = new Map<string, GrillMeDelegationAttachment>();
    const { grant, attachment } = attachDelegationGrant(registry, attachments, {
      contract_ref: "grill-session-1",
      grant_id: "grill-g",
      principal: "grill-agent",
      categories: ["credential"],
      scope_paths: ["/workspace/proj"],
      not_before: iso(0),
      not_after: iso(3_600_000),
      issued_by: "human",
    });
    expect(attachment.grant_ids).toContain(grant.grant_id);
    expect(listAttachedGrants(registry, attachments, "grill-session-1")).toHaveLength(1);

    const q = queryGrillDelegation(
      registry,
      "grill-agent",
      "credential",
      "/workspace/proj/secrets.env",
    );
    expect(q.allowed).toBe(true);

    const ok = validateGrillDelegationRefs(registry, attachment);
    expect(ok.ok).toBe(true);

    const bad = validateGrillDelegationRefs(registry, {
      kind: "GrillMeDelegationAttachment",
      contract_ref: "x",
      grant_ids: ["missing"],
      attached_at: iso(0),
    });
    expect(bad.ok).toBe(false);
    expect(bad.reasons[0]).toMatch(/missing_grant/);
  });
});
