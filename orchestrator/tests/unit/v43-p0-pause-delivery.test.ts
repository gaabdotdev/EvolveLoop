/**
 * V4.3 P0-1 / P0-2 — Journey pause persistence + Delivery verification evidence.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getJourneyPause,
  pauseJourneyTask,
  resumeJourneyTask,
  clearJourneyPauseOnCancel,
  JOURNEY_PAUSE_META_KEY,
} from "../../src/cli/tui/journey-pause.js";
import { StateDb, defaultStateDbPath } from "../../src/v3/state-db/store.js";
import { applyTrivialBypass } from "../../src/v3/grill-me/trivial-bypass.js";
import { taskControlMessage } from "../../src/cli/tui/task-controls.js";
import {
  attachDeliveryVerification,
  deriveDeliveryFromWorkspace,
  validateDelivery,
  extractVerificationFromEvidence,
} from "../../src/cli/tui/delivery-verify.js";
import { deriveDeliveryStatus } from "../../src/cli/tui/delivery-status.js";
import { handleDeliverySurface } from "../../src/cli/delivery-surface.js";
import { showHistoryEntry, buildTaskHistoryView } from "../../src/cli/tui/task-history.js";

describe("P0-1 journey pause StateDb axis", () => {
  let ws: string;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), "v43-pause-"));
  });
  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
  });

  it("pause persists; CLI reopen sees paused; resume idempotent", () => {
    expect(getJourneyPause(ws).paused).toBe(false);
    const p1 = pauseJourneyTask(ws, "tui");
    expect(p1.paused).toBe(true);
    expect(p1.axis).toBe("journey_task");
    expect(p1.paused_at).toBeTruthy();

    // Simulate other process / CLI reopen
    const again = getJourneyPause(ws);
    expect(again.paused).toBe(true);
    expect(again.paused_at).toBe(p1.paused_at);

    const p2 = pauseJourneyTask(ws, "cli");
    expect(p2.paused_at).toBe(p1.paused_at); // idempotent pause keeps timestamp

    const r1 = resumeJourneyTask(ws, "cli");
    expect(r1.paused).toBe(false);
    expect(getJourneyPause(ws).paused).toBe(false);

    const r2 = resumeJourneyTask(ws, "cli");
    expect(r2.paused).toBe(false); // idempotent resume
  });

  it("trivial bypass pause/resume writes same meta key", () => {
    const db = new StateDb(defaultStateDbPath(ws));
    try {
      const pause = applyTrivialBypass("pause", db, { workspace: ws });
      expect(pause?.bypassed).toBe(true);
      expect(pause?.kind).toBe("pause");
      const raw = db.getMeta(JOURNEY_PAUSE_META_KEY);
      expect(raw).toMatch(/"paused":true/);
      const resume = applyTrivialBypass("resume", db, { workspace: ws });
      expect(resume?.kind).toBe("resume");
      expect(JSON.parse(db.getMeta(JOURNEY_PAUSE_META_KEY)!).paused).toBe(false);
    } finally {
      db.close();
    }
  });

  it("cancel clears pause; copy mentions StateDb / same axis", () => {
    pauseJourneyTask(ws, "tui");
    clearJourneyPauseOnCancel(ws, "tui");
    expect(getJourneyPause(ws).paused).toBe(false);
    expect(taskControlMessage("pause").message_pt).toMatch(/StateDb/);
    expect(taskControlMessage("pause").message_pt).toMatch(/evolve pause/);
    expect(taskControlMessage("resume", { wasPaused: true }).message_pt).toMatch(
      /StateDb|CLI\/TUI/,
    );
  });
});

describe("P0-2 Delivery verification evidence", () => {
  let ws: string;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), "v43-deliv-"));
  });
  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
  });

  it("kick-like path without verification → UNVERIFIED (not PASS)", () => {
    expect(
      deriveDeliveryStatus({
        kick_started: true,
        mso_state: "VALIDATING",
        verification: undefined,
      }),
    ).toBe("UNVERIFIED");
  });

  it("attach passing verification → PASS; failing → FAILED", () => {
    attachDeliveryVerification(
      ws,
      { command: "npm test", exit_code: 0, provenance: "local_execution" },
      { work_id: "w-pass" },
    );
    const pass = deriveDeliveryFromWorkspace(ws, {
      work_id: "w-pass",
      kick_started: true,
    });
    expect(pass.from_evidence).toBe(true);
    expect(pass.status).toBe("PASS");
    expect(pass.verification?.exit_code).toBe(0);

    attachDeliveryVerification(
      ws,
      { command: "npm test", exit_code: 1, provenance: "local_execution" },
      { work_id: "w-fail", evidence_id: "evd-fail-1" },
    );
    const fail = deriveDeliveryFromWorkspace(ws, {
      work_id: "w-fail",
      kick_started: true,
    });
    expect(fail.status).toBe("FAILED");
  });

  it("validateDelivery with explicit exit_code attaches without inventing", () => {
    const view = validateDelivery(ws, {
      command: "fixture:unit",
      exit_code: 0,
      work_id: "w-val",
    });
    expect(view.status).toBe("ATTESTED");
    expect(view.from_evidence).toBe(true);
    expect(view.verification?.provenance).toBe("external_attestation");

    const fail = validateDelivery(ws, {
      command: "fixture:unit",
      exit_code: 2,
      work_id: "w-val-fail",
    });
    expect(fail.status).toBe("FAILED");
  });

  it("adapter-like ok without evidence never becomes PASS", () => {
    const view = deriveDeliveryFromWorkspace(ws, {
      kick_started: true,
      mso_state: "TRUE-FULL-PASS",
      adapter_status: "ok",
      work_id: "w-none",
    });
    expect(view.status).toBe("UNVERIFIED");
    expect(view.from_evidence).toBe(false);
  });

  it("history show re-derives Delivery line from evidence", () => {
    const ts = new Date().toISOString();
    const db = new StateDb(defaultStateDbPath(ws));
    try {
      db.saveGoalContract(
        {
          kind: "GoalContract",
          goal_contract_id: "gc-1",
          work_id: "w-hist",
          version: 1,
          created_at: ts,
          updated_at: ts,
          objective: "Test delivery history",
          scope: [],
          out_of_scope: [],
          functional_requirements: [],
          non_functional_requirements: [],
          constraints: [],
          dependencies: [],
          risks: [],
          criteria: [
            {
              id: "c1",
              description: "ok",
              mandatory: true,
              verification: [{ id: "v1", kind: "command", description: "x" }],
              evidence_required: ["e"],
              state: "NOT_STARTED",
              evidence_ids: [],
              updated_at: ts,
            },
          ],
        },
        { validated: true, mso_confirmed: true },
      );
    } finally {
      db.close();
    }
    attachDeliveryVerification(
      ws,
      { command: "true", exit_code: 0, provenance: "local_execution" },
      { work_id: "w-hist", goal_contract_id: "gc-1" },
    );
    const list = buildTaskHistoryView(ws);
    expect(list.entries.length).toBeGreaterThan(0);
    const shown = showHistoryEntry(ws, "gc-1");
    expect(shown.found).toBe(true);
    expect(shown.lines.join("\n")).toMatch(/Delivery:\s*PASS/);
  });

  it("delivery surface validate requires command", () => {
    const r = handleDeliverySurface(
      { group: "delivery", command: "validate" },
      { argv: ["node", "evolve", "delivery", "validate"], printJson: () => {} },
    );
    expect(r.handled).toBe(true);
    expect(r.exitCode).toBe(1);
  });

  it("extractVerificationFromEvidence skips STALE", () => {
    const rows = [
      {
        evidence_id: "e1",
        work_id: "w",
        status: "STALE" as const,
        payload: { command: "old", exit_code: 0 },
        created_at: "2020-01-01",
        updated_at: "2020-01-01",
      },
      {
        evidence_id: "e2",
        work_id: "w",
        status: "VALID" as const,
        kind: "delivery_verification",
        payload: { command: "npm test", exit_code: 0, provenance: "local_execution" },
        created_at: "2021-01-01",
        updated_at: "2021-01-01",
      },
    ];
    const hit = extractVerificationFromEvidence(rows);
    expect(hit?.evidence_id).toBe("e2");
  });
});
