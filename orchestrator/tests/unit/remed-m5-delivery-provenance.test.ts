/**
 * REMED-M5 — Delivery Evidence Provenance & Integrity (12 cenários obrigatórios).
 * PASS só com local_execution exit 0 realmente executado pelo EvolveLoop.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  StateDb,
  defaultStateDbPath,
} from "../../src/v3/state-db/store.js";
import { handleDeliverySurface } from "../../src/cli/delivery-surface.js";
import {
  deriveDeliveryStatus,
  effectiveProvenance,
  normalizeDeliveryProvenance,
  type DeliveryEvidenceProvenance,
} from "../../src/cli/tui/delivery-status.js";
import {
  attachDeliveryVerification,
  deriveDeliveryFromWorkspace,
  evidenceAssociationCompatible,
  extractVerificationFromEvidence,
  validateDelivery,
} from "../../src/cli/tui/delivery-verify.js";

const ALL_PROVENANCE: DeliveryEvidenceProvenance[] = [
  "local_execution",
  "external_attestation",
  "absent",
  "invalid",
  "stale",
];

describe("REMED-M5 delivery evidence provenance & integrity", () => {
  let ws: string;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), "remed-m5-"));
  });

  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
  });

  it("§5.1 model exposes the five provenance types explicitly", () => {
    expect(ALL_PROVENANCE).toEqual([
      "local_execution",
      "external_attestation",
      "absent",
      "invalid",
      "stale",
    ]);
    expect(normalizeDeliveryProvenance("missing")).toBe("absent");
    expect(normalizeDeliveryProvenance("bogus")).toBe("invalid");
    expect(effectiveProvenance(undefined)).toBe("absent");
  });

  it("1. local exit 0 → PASS with local_execution metadata", () => {
    const view = validateDelivery(ws, {
      run: "true",
      work_id: "w-local0",
      goal_contract_id: "gc-local0",
      goal_contract_version: 1,
      task_id: "t-local0",
    });
    expect(view.status).toBe("PASS");
    expect(view.from_evidence).toBe(true);
    expect(view.verification?.provenance).toBe("local_execution");
    expect(view.verification?.exit_code).toBe(0);
    expect(view.verification?.timed_out).toBeFalsy();
    expect(view.verification?.signal).toBeFalsy();
    expect(view.verification?.cwd).toBe(resolve(ws));
    expect(view.verification?.executed_at).toMatch(/^\d{4}-/);
    expect(view.verification?.workspace).toBe(resolve(ws));
    expect(view.verification?.work_id).toBe("w-local0");
    expect(view.verification?.task_id).toBe("t-local0");
    expect(view.verification?.goal_contract_id).toBe("gc-local0");
    expect(view.verification?.goal_contract_version).toBe(1);
  });

  it("2. local exit ≠0 → FAILED", () => {
    const view = validateDelivery(ws, {
      run: "false",
      work_id: "w-local-nz",
    });
    expect(view.status).toBe("FAILED");
    expect(view.verification?.provenance).toBe("local_execution");
    expect(view.verification?.exit_code).not.toBe(0);
  });

  it("3. missing command → absent / no PASS (CLI + API)", () => {
    const api = validateDelivery(ws, { work_id: "w-miss" });
    expect(api.status).toBe("UNVERIFIED");
    expect(api.from_evidence).toBe(false);
    expect(api.verification).toBeUndefined();

    const surface = handleDeliverySurface(
      { group: "delivery", command: "validate" },
      {
        argv: ["node", "evolve", "delivery", "validate"],
        printJson: () => {},
      },
    );
    expect(surface.handled).toBe(true);
    expect(surface.exitCode).toBe(1);
  });

  it("4. timeout → FAILED with timed_out + local_execution", () => {
    const view = validateDelivery(ws, {
      run: "sleep 5",
      timeout_ms: 200,
      work_id: "w-timeout",
    });
    expect(view.status).toBe("FAILED");
    expect(view.verification?.provenance).toBe("local_execution");
    expect(view.verification?.timed_out).toBe(true);
    expect(view.verification?.exit_code).toBe(124);
  });

  it("5. signal → FAILED with signal recorded", () => {
    // Kill the shell child itself so spawnSync observes signal / 128+N.
    const view = validateDelivery(ws, {
      run: "kill -TERM $$; sleep 30",
      work_id: "w-signal",
      timeout_ms: 10_000,
    });
    expect(view.status).toBe("FAILED");
    expect(view.verification?.provenance).toBe("local_execution");
    expect(view.verification?.signal).toBeTruthy();
    expect(view.verification?.exit_code).not.toBe(0);
  });

  it("6. external exit 0 → ATTESTED (never PASS)", () => {
    const view = validateDelivery(ws, {
      command: "fixture:external",
      exit_code: 0,
      work_id: "w-ext0",
    });
    expect(view.status).toBe("ATTESTED");
    expect(view.verification?.provenance).toBe("external_attestation");
    expect(view.verification?.exit_code).toBe(0);
    expect(
      deriveDeliveryStatus({
        kick_started: true,
        verification: view.verification,
      }),
    ).toBe("ATTESTED");
    expect(view.status).not.toBe("PASS");
  });

  it("7. invalid provenance → FAILED / not PASS", () => {
    attachDeliveryVerification(
      ws,
      {
        command: "bogus",
        exit_code: 0,
        provenance: "invalid",
        workspace: ws,
      },
      { work_id: "w-inv", evidence_id: "evd-inv" },
    );
    // Direct derive with invalid verification
    expect(
      deriveDeliveryStatus({
        kick_started: true,
        verification: {
          command: "bogus",
          exit_code: 0,
          provenance: "invalid",
        },
      }),
    ).toBe("FAILED");

    // Extractor skips invalid — workspace shows absent/UNVERIFIED
    const view = deriveDeliveryFromWorkspace(ws, {
      work_id: "w-inv",
      kick_started: true,
    });
    expect(view.status).toBe("UNVERIFIED");
    expect(view.from_evidence).toBe(false);
  });

  it("8. stale evidence ignored for PASS", () => {
    const db = new StateDb(defaultStateDbPath(ws));
    let rows;
    try {
      db.upsertEvidenceRecord({
        evidence_id: "evd-stale",
        work_id: "w-stale",
        status: "STALE",
        kind: "delivery_verification",
        goal_contract_version: 1,
        payload: {
          command: "true",
          exit_code: 0,
          provenance: "local_execution",
          workspace: resolve(ws),
        },
      });
      rows = db.listEvidence("w-stale");
    } finally {
      db.close();
    }
    expect(extractVerificationFromEvidence(rows)).toBeUndefined();

    const view = deriveDeliveryFromWorkspace(ws, {
      work_id: "w-stale",
      kick_started: true,
    });
    expect(view.status).toBe("UNVERIFIED");
    expect(view.from_evidence).toBe(false);

    expect(
      deriveDeliveryStatus({
        kick_started: true,
        verification: {
          command: "true",
          exit_code: 0,
          provenance: "stale",
        },
      }),
    ).toBe("UNVERIFIED");
  });

  it("9. other work_id evidence not reused", () => {
    validateDelivery(ws, {
      run: "true",
      work_id: "w-A",
      goal_contract_version: 1,
    });
    const other = deriveDeliveryFromWorkspace(ws, {
      work_id: "w-B",
      kick_started: true,
    });
    expect(other.from_evidence).toBe(false);
    expect(other.status).toBe("UNVERIFIED");

    const db = new StateDb(defaultStateDbPath(ws));
    let rows;
    try {
      rows = db.listEvidence("w-A");
    } finally {
      db.close();
    }
    expect(
      extractVerificationFromEvidence(rows, { work_id: "w-B" }),
    ).toBeUndefined();
  });

  it("10. other goal version ignored", () => {
    validateDelivery(ws, {
      run: "true",
      work_id: "w-goal",
      goal_contract_id: "gc-1",
      goal_contract_version: 1,
    });
    const v2 = deriveDeliveryFromWorkspace(ws, {
      work_id: "w-goal",
      goal_contract_id: "gc-1",
      goal_contract_version: 2,
      kick_started: true,
    });
    expect(v2.from_evidence).toBe(false);
    expect(v2.status).toBe("UNVERIFIED");

    const v1 = deriveDeliveryFromWorkspace(ws, {
      work_id: "w-goal",
      goal_contract_id: "gc-1",
      goal_contract_version: 1,
      kick_started: true,
    });
    expect(v1.status).toBe("PASS");
  });

  it("11. absent evidence → UNVERIFIED / provenance absent", () => {
    const view = deriveDeliveryFromWorkspace(ws, {
      work_id: "w-none",
      kick_started: true,
      mso_state: "TRUE-FULL-PASS",
      adapter_status: "ok",
    });
    expect(view.status).toBe("UNVERIFIED");
    expect(view.from_evidence).toBe(false);
    expect(view.lines.join("\n")).toMatch(/provenance=absent/);
    expect(
      deriveDeliveryStatus({
        kick_started: true,
        mso_state: "TRUE-FULL-PASS",
        adapter_status: "ok",
      }),
    ).toBe("UNVERIFIED");
  });

  it("12. reuse incompatible (wrong workspace / association) ignored", () => {
    const foreign = resolve("/tmp/remed-m5-foreign-workspace");
    // Insert payload claiming another workspace (cannot “upgrade” via attach stamp).
    const db = new StateDb(defaultStateDbPath(ws));
    let rows;
    try {
      db.upsertEvidenceRecord({
        evidence_id: "evd-foreign-ws",
        work_id: "w-reuse",
        status: "VALID",
        kind: "delivery_verification",
        goal_contract_version: 1,
        payload: {
          command: "true",
          exit_code: 0,
          provenance: "local_execution",
          workspace: foreign,
          work_id: "w-reuse",
          goal_contract_version: 1,
        },
      });
      rows = db.listEvidence("w-reuse");
    } finally {
      db.close();
    }
    const row = rows[0]!;
    const verification = {
      command: "true",
      exit_code: 0,
      provenance: "local_execution" as const,
      workspace: foreign,
      work_id: "w-reuse",
      goal_contract_version: 1,
    };
    expect(
      evidenceAssociationCompatible(row, verification, {
        work_id: "w-reuse",
        workspace: resolve(ws),
        allow_missing_workspace: false,
      }),
    ).toBe(false);

    expect(
      extractVerificationFromEvidence(rows, {
        work_id: "w-reuse",
        workspace: resolve(ws),
        allow_missing_workspace: false,
      }),
    ).toBeUndefined();

    // deriveDeliveryFromWorkspace filters by current workspace → ignore foreign
    const view = deriveDeliveryFromWorkspace(ws, {
      work_id: "w-reuse",
      goal_contract_version: 1,
      kick_started: true,
    });
    expect(view.from_evidence).toBe(false);
    expect(view.status).toBe("UNVERIFIED");

    // Typed exit_code alone never becomes PASS.
    expect(
      deriveDeliveryStatus({
        kick_started: true,
        verification: {
          command: "npm test",
          exit_code: 0,
          provenance: "external_attestation",
        },
      }),
    ).toBe("ATTESTED");
  });
});
