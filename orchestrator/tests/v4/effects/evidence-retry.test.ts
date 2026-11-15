import { describe, expect, it } from "vitest";
import { decideRetry } from "../../../src/v4/contracts/index.js";
import { EFFECT_ERROR, EffectLedger } from "../../../src/v4/effects/index.js";
import {
  cpEvidence,
  executorLie,
  frozenClock,
  passFence,
  planInput,
  plannedAuthorizedDispatched,
} from "./helpers.js";

describe("M03 Effect Ledger — D05 executor lie / UNKNOWN / fork", () => {
  it("executor-only COMMITTED citation is rejected; state stays DISPATCHED (S4 ★)", async () => {
    const el = new EffectLedger({ clock: frozenClock(), fence: passFence() });
    const dispatched = await plannedAuthorizedDispatched(el);
    await el.registerEvidence(executorLie(dispatched.effect_id, "evd_liecommit"));
    await expect(
      el.transition(dispatched.effect_id, "COMMITTED", ["evd_liecommit"], { expected_state: "DISPATCHED" }),
    ).rejects.toMatchObject({ code: EFFECT_ERROR.EVIDENCE_NOT_CP_SIDE });
    expect((await el.get(dispatched.effect_id))?.state).toBe("DISPATCHED");
    expect((await el.retryDecision(dispatched.effect_id)).action).not.toBe("DISPATCH_ALLOWED");
  });

  it("executor-only NOT_EXECUTED citation is rejected so a lie cannot induce a fresh effect_id path", async () => {
    const el = new EffectLedger({ clock: frozenClock(), fence: passFence() });
    const dispatched = await plannedAuthorizedDispatched(el);
    await el.registerEvidence(executorLie(dispatched.effect_id, "evd_lienotexx"));
    await expect(
      el.transition(dispatched.effect_id, "NOT_EXECUTED", ["evd_lienotexx"], { expected_state: "DISPATCHED" }),
    ).rejects.toMatchObject({ code: EFFECT_ERROR.EVIDENCE_NOT_CP_SIDE });
    expect((await el.get(dispatched.effect_id))?.state).toBe("DISPATCHED");
    expect(await el.retryDecision(dispatched.effect_id)).toEqual(
      decideRetry({
        state: "DISPATCHED",
        idempotency_key: dispatched.idempotency_key,
        integration: dispatched.integration,
        authorization: dispatched.authorization,
        fork_inherited: false,
        effect_class: "EXTERNAL",
      }),
    );
  });

  it("dangling evidence_ids are rejected", async () => {
    const el = new EffectLedger({ clock: frozenClock(), fence: passFence() });
    const dispatched = await plannedAuthorizedDispatched(el);
    await expect(
      el.transition(dispatched.effect_id, "COMMITTED", ["evd_missingxx"], { expected_state: "DISPATCHED" }),
    ).rejects.toMatchObject({ code: EFFECT_ERROR.EVIDENCE_UNRESOLVED });
  });

  it("reconciliation with CP evidence can COMMITTED an UNKNOWN effect", async () => {
    const el = new EffectLedger({ clock: frozenClock(), fence: passFence() });
    const dispatched = await plannedAuthorizedDispatched(el);
    await el.transition(dispatched.effect_id, "UNKNOWN", [], { expected_state: "DISPATCHED" });
    await el.registerEvidence(cpEvidence(dispatched.effect_id, "evd_reconcil1"));
    const committed = await el.recordReconciliation(dispatched.effect_id, {
      at: "2026-11-15T12:00:00.000Z",
      method: "STATUS_QUERY",
      observed: "remote contains the object",
      evidence_ids: ["evd_reconcil1"],
      outcome: "CONFIRMED_COMMITTED",
    });
    expect(committed.state).toBe("COMMITTED");
    expect(committed.reconciliation).toHaveLength(1);
    expect((await el.retryDecision(dispatched.effect_id)).action).toBe("FORBIDDEN");
  });

  it("INCONCLUSIVE reconciliation on UNKNOWN escalates (no safe automatic action)", async () => {
    const el = new EffectLedger({ clock: frozenClock(), fence: passFence() });
    const dispatched = await plannedAuthorizedDispatched(el);
    await el.transition(dispatched.effect_id, "UNKNOWN", [], { expected_state: "DISPATCHED" });
    const esc = await el.recordReconciliation(dispatched.effect_id, {
      at: "2026-11-15T12:00:00.000Z",
      method: "STATUS_QUERY",
      observed: "remote timeout",
      evidence_ids: [],
      outcome: "INCONCLUSIVE",
    });
    expect(esc.state).toBe("ESCALATED");
    expect(await el.retryDecision(dispatched.effect_id)).toEqual({
      action: "ESCALATE",
      reason: "awaiting_authorized_resolution",
    });
  });

  it("fork-inherited EXTERNAL effects are FORBIDDEN to re-dispatch (D08)", async () => {
    const el = new EffectLedger({ clock: frozenClock(), fence: passFence() });
    const original = await plannedAuthorizedDispatched(el);
    const inherited = await el.cloneAsInherited(original.effect_id, {
      work_id: "work_forkaaaaaa",
      effect_id: "eff_forkaaaaaa",
      execution_id: "exec_forkaaaaaa",
    });
    expect(inherited.fork_inherited).toBe(true);
    expect(inherited.work_id).toBe("work_forkaaaaaa");
    expect((await el.get(original.effect_id))?.fork_inherited).toBe(false);
    expect(await el.retryDecision(inherited.effect_id)).toEqual({
      action: "FORBIDDEN",
      reason: "fork_inherited_external_effect_requires_new_effect_and_authorization",
    });
    await expect(el.beginDispatch(inherited.effect_id)).rejects.toMatchObject({
      code: EFFECT_ERROR.BLIND_RETRY_BLOCKED,
    });
  });

  it("status-query-only UNKNOWN reconciles first (no blind retry)", async () => {
    const el = new EffectLedger({ clock: frozenClock(), fence: passFence() });
    const dispatched = await plannedAuthorizedDispatched(el, {
      effect_id: "eff_queryonly1",
      idempotency_key: undefined,
      integration: {
        integration_id: "http-api",
        capabilities: { supports_idempotency_key: false, supports_status_query: true, supports_compensation: false },
      },
      authorization: { policy_decision_id: "pdec_queryonly1" },
    });
    await el.transition(dispatched.effect_id, "UNKNOWN", [], { expected_state: "DISPATCHED" });
    expect(await el.retryDecision(dispatched.effect_id)).toEqual({
      action: "RECONCILE_FIRST",
      reason: "outcome_uncertain_query_target_before_any_retry",
    });
  });

  it("plan without authorization cannot dispatch", async () => {
    const el = new EffectLedger({ clock: frozenClock(), fence: passFence() });
    const planned = await el.plan(
      planInput({
        effect_id: "eff_noauthaaaa",
        authorization: undefined,
        idempotency_key: "no-auth-key",
      }),
    );
    expect(await el.retryDecision(planned.effect_id)).toEqual({ action: "FORBIDDEN", reason: "not_authorized" });
  });
});
