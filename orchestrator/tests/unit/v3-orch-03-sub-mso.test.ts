/**
 * V3-ORCH-03 — Orquestração Hierárquica Delimitada (Sub-MSOs).
 * Prove: Sub-MSO NÃO excede orçamento nem escala permissões acima do delegado.
 */
import { describe, it, expect } from "vitest";
import {
  spawnSubMso,
  spawnNestedSubMso,
  attenuateCapabilities,
  capabilitiesAreSubset,
  enforceCapability,
  enforceSpend,
  assertCapability,
  assertSpend,
  terminateSubMso,
  remainingTokens,
  SubMsoError,
  SUB_MSO_SCHEMA_VERSION,
  type MsoCapability,
  type SubMsoHandle,
} from "../../src/v3/mso/index.js";

const PARENT_CAPS: readonly MsoCapability[] = [
  "filesystem.read",
  "filesystem.write",
  "shell.execute",
  "git.read",
];

const T0 = "2026-11-21T23:39:00.000Z";
const clock = () => new Date(T0);

describe("V3-ORCH-03 Sub-MSO hierarchical attenuation", () => {
  it("spawnSubMso inherits attenuated caps (subset of parent) and budget", () => {
    const sub = spawnSubMso(
      PARENT_CAPS,
      { max_tokens: 1_000, parent_remaining_tokens: 5_000 },
      {
        parent_mso_id: "mso-parent",
        requested_caps: ["filesystem.read", "git.read"],
        clock,
        sub_mso_id: "sub-mso-test-01",
      },
    );

    expect(sub.kind).toBe("SubMso");
    expect(sub.schema_version).toBe(SUB_MSO_SCHEMA_VERSION);
    expect(sub.ephemeral).toBe(true);
    expect(sub.parent_mso_id).toBe("mso-parent");
    expect(sub.sub_mso_id).toBe("sub-mso-test-01");
    expect(sub.capabilities).toEqual(["filesystem.read", "git.read"]);
    expect(capabilitiesAreSubset(sub.capabilities, PARENT_CAPS)).toBe(true);
    expect(sub.budget.max_tokens).toBe(1_000);
    expect(sub.budget.tokens_spent).toBe(0);
    expect(sub.budget.parent_remaining_tokens).toBe(5_000);
    expect(sub.created_at).toBe(T0);
  });

  it("spawn without requested_caps copies parent set (still ⊆)", () => {
    const sub = spawnSubMso(PARENT_CAPS, { max_tokens: 100 }, { clock });
    expect(sub.capabilities).toEqual([...PARENT_CAPS].sort());
    expect(capabilitiesAreSubset(sub.capabilities, PARENT_CAPS)).toBe(true);
  });

  it("rejects capability escalation above parent at spawn", () => {
    expect(() =>
      spawnSubMso(PARENT_CAPS, { max_tokens: 100 }, {
        requested_caps: ["filesystem.read", "secrets.read"],
      }),
    ).toThrow(SubMsoError);

    try {
      spawnSubMso(PARENT_CAPS, { max_tokens: 100 }, {
        requested_caps: ["network.egress"],
      });
      expect.unreachable("should reject escalation");
    } catch (e) {
      expect(e).toBeInstanceOf(SubMsoError);
      expect((e as SubMsoError).rejectCode).toBe("CAPABILITY_ESCALATION");
    }
  });

  it("rejects budget escalation above parent_remaining_tokens", () => {
    expect(() =>
      spawnSubMso(PARENT_CAPS, {
        max_tokens: 2_000,
        parent_remaining_tokens: 500,
      }),
    ).toThrow(SubMsoError);

    try {
      spawnSubMso(PARENT_CAPS, {
        max_tokens: 501,
        parent_remaining_tokens: 500,
      });
      expect.unreachable("should reject budget escalation");
    } catch (e) {
      expect(e).toBeInstanceOf(SubMsoError);
      expect((e as SubMsoError).rejectCode).toBe("BUDGET_ESCALATION");
    }
  });

  it("enforceSpend accepts within budget and rejects overrun", () => {
    const sub = spawnSubMso(PARENT_CAPS, { max_tokens: 100 }, {
      requested_caps: ["filesystem.read"],
      clock,
    });

    expect(enforceSpend(sub, 40)).toEqual({ ok: true });
    expect(sub.budget.tokens_spent).toBe(40);
    expect(remainingTokens(sub)).toBe(60);

    expect(enforceSpend(sub, 60)).toEqual({ ok: true });
    expect(sub.budget.tokens_spent).toBe(100);

    const over = enforceSpend(sub, 1);
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.code).toBe("BUDGET_EXCEEDED");
    }
    expect(sub.budget.tokens_spent).toBe(100); // unchanged on reject
  });

  it("assertSpend throws BUDGET_EXCEEDED when over", () => {
    const sub = spawnSubMso(PARENT_CAPS, { max_tokens: 10 }, { clock });
    assertSpend(sub, 10);
    expect(() => assertSpend(sub, 1)).toThrow(SubMsoError);
    try {
      assertSpend(sub, 1);
    } catch (e) {
      expect((e as SubMsoError).rejectCode).toBe("BUDGET_EXCEEDED");
    }
  });

  it("enforceCapability allows attenuated set and rejects others", () => {
    const sub = spawnSubMso(PARENT_CAPS, { max_tokens: 50 }, {
      requested_caps: ["filesystem.read", "shell.execute"],
      clock,
    });

    expect(enforceCapability(sub, "filesystem.read")).toEqual({ ok: true });
    expect(enforceCapability(sub, "shell.execute")).toEqual({ ok: true });

    const denied = enforceCapability(sub, "filesystem.write");
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.code).toBe("CAPABILITY_NOT_DELEGATED");
    }

    // Parent had git.read but child did not inherit it
    expect(enforceCapability(sub, "git.read").ok).toBe(false);

    // Escalation attempt: capability never on parent
    expect(enforceCapability(sub, "secrets.inject").ok).toBe(false);
  });

  it("assertCapability throws CAPABILITY_NOT_DELEGATED", () => {
    const sub = spawnSubMso(PARENT_CAPS, { max_tokens: 10 }, {
      requested_caps: ["git.read"],
    });
    assertCapability(sub, "git.read");
    expect(() => assertCapability(sub, "git.mutate")).toThrow(SubMsoError);
    try {
      assertCapability(sub, "git.mutate");
    } catch (e) {
      expect((e as SubMsoError).rejectCode).toBe("CAPABILITY_NOT_DELEGATED");
    }
  });

  it("nested Sub-MSO further attenuates and cannot exceed parent remaining", () => {
    const parent = spawnSubMso(PARENT_CAPS, { max_tokens: 200 }, {
      requested_caps: ["filesystem.read", "filesystem.write", "git.read"],
      parent_mso_id: "mso-root",
      clock,
    });
    assertSpend(parent, 50); // remaining 150

    const child = spawnNestedSubMso(
      parent,
      { max_tokens: 100 },
      {
        requested_caps: ["filesystem.read", "git.read"],
        clock,
        sub_mso_id: "sub-mso-nested",
      },
    );

    expect(child.parent_mso_id).toBe(parent.sub_mso_id);
    expect(child.capabilities).toEqual(["filesystem.read", "git.read"]);
    expect(capabilitiesAreSubset(child.capabilities, parent.capabilities)).toBe(
      true,
    );
    expect(child.budget.max_tokens).toBe(100);
    expect(child.budget.parent_remaining_tokens).toBe(150);

    // Nested cannot request a cap parent Sub-MSO does not have
    expect(() =>
      spawnNestedSubMso(parent, { max_tokens: 10 }, {
        requested_caps: ["shell.execute"],
      }),
    ).toThrow(SubMsoError);

    // Nested cannot take more than parent's remaining
    expect(() =>
      spawnNestedSubMso(parent, { max_tokens: 151 }),
    ).toThrow(SubMsoError);
  });

  it("terminate blocks further spend and capability use", () => {
    const sub = spawnSubMso(PARENT_CAPS, { max_tokens: 100 }, {
      requested_caps: ["filesystem.read"],
      clock,
    });
    terminateSubMso(sub, clock);
    expect(sub.terminated_at).toBe(T0);
    const spend = enforceSpend(sub, 1);
    expect(spend.ok).toBe(false);
    if (!spend.ok) expect(spend.code).toBe("TERMINATED");
    const cap = enforceCapability(sub, "filesystem.read");
    expect(cap.ok).toBe(false);
    if (!cap.ok) expect(cap.code).toBe("TERMINATED");
  });

  it("attenuateCapabilities is deterministic and sorted", () => {
    const a = attenuateCapabilities(PARENT_CAPS, [
      "git.read",
      "filesystem.read",
      "git.read",
    ]);
    const b = attenuateCapabilities(PARENT_CAPS, [
      "filesystem.read",
      "git.read",
    ]);
    expect(a).toEqual(b);
    expect(a).toEqual(["filesystem.read", "git.read"]);
  });

  it("rejects empty parent caps and invalid budgets", () => {
    expect(() => spawnSubMso([], { max_tokens: 10 })).toThrow(SubMsoError);
    expect(() => spawnSubMso(PARENT_CAPS, { max_tokens: -1 })).toThrow(
      SubMsoError,
    );
    expect(() =>
      spawnSubMso(PARENT_CAPS, {
        max_tokens: 10,
        parent_remaining_tokens: -5,
      }),
    ).toThrow(SubMsoError);
  });

  it("prove end-to-end: Sub-MSO cannot exceed budget nor escalate permissions", () => {
    const parentCaps: MsoCapability[] = [
      "filesystem.read",
      "filesystem.write",
      "shell.execute",
    ];
    const delegatedBudget = 80;

    // Attempt escalate at spawn → rejected
    expect(() =>
      spawnSubMso(parentCaps, { max_tokens: delegatedBudget }, {
        requested_caps: ["filesystem.read", "deploy.publish"],
      }),
    ).toThrow(/escalate|CAPABILITY_ESCALATION/i);

    const sub: SubMsoHandle = spawnSubMso(
      parentCaps,
      { max_tokens: delegatedBudget, parent_remaining_tokens: 200 },
      { requested_caps: ["filesystem.read", "filesystem.write"], clock },
    );

    // Allowed path
    assertCapability(sub, "filesystem.read");
    assertSpend(sub, 50);
    expect(remainingTokens(sub)).toBe(30);

    // Permission escalation at runtime → rejected
    const escalated = enforceCapability(sub, "shell.execute"); // parent had it; child did not
    expect(escalated.ok).toBe(false);
    if (!escalated.ok) expect(escalated.code).toBe("CAPABILITY_NOT_DELEGATED");

    const privileged = enforceCapability(sub, "secrets.read");
    expect(privileged.ok).toBe(false);

    // Budget overrun → rejected; spend frozen
    const overrun = enforceSpend(sub, 31);
    expect(overrun.ok).toBe(false);
    if (!overrun.ok) expect(overrun.code).toBe("BUDGET_EXCEEDED");
    expect(sub.budget.tokens_spent).toBe(50);
    expect(sub.budget.tokens_spent).toBeLessThanOrEqual(sub.budget.max_tokens);
  });
});
