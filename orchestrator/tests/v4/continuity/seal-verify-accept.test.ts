import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { CAPSULE_AUTHORITY_MODEL, validateExecutionCapsule } from "../../../src/v4/contracts/index.js";
import { CapsuleVerifyFailed, CONTINUITY_ERROR, ContinuityError } from "../../../src/v4/continuity/index.js";
import { draft } from "../ledger/helpers.js";
import { NOW, POLICY_ID, READ_GRANT, TASK, WORK, resign, seededWorld } from "./helpers.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("M04 seal / verify / accept round-trip", () => {
  it("seals allowlisted fields only, signs, verifies, and accepts with policy-rederived grants", async () => {
    const world = await seededWorld();
    roots.push(world.root);

    const sealed = await world.service.seal(WORK, { base_checkpoint_id: world.checkpoint.checkpoint_id });
    expect(sealed.authority_model).toBe(CAPSULE_AUTHORITY_MODEL);
    expect(sealed.integrity.signature?.alg).toBe("Ed25519");
    expect("permissions" in sealed).toBe(false);
    expect("handoff" in sealed).toBe(false);
    expect(sealed.delegable_grants.every((g) => Object.keys(g).sort().join(",") === "expires_at,grant_ref,scope")).toBe(
      true,
    );
    expect(validateExecutionCapsule(sealed, { now: NOW }).valid).toBe(true);

    const verified = await world.service.verify(sealed, { now: NOW, trusted_key_ids: [world.signer.key_id] });
    expect(verified.issues).toEqual([]);
    expect(verified.valid).toBe(true);

    const before = JSON.stringify(await world.rt.ledger.read(WORK));
    const accepted = await world.service.accept(sealed, { now: NOW, policy_id: POLICY_ID });
    expect(accepted.authority_source).toBe("POLICY_REDERIVED");
    expect(accepted.work_state_source).toBe("EVENT_LEDGER");
    expect(accepted.effective_grant_refs).toEqual([READ_GRANT.grant_ref]);
    expect(accepted.replay_id).toBe(sealed.capsule_id);
    expect(JSON.stringify(await world.rt.ledger.read(WORK))).toBe(before);

    const bound = world.service.lastBoundWorkState();
    expect(bound?.source).toBe("EVENT_LEDGER");
    expect(bound?.tasks).toEqual([{ task_id: "task_abc123def", state: "RUNNING" }]);
    expect(world.service.lastExecutorContext()?.handoff).toBeUndefined();
  });

  it("V4.1 verify fails closed without a signature", async () => {
    const world = await seededWorld();
    roots.push(world.root);
    const sealed = await world.service.seal(WORK, { base_checkpoint_id: world.checkpoint.checkpoint_id });
    const { signature: _s, ...integrity } = sealed.integrity;
    void _s;
    const unsigned = { ...sealed, integrity };
    const res = await world.service.verify(unsigned, { now: NOW, trusted_key_ids: [world.signer.key_id] });
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === "INV-CAP-SIG")).toBe(true);
  });

  it("rejects an untrusted signature key_id", async () => {
    const world = await seededWorld();
    roots.push(world.root);
    const sealed = await world.service.seal(WORK, { base_checkpoint_id: world.checkpoint.checkpoint_id });
    const res = await world.service.verify(sealed, { now: NOW, trusted_key_ids: ["k_not_trusted_0001"] });
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.path.includes("key_id"))).toBe(true);
  });

  it("rejects expired delegable grants at verify (INV-CAP-06)", async () => {
    const world = await seededWorld();
    roots.push(world.root);
    const sealed = await world.service.seal(WORK, { base_checkpoint_id: world.checkpoint.checkpoint_id });
    const expired = resign(
      sealed,
      {
        delegable_grants: [{ ...READ_GRANT, expires_at: "2026-11-15T11:00:00.000Z" }],
      },
      (m) => ({ key_id: world.signer.key_id, value_b64: world.signer.sign(m) }),
    );
    const res = await world.service.verify(expired, { now: NOW, trusted_key_ids: [world.signer.key_id] });
    expect(res.valid).toBe(false);
    expect(res.issues.some((i) => i.code === "INV-CAP-06")).toBe(true);
  });

  it("consumes replay_id once and rejects a second accept (D03)", async () => {
    const world = await seededWorld();
    roots.push(world.root);
    const sealed = await world.service.seal(WORK, { base_checkpoint_id: world.checkpoint.checkpoint_id });
    await world.service.accept(sealed, { now: NOW, policy_id: POLICY_ID });
    await expect(world.service.accept(sealed, { now: NOW, policy_id: POLICY_ID })).rejects.toBeInstanceOf(ContinuityError);
    try {
      await world.service.accept(sealed, { now: NOW, policy_id: POLICY_ID });
    } catch (e) {
      expect((e as ContinuityError).code).toBe(CONTINUITY_ERROR.REPLAY_REUSED);
    }
  });

  it("fails closed when a lease is required but M13 port is absent", async () => {
    const world = await seededWorld({ lease_required: true });
    roots.push(world.root);
    const sealed = await world.service.seal(WORK, { base_checkpoint_id: world.checkpoint.checkpoint_id });
    await expect(world.service.accept(sealed, { now: NOW, policy_id: POLICY_ID })).rejects.toMatchObject({
      code: CONTINUITY_ERROR.LEASE_REQUIRED,
    });
  });

  it("rejects a superseded capsule behind a newer VERIFIED checkpoint", async () => {
    const world = await seededWorld();
    roots.push(world.root);
    const sealed = await world.service.seal(WORK, { base_checkpoint_id: world.checkpoint.checkpoint_id });
    const head = await world.rt.ledger.head(WORK);
    await world.rt.ledger.append(WORK, [draft("task.state_changed", { task_id: TASK, state: "RUNNING" })], {
      expected_head_seq: head,
    });
    const newer = await world.rt.checkpoints.create(WORK, head + 1);
    expect(newer.consistency).toBe("VERIFIED");
    await expect(world.service.accept(sealed, { now: NOW, policy_id: POLICY_ID })).rejects.toMatchObject({
      code: CONTINUITY_ERROR.SUPERSEDED,
    });
  });

  it("accept throws CapsuleVerifyFailed rather than binding on a digest mismatch", async () => {
    const world = await seededWorld();
    roots.push(world.root);
    const sealed = await world.service.seal(WORK, { base_checkpoint_id: world.checkpoint.checkpoint_id });
    const tampered = {
      ...sealed,
      pending_items: ["injected"],
    };
    await expect(world.service.accept(tampered, { now: NOW, policy_id: POLICY_ID })).rejects.toBeInstanceOf(
      CapsuleVerifyFailed,
    );
  });
});
