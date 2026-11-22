/**
 * V0-ORCH-01/02/03 — SQLite WAL pragmas, workspace_leases fencing, MSO matrix, outbox ordering.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  StateDb,
  StateDbError,
  SQLITE_BUSY_TIMEOUT_MS,
  SQLITE_SYNC_FULL,
} from "../../src/v3/state-db/index.js";
import { MSO_STATES, MSO_TRANSITIONS, MsoError, canTransitionMso } from "../../src/v3/mso/index.js";
import type { GoalContract } from "../../src/v3/goal-contract/types.js";

function minimalContract(id: string): GoalContract {
  const ts = new Date().toISOString();
  return {
    kind: "GoalContract",
    goal_contract_id: id,
    version: 1,
    created_at: ts,
    updated_at: ts,
    objective: "orch fixture",
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
  };
}

describe("V0-ORCH persistence (SQLite WAL + leases + MSO + outbox)", () => {
  let tmp: string;
  let db: StateDb;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-orch-"));
    db = new StateDb(path.join(tmp, ".evolveloop", "state.db"));
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("AUD-STUB-02: refuses :memory: (fail-honest disk-only StateDb)", () => {
    expect(() => new StateDb(":memory:")).toThrow(/DISK_REQUIRED|filesystem path|:memory:/i);
  });

  it("V0-ORCH-01 / AUD-ORCH-01: WAL + synchronous=FULL + integrity_check=ok + fencing surface", () => {
    expect(db.journalMode()).toBe("wal");
    expect(db.synchronous()).toBe(SQLITE_SYNC_FULL);
    expect(db.busyTimeoutMs()).toBe(SQLITE_BUSY_TIMEOUT_MS);
    expect(db.integrityCheck()).toBe("ok");
    db.assertWalPragmas();

    const tables = db.listTables();
    for (const name of [
      "mso_sessions",
      "mso_transitions",
      "goal_contracts",
      "goal_documents",
      "task_graph_nodes",
      "inbox_messages",
      "work_ledger_entries",
      "token_ledger",
      "workspace_leases",
      "outbox",
    ]) {
      expect(tables).toContain(name);
    }

    db.saveGoalContract(minimalContract("gc-1"), { validated: true });
    db.upsertTaskGraphNode({ work_id: "w1", task_id: "t1", state: "PENDING", payload: { role: "impl" } });
    db.appendInboxMessage({ workspace_id: "ws-1", kind: "user", body: { text: "hi" } });
    db.appendWorkLedgerEntry({ work_id: "w1", type: "work_opened", payload: { work_state: "IN_PROGRESS" } });
    db.recordTokenLedger({
      work_id: "w1",
      cost_provenance: "UNAVAILABLE",
      status: "ok",
      tokens_in: 1,
      tokens_out: 2,
    });

    expect(db.loadLatestGoalContract("gc-1")?.validated).toBe(true);
    expect(db.listTaskGraphNodes("w1")).toHaveLength(1);
    expect(db.listInboxMessages("ws-1")).toHaveLength(1);
    expect(db.listWorkLedgerEntries("w1")[0]?.version).toBe(1);
    expect(db.listTokenLedger("w1")).toHaveLength(1);
  });

  it("V0-ORCH-02: workspace_leases monotonic fencing rejects stale token / second active MSO", () => {
    const a = db.acquireWorkspaceLease({ workspace_id: "ws-a", holder_id: "mso-1", lease_ms: 60_000 });
    expect(a.fencing_token).toBe(1);
    expect(a.status).toBe("active");

    expect(() =>
      db.acquireWorkspaceLease({ workspace_id: "ws-a", holder_id: "mso-2", lease_ms: 60_000 }),
    ).toThrow(StateDbError);

    const stale = db.checkWorkspaceFencing("ws-a", 0, "mso-1");
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.reason).toBe("stale_fencing_token");
      expect(stale.expected_token).toBe(1);
    }

    // Expire then steal → fencing increments
    const expired = db.acquireWorkspaceLease({
      workspace_id: "ws-b",
      holder_id: "old",
      lease_ms: 1,
      now: new Date(Date.now() - 10_000),
    });
    expect(expired.fencing_token).toBe(1);
    const stolen = db.acquireWorkspaceLease({
      workspace_id: "ws-b",
      holder_id: "new",
      lease_ms: 60_000,
    });
    expect(stolen.fencing_token).toBe(2);
    expect(stolen.holder_id).toBe("new");

    const rejectStaleWrite = db.checkWorkspaceFencing("ws-b", 1, "old");
    expect(rejectStaleWrite.ok).toBe(false);
    if (!rejectStaleWrite.ok) expect(rejectStaleWrite.reason).toBe("stale_fencing_token");
  });

  it("V0-ORCH-03: official 10 MSO states; all valid edges + reject illegal (no skip to TRUE-FULL-PASS)", () => {
    expect(MSO_STATES).toHaveLength(10);
    expect(MSO_STATES[0]).toBe("INIT");
    expect(MSO_STATES[9]).toBe("TRUE-FULL-PASS");

    // Exhaustive matrix: every listed edge is legal; every non-edge is illegal.
    for (const from of MSO_STATES) {
      for (const to of MSO_STATES) {
        const expected = MSO_TRANSITIONS[from].includes(to);
        expect(canTransitionMso(from, to)).toBe(expected);
      }
    }
    // Explicit illegal skips to TRUE-FULL-PASS (must go through VALIDATING).
    expect(canTransitionMso("INIT", "TRUE-FULL-PASS")).toBe(false);
    expect(canTransitionMso("DELEGATING", "TRUE-FULL-PASS")).toBe(false);
    expect(canTransitionMso("WAITING_AGENTS", "TRUE-FULL-PASS")).toBe(false);
    expect(canTransitionMso("VALIDATING", "TRUE-FULL-PASS")).toBe(true);
    expect(MSO_TRANSITIONS.VALIDATING).toEqual(
      expect.arrayContaining(["TRUE-FULL-PASS", "DECOMPOSING", "DELEGATING", "BLOCKED"]),
    );

    const lease = db.acquireWorkspaceLease({ workspace_id: "ws-mso", holder_id: "holder" });
    const session = db.createMsoSession({
      workspace_id: "ws-mso",
      fencing_token: lease.fencing_token,
      holder_id: "holder",
      work_id: "w-mso",
    });
    expect(session.state).toBe("INIT");

    expect(() =>
      db.transitionMso({
        session_id: session.session_id,
        to: "TRUE-FULL-PASS",
        fencing_token: lease.fencing_token,
        holder_id: "holder",
      }),
    ).toThrow(MsoError);

    const happyPath: Array<(typeof MSO_STATES)[number]> = [
      "LOADING_GOALS",
      "ANALYZING",
      "DECOMPOSING",
      "DELEGATING",
      "WAITING_AGENTS",
      "VALIDATING",
      "TRUE-FULL-PASS",
    ];
    let cur = session;
    for (const to of happyPath) {
      cur = db.transitionMso({
        session_id: session.session_id,
        to,
        fencing_token: lease.fencing_token,
        holder_id: "holder",
        reason: `to ${to}`,
      });
      expect(cur.state).toBe(to);
    }
    expect(db.listMsoTransitions(session.session_id)).toHaveLength(happyPath.length);

    // Recovery branch edges exercised on a second session.
    const lease2 = db.acquireWorkspaceLease({ workspace_id: "ws-mso-2", holder_id: "holder-2" });
    let s2 = db.createMsoSession({
      workspace_id: "ws-mso-2",
      fencing_token: lease2.fencing_token,
      holder_id: "holder-2",
    });
    for (const to of [
      "LOADING_GOALS",
      "ANALYZING",
      "DECOMPOSING",
      "DELEGATING",
      "WAITING_AGENTS",
      "VALIDATING",
      "BLOCKED",
      "RECOVERING",
      "DELEGATING",
    ] as const) {
      s2 = db.transitionMso({
        session_id: s2.session_id,
        to,
        fencing_token: lease2.fencing_token,
        holder_id: "holder-2",
      });
      expect(s2.state).toBe(to);
    }
  });

  it("V0-ORCH-03: Transactional Outbox persists PENDING_DISPATCH before spawn; ordered ASC", () => {
    const lease = db.acquireWorkspaceLease({ workspace_id: "ws-obx", holder_id: "h" });
    let session = db.createMsoSession({
      workspace_id: "ws-obx",
      fencing_token: lease.fencing_token,
      holder_id: "h",
      work_id: "w-obx",
    });
    for (const to of ["LOADING_GOALS", "ANALYZING", "DECOMPOSING"] as const) {
      session = db.transitionMso({
        session_id: session.session_id,
        to,
        fencing_token: lease.fencing_token,
        holder_id: "h",
      });
    }

    const first = db.enqueuePendingDispatch({
      session_id: session.session_id,
      fencing_token: lease.fencing_token,
      holder_id: "h",
      task_id: "task-a",
      payload: { spawn: "agent-a" },
    });
    expect(first.status).toBe("PENDING_DISPATCH");
    expect(db.getMsoSession(session.session_id)?.state).toBe("DELEGATING");

    // Simulate crash before spawn: pending still present, nothing DISPATCHED yet
    expect(db.listPendingDispatch("ws-obx").map((r) => r.outbox_id)).toEqual([first.outbox_id]);

    const second = db.enqueuePendingDispatch({
      session_id: session.session_id,
      fencing_token: lease.fencing_token,
      holder_id: "h",
      task_id: "task-b",
      payload: { spawn: "agent-b" },
      transition_to_delegating: false,
    });
    expect(second.status).toBe("PENDING_DISPATCH");

    const pending = db.listPendingDispatch("ws-obx");
    expect(pending.map((r) => r.task_id)).toEqual(["task-a", "task-b"]);
    expect(pending.every((r) => r.status === "PENDING_DISPATCH")).toBe(true);

    // Spawn happens AFTER durable PENDING_DISPATCH
    const afterSpawn = db.markOutboxDispatched(first.outbox_id);
    expect(afterSpawn.status).toBe("DISPATCHED");
    expect(afterSpawn.dispatched_at).toBeTruthy();
    expect(db.listPendingDispatch("ws-obx").map((r) => r.task_id)).toEqual(["task-b"]);
  });

  it("stale fencing cannot enqueue outbox or transition MSO", () => {
    const lease = db.acquireWorkspaceLease({ workspace_id: "ws-fence", holder_id: "alive" });
    const session = db.createMsoSession({
      workspace_id: "ws-fence",
      fencing_token: lease.fencing_token,
      holder_id: "alive",
    });
    // Same holder renews with a past clock → expires_at in the past, then neo steals.
    db.acquireWorkspaceLease({
      workspace_id: "ws-fence",
      holder_id: "alive",
      lease_ms: 1,
      now: new Date(Date.now() - 60_000),
    });
    const neo = db.acquireWorkspaceLease({ workspace_id: "ws-fence", holder_id: "neo" });
    expect(neo.fencing_token).toBeGreaterThan(lease.fencing_token);

    expect(() =>
      db.transitionMso({
        session_id: session.session_id,
        to: "LOADING_GOALS",
        fencing_token: lease.fencing_token,
        holder_id: "alive",
      }),
    ).toThrow(StateDbError);

    expect(() =>
      db.enqueuePendingDispatch({
        session_id: session.session_id,
        fencing_token: lease.fencing_token,
        holder_id: "alive",
        payload: {},
      }),
    ).toThrow(StateDbError);
  });
});
