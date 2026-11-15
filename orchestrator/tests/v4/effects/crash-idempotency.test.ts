import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decideRetry } from "../../../src/v4/contracts/index.js";
import { EFFECT_ERROR, EffectLedger } from "../../../src/v4/effects/index.js";
import { frozenClock, passFence, planInput, plannedAuthorizedDispatched } from "./helpers.js";

describe("M03 Effect Ledger — F06 crash / idempotency / no blind retry", () => {
  it("kill between write-ahead DISPATCHED and confirm ⇒ not DISPATCH_ALLOWED (S4 ★)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "m03-crash-"));
    const live = new EffectLedger({ rootDir: dir, clock: frozenClock(), fence: passFence() });
    const dispatched = await plannedAuthorizedDispatched(live);
    expect(dispatched.state).toBe("DISPATCHED");

    // Process death: new ledger instance, same durable root. No confirm ever recorded.
    const restarted = new EffectLedger({ rootDir: dir, clock: frozenClock(), fence: passFence() });
    const reloaded = await restarted.get(dispatched.effect_id);
    expect(reloaded?.state).toBe("DISPATCHED");
    const decision = await restarted.retryDecision(dispatched.effect_id);
    expect(decision).toEqual(decideRetry(reloaded!));
    expect(decision.action).not.toBe("DISPATCH_ALLOWED");
    expect(decision.action).toBe("RETRY_WITH_SAME_IDEMPOTENCY_KEY");

    await expect(restarted.beginDispatch(dispatched.effect_id)).rejects.toMatchObject({
      code: EFFECT_ERROR.BLIND_RETRY_BLOCKED,
    });

    const recovered = await restarted.recoverUncertainDispatches(dispatched.work_id);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.state).toBe("UNKNOWN");
    const after = await restarted.retryDecision(dispatched.effect_id);
    expect(after.action).not.toBe("DISPATCH_ALLOWED");
    expect(after.action).toBe("RETRY_WITH_SAME_IDEMPOTENCY_KEY");
  });

  it("UNKNOWN without reconcil path cannot be persisted; DISPATCHED retry is ESCALATE (INV-EFF-04)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "m03-eff04-"));
    const live = new EffectLedger({ rootDir: dir, clock: frozenClock(), fence: passFence() });
    const dispatched = await plannedAuthorizedDispatched(live, {
      effect_id: "eff_nopathex1",
      idempotency_key: undefined,
      integration: {
        integration_id: "pager",
        capabilities: { supports_idempotency_key: false, supports_status_query: false, supports_compensation: false },
      },
      authorization: { policy_decision_id: "pdec_nopathex1" },
    });
    const restarted = new EffectLedger({ rootDir: dir, clock: frozenClock(), fence: passFence() });
    await expect(
      restarted.transition(dispatched.effect_id, "UNKNOWN", [], { expected_state: "DISPATCHED" }),
    ).rejects.toMatchObject({ code: EFFECT_ERROR.FORBIDDEN });
    expect((await restarted.get(dispatched.effect_id))?.state).toBe("DISPATCHED");
    expect(await restarted.retryDecision(dispatched.effect_id)).toEqual({
      action: "ESCALATE",
      reason: "outcome_uncertain_and_no_safe_reconciliation_path",
    });
    expect(await restarted.recoverUncertainDispatches()).toEqual([]);
  });

  it("at most one in-flight attempt per exact idempotency key (S4 ★ concurrent)", async () => {
    const el = new EffectLedger({ clock: frozenClock(), fence: passFence() });
    const key = "deploy:prod:42";
    const results = await Promise.allSettled([
      el.plan(planInput({ effect_id: "eff_concuraaaa", idempotency_key: key, authorization: { policy_decision_id: "pdec_concuraaaa" } })),
      el.plan(planInput({ effect_id: "eff_concurbbbb", idempotency_key: key, authorization: { policy_decision_id: "pdec_concurbbbb" } })),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const fail = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    const rejected = fail[0] as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: EFFECT_ERROR.IDEMPOTENCY_IN_FLIGHT });
  });

  it("compares idempotency keys without lossy sanitization (a/b ≠ a_b)", async () => {
    const el = new EffectLedger({ clock: frozenClock(), fence: passFence() });
    await el.plan(
      planInput({
        effect_id: "eff_slashaaaa",
        idempotency_key: "a/b",
        authorization: { policy_decision_id: "pdec_slashaaaa" },
      }),
    );
    const other = await el.plan(
      planInput({
        effect_id: "eff_underscbb",
        idempotency_key: "a_b",
        authorization: { policy_decision_id: "pdec_underscbb" },
      }),
    );
    expect(other.idempotency_key).toBe("a_b");
  });

  it("same-key replay returns the key and does not open a second DISPATCHED", async () => {
    const dir = mkdtempSync(join(tmpdir(), "m03-replay-"));
    const el = new EffectLedger({ rootDir: dir, clock: frozenClock(), fence: passFence() });
    const dispatched = await plannedAuthorizedDispatched(el);
    await el.recoverUncertainDispatches();
    const replay = await el.replayWithSameIdempotencyKey(dispatched.effect_id);
    expect(replay.idempotency_key).toBe(dispatched.idempotency_key);
    expect(replay.record.state).toBe("UNKNOWN");
    expect(await el.listOpen(dispatched.work_id)).toHaveLength(1);
  });

  it("stale fence blocks EXTERNAL DISPATCHED (F05)", async () => {
    const el = new EffectLedger({
      clock: frozenClock(),
      fence: async () => ({
        work_id: "work_abc123def",
        fencing_epoch: 9,
        assertFresh: () => {
          throw new Error("lease revoked");
        },
      }),
    });
    const planned = await el.plan(planInput({ effect_id: "eff_fencedaaa", authorization: { policy_decision_id: "pdec_fencedaaa" } }));
    await el.authorize(planned.effect_id, planned.authorization!, { expected_state: "PLANNED" });
    await expect(el.beginDispatch(planned.effect_id)).rejects.toMatchObject({ code: EFFECT_ERROR.FENCED });
    expect((await el.get(planned.effect_id))?.state).toBe("AUTHORIZED");
  });
});
