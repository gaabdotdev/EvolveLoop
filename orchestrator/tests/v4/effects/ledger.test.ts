import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decideRetry, OPEN_EFFECT_STATES, type EffectLedgerPort } from "../../../src/v4/contracts/index.js";
import { EFFECT_ERROR, EffectLedger, EffectLedgerError } from "../../../src/v4/effects/index.js";
import { cpEvidence, frozenClock, passFence, planInput, plannedAuthorizedDispatched } from "./helpers.js";

function ledger(rootDir?: string): EffectLedger {
  return new EffectLedger({ rootDir, clock: frozenClock(), fence: passFence() });
}

describe("M03 Effect Ledger — port + state machine", () => {
  it("is a structural EffectLedgerPort", () => {
    const impl: EffectLedgerPort = ledger();
    expect(typeof impl.plan).toBe("function");
    expect(typeof impl.transition).toBe("function");
    expect(typeof impl.retryDecision).toBe("function");
  });

  it("plans PLANNED, authorizes, write-ahead DISPATCHED, then COMMITTED with CP evidence", async () => {
    const el = ledger();
    const planned = await el.plan(planInput());
    expect(planned.state).toBe("PLANNED");
    const authed = await el.authorize(planned.effect_id, planned.authorization!, { expected_state: "PLANNED" });
    expect(authed.state).toBe("AUTHORIZED");
    const dispatched = await el.beginDispatch(planned.effect_id);
    expect(dispatched.state).toBe("DISPATCHED");
    await el.registerEvidence(cpEvidence(planned.effect_id, "evd_abc123def"));
    const committed = await el.transition(planned.effect_id, "COMMITTED", ["evd_abc123def"], {
      expected_state: "DISPATCHED",
    });
    expect(committed.state).toBe("COMMITTED");
    expect(committed.authorization?.policy_decision_id).toBe("pdec_abc123def");
    const audit = el.auditTrail(planned.effect_id);
    expect(audit.map((a) => a.to)).toEqual(["PLANNED", "AUTHORIZED", "DISPATCHED", "COMMITTED"]);
    expect(audit.every((a) => a.integrity_claim === "audit_only_not_non_repudiation")).toBe(true);
  });

  it("rejects illegal transitions", async () => {
    const el = ledger();
    const planned = await el.plan(planInput());
    await expect(el.transition(planned.effect_id, "COMMITTED", [], { expected_state: "PLANNED" })).rejects.toMatchObject({
      code: EFFECT_ERROR.FORBIDDEN,
    });
  });

  it("CAS: expected_state mismatch is CONFLICT", async () => {
    const el = ledger();
    const planned = await el.plan(planInput());
    await expect(
      el.transition(planned.effect_id, "AUTHORIZED", [], { expected_state: "DISPATCHED" }),
    ).rejects.toMatchObject({ code: EFFECT_ERROR.CONFLICT });
  });

  it("retryDecision is identically decideRetry(stored)", async () => {
    const el = ledger();
    const dispatched = await plannedAuthorizedDispatched(el);
    const stored = await el.get(dispatched.effect_id);
    expect(stored).toBeDefined();
    expect(await el.retryDecision(dispatched.effect_id)).toEqual(decideRetry(stored!));
  });

  it("listOpen returns AUTHORIZED/DISPATCHED/UNKNOWN for handoff", async () => {
    const el = ledger();
    const dispatched = await plannedAuthorizedDispatched(el);
    const open = await el.listOpen(dispatched.work_id);
    expect(open).toHaveLength(1);
    expect(OPEN_EFFECT_STATES as readonly string[]).toContain(open[0]!.state);
    await el.registerEvidence(cpEvidence(dispatched.effect_id, "evd_abc123def"));
    await el.transition(dispatched.effect_id, "COMMITTED", ["evd_abc123def"], { expected_state: "DISPATCHED" });
    expect(await el.listOpen(dispatched.work_id)).toEqual([]);
  });

  it("NOT_EXECUTED with CP evidence is terminal on the same effect_id", async () => {
    const el = ledger();
    const planned = await el.plan(planInput());
    await el.authorize(planned.effect_id, planned.authorization!, { expected_state: "PLANNED" });
    await el.registerEvidence(cpEvidence(planned.effect_id, "evd_abc123def"));
    const ne = await el.transition(planned.effect_id, "NOT_EXECUTED", ["evd_abc123def"], { expected_state: "AUTHORIZED" });
    expect(ne.state).toBe("NOT_EXECUTED");
    expect(await el.retryDecision(planned.effect_id)).toEqual({
      action: "FORBIDDEN",
      reason: "terminal_create_new_effect_with_fresh_authorization",
    });
  });

  it("rejects path-shaped ids at the trust boundary (F08)", async () => {
    const el = ledger();
    await expect(el.plan(planInput({ effect_id: "eff_../etc" as never }))).rejects.toBeInstanceOf(EffectLedgerError);
    await expect(el.get("eff_foo/bar")).rejects.toMatchObject({ code: EFFECT_ERROR.INVALID });
  });

  it("restore of COMMITTED does not un-commit (D19)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "m03-d19-"));
    const a = ledger(dir);
    const dispatched = await plannedAuthorizedDispatched(a);
    await a.registerEvidence(cpEvidence(dispatched.effect_id, "evd_abc123def"));
    await a.transition(dispatched.effect_id, "COMMITTED", ["evd_abc123def"], { expected_state: "DISPATCHED" });
    const b = ledger(dir);
    const reloaded = await b.get(dispatched.effect_id);
    expect(reloaded?.state).toBe("COMMITTED");
    expect((await b.retryDecision(dispatched.effect_id)).action).toBe("FORBIDDEN");
  });

  it("emits typed effect.* payloads without F12 CONTROL names", async () => {
    const el = ledger();
    await plannedAuthorizedDispatched(el);
    const types = el.domainEvents().map((e) => e.type);
    expect(types).toContain("effect.planned");
    expect(types).toContain("effect.state_changed");
    for (const ev of el.domainEvents()) {
      expect(ev.payload).not.toHaveProperty("next_action");
      expect(ev.payload).not.toHaveProperty("objective");
      expect(ev.payload).not.toHaveProperty("permissions");
    }
  });

  it("INTERNAL dispatch does not require a fence", async () => {
    const el = new EffectLedger({ clock: frozenClock() });
    const planned = await el.plan(
      planInput({
        effect_id: "eff_internal01",
        effect_class: "INTERNAL",
        idempotency_key: "internal-1",
        authorization: { policy_decision_id: "pdec_internal01" },
      }),
    );
    await el.authorize(planned.effect_id, planned.authorization!, { expected_state: "PLANNED" });
    const dispatched = await el.beginDispatch(planned.effect_id);
    expect(dispatched.state).toBe("DISPATCHED");
  });

  it("links one policy_decision_id to one effect (F04)", async () => {
    const el = ledger();
    await el.plan(planInput({ effect_id: "eff_firstaaaa" }));
    await expect(
      el.plan(planInput({ effect_id: "eff_secondbbb", idempotency_key: "other-key" })),
    ).rejects.toMatchObject({ code: EFFECT_ERROR.AUTHORIZATION_REUSED });
  });
});
