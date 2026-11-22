/**
 * V5-M06 — Verification, Evidence & Delivery unification (ADR-005 / REMED-M5).
 * No PASS without local_execution; agent claim never → PASS.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  StateDb,
  defaultStateDbPath,
} from "../../src/v3/state-db/store.js";
import { GoalContractStore } from "../../src/v3/goal-contract/store.js";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { PersistentWorkRuntime } from "../../src/v3/work-runtime/index.js";
import {
  CUSTOM_VERIFIER_ID,
  evaluateWorkCriteria,
  getWorkDelivery,
  listIgnoredEvidenceForWork,
  NATIVE_LOCAL_COMMAND_ID,
  openVerification,
  projectFromAgentClaim,
  readWorkEvidenceProvenance,
} from "../../src/v3/verification/index.js";
import {
  evaluateWorkCriteria as evaluateFromWorkRuntime,
  getWorkDelivery as getDeliveryFromWorkRuntime,
} from "../../src/v3/work-runtime/index.js";

describe("V5-M06 Verification & Delivery", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  function freshWs(tag: string): string {
    const ws = mkdtempSync(join(tmpdir(), `v5-m06-${tag}-`));
    dirs.push(ws);
    return ws;
  }

  it("paths.verificationDir additive", () => {
    const paths = resolveV3DataPaths(join(freshWs("paths"), "v3"));
    expect(paths.verificationDir).toContain("verification");
  });

  it("evaluateWorkCriteria uses Goal Contract + evidence linkage — ignores agent claim", () => {
    const ws = freshWs("crit");
    const runtime = new PersistentWorkRuntime({ workspaceRoot: ws });
    const work = runtime.open({
      work_id: "w-crit",
      objective: "Verify criteria API",
      criteria: [
        {
          id: "c1",
          description: "Must pass with evidence",
          mandatory: true,
          evidence_required: ["e1"],
        },
      ],
    });

    const eval1 = evaluateWorkCriteria("w-crit", { workspaceRoot: ws });
    expect(eval1.kind).toBe("WorkCriteriaEvaluation");
    expect(eval1.agent_claim_ignored).toBe(true);
    expect(eval1.eligible_true_full_pass).toBe(false);
    expect(eval1.criteria[0]?.evidence_links.some((l) => l.evidence_id === "e1")).toBe(
      true,
    );
    expect(eval1.criteria[0]?.evidence_links[0]?.present_in_statedb).toBe(false);

    const eval2 = evaluateFromWorkRuntime("w-crit", { workspaceRoot: ws });
    expect(eval2.work_id).toBe(work.work_id);
    expect(eval2.eligible_true_full_pass).toBe(false);

    const paths = resolveV3DataPaths(join(ws, ".evolveloop", "v3"));
    const goals = new GoalContractStore(paths.goalContractsDir);
    goals.updateCriterionState(work.goal_contract_id!, "c1", "PASS", []);
    const eval3 = evaluateWorkCriteria("w-crit", { workspaceRoot: ws });
    expect(eval3.eligible_true_full_pass).toBe(false);
    expect(eval3.reasons.some((r) => r.includes("missing_evidence"))).toBe(true);

    goals.updateCriterionState(work.goal_contract_id!, "c1", "PASS", ["e1"]);
    const eval4 = evaluateWorkCriteria("w-crit", { workspaceRoot: ws });
    expect(eval4.eligible_true_full_pass).toBe(true);
  });

  it("agent claim cannot yield Delivery PASS", () => {
    const ws = freshWs("claim");
    const proj = projectFromAgentClaim({
      workspace: ws,
      work_id: "w-claim",
      agent_claim_pass: true,
      kick_started: true,
    });
    expect(proj.agent_claim_cannot_pass).toBe(true);
    expect(proj.status).not.toBe("PASS");
    expect(proj.status).toBe("UNVERIFIED");
    expect(proj.provenance).toBe("absent");
  });

  it("getWorkDelivery: local_execution exit 0 → PASS; without run → not PASS", () => {
    const ws = freshWs("proj");
    const runtime = new PersistentWorkRuntime({ workspaceRoot: ws });
    runtime.open({
      work_id: "w-pass",
      objective: "delivery projection",
      criteria: [
        {
          id: "c1",
          description: "x",
          mandatory: true,
          evidence_required: ["smoke"],
        },
      ],
    });

    const pass = getWorkDelivery("w-pass", {
      workspaceRoot: ws,
      run: "true",
    });
    expect(pass.status).toBe("PASS");
    expect(pass.delivery_status).toBe("PASS");
    expect(pass.provenance).toBe("local_execution");
    expect(pass.from_evidence).toBe(true);
    expect(pass.agent_claim_cannot_pass).toBe(true);

    const viaRuntime = getDeliveryFromWorkRuntime("w-pass", {
      workspaceRoot: ws,
    });
    expect(viaRuntime.status).toBe("PASS");
    expect(viaRuntime.provenance).toBe("local_execution");

    runtime.open({
      work_id: "w-abs",
      objective: "no evidence",
      criteria: [
        {
          id: "c1",
          description: "x",
          mandatory: true,
          evidence_required: ["smoke"],
        },
      ],
    });
    const noRun = getWorkDelivery("w-abs", { workspaceRoot: ws });
    expect(["BLOCKED", "UNVERIFIED"]).toContain(noRun.status);
    expect(noRun.status).not.toBe("PASS");
    expect(noRun.provenance).toBe("absent");
  });

  it("no PASS without local_execution (FAIL path + ATTESTED ≠ PASS)", () => {
    const ws = freshWs("fail");
    const runtime = new PersistentWorkRuntime({ workspaceRoot: ws });
    runtime.open({
      work_id: "w-fail",
      objective: "fail",
      criteria: [
        {
          id: "c1",
          description: "x",
          mandatory: true,
          evidence_required: ["smoke"],
        },
      ],
    });

    const fail = getWorkDelivery("w-fail", {
      workspaceRoot: ws,
      run: "false",
    });
    expect(fail.status).toBe("FAIL");
    expect(fail.delivery_status).toBe("FAILED");
    expect(fail.provenance).toBe("local_execution");

    // External attestation attached directly — never PASS.
    const db = new StateDb(defaultStateDbPath(ws));
    try {
      db.upsertEvidenceRecord({
        evidence_id: "evd-attest",
        work_id: "w-attest",
        status: "VALID",
        kind: "delivery_verification",
        payload: {
          command: "true",
          exit_code: 0,
          provenance: "external_attestation",
          attested_by: "ci",
          workspace: resolve(ws),
          work_id: "w-attest",
        },
      });
    } finally {
      db.close();
    }
    runtime.open({
      work_id: "w-attest",
      objective: "attest",
      criteria: [
        {
          id: "c1",
          description: "x",
          mandatory: true,
          evidence_required: ["smoke"],
        },
      ],
    });
    const attested = getWorkDelivery("w-attest", { workspaceRoot: ws });
    expect(attested.status).toBe("ATTESTED");
    expect(attested.status).not.toBe("PASS");
    expect(attested.provenance).toBe("external_attestation");
  });

  it("unified evidence facade exposes ignored stale / other-work", () => {
    const ws = freshWs("ev");
    const runtime = new PersistentWorkRuntime({ workspaceRoot: ws });
    runtime.open({
      work_id: "w-ev",
      objective: "ev",
      criteria: [
        {
          id: "c1",
          description: "x",
          mandatory: true,
          evidence_required: ["smoke"],
        },
      ],
    });
    getWorkDelivery("w-ev", { workspaceRoot: ws, run: "true" });

    const read = readWorkEvidenceProvenance(ws, "w-ev");
    expect(read.kind).toBe("UnifiedEvidenceRead");
    expect(read.delivery_verification?.provenance).toBe("local_execution");
    expect(Array.isArray(read.ignored)).toBe(true);

    // Mark evidence stale → ignored for PASS; getWorkDelivery not PASS.
    const db = new StateDb(defaultStateDbPath(ws));
    let otherWorkRow;
    try {
      const rows = db.listEvidence("w-ev");
      const eid = rows[0]!.evidence_id;
      db.upsertEvidenceRecord({
        evidence_id: eid,
        work_id: "w-ev",
        status: "STALE",
        kind: "delivery_verification",
        payload: {
          ...rows[0]!.payload,
          provenance: "stale",
        },
      });
      otherWorkRow = db.upsertEvidenceRecord({
        evidence_id: "evd-other",
        work_id: "w-OTHER",
        status: "VALID",
        kind: "delivery_verification",
        payload: {
          command: "true",
          exit_code: 0,
          provenance: "local_execution",
          workspace: resolve(ws),
          work_id: "w-OTHER",
        },
      });
    } finally {
      db.close();
    }

    const after = readWorkEvidenceProvenance(ws, "w-ev");
    expect(after.delivery_verification).toBeUndefined();
    expect(after.ignored.some((i) => i.reason === "stale_row" || i.reason === "stale_provenance")).toBe(
      true,
    );

    const ignored = listIgnoredEvidenceForWork(ws, "w-ev", {
      extraRows: [otherWorkRow!],
    });
    expect(ignored.some((i) => i.reason === "other_work")).toBe(true);

    const staleProj = getWorkDelivery("w-ev", { workspaceRoot: ws });
    expect(staleProj.status).not.toBe("PASS");
  });

  it("verifier registry: local_command wraps validateDelivery; CustomVerifier absent cannot PASS", async () => {
    const { verifiers } = openVerification(freshWs("ver"));
    const snap = verifiers.seed();
    expect(snap.verifiers.map((v) => v.verifier_id)).toEqual([
      NATIVE_LOCAL_COMMAND_ID,
      CUSTOM_VERIFIER_ID,
    ]);
    expect(snap.verifiers[0]?.implementation).toBe("local_command");

    const ws = freshWs("run");
    const native = await verifiers.run(NATIVE_LOCAL_COMMAND_ID, {
      workspace: ws,
      command: "true",
      work_id: "w-v",
    });
    expect(native.provenance).toBe("local_execution");
    expect(native.exit_code).toBe(0);
    expect(native.may_contribute_to_pass).toBe(true);
    expect(native.notes.some((n) => /validateDelivery|delivery_validate_run/.test(n))).toBe(
      true,
    );
    expect(native.delivery_status).toBe("PASS");
    expect(native.evidence_id).toBeTruthy();

    const custom = await verifiers.run(CUSTOM_VERIFIER_ID, {
      workspace: freshWs("hook"),
      command: "true",
    });
    expect(custom.may_contribute_to_pass).toBe(false);
    expect(
      custom.notes.some((n) => /custom_verifier_not_registered/.test(n)),
    ).toBe(true);
  });
});
