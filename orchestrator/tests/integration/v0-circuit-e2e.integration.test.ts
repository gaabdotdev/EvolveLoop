import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { runFireFive, runV0Circuit } from "../../src/v3/circuit/index.js";
import { StateDb, defaultStateDbPath } from "../../src/v3/state-db/index.js";

describe("V0 Bloco 3 — circuit offline E2E", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-circuit-"));
    spawnSync("git", ["init"], { cwd: tmp, encoding: "utf-8" });
    writeFileSync(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "circuit-fixture", version: "0.0.1" }),
      "utf-8",
    );
    spawnSync("git", ["add", "."], { cwd: tmp });
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"], {
      cwd: tmp,
    });
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("single circuit: intent → contract → offline fixture → validator → ledger", async () => {
    const dbPath = defaultStateDbPath(tmp);
    const result = await runV0Circuit({
      workspace: tmp,
      state_db_path: dbPath,
      lightweight_validator: true,
      task: {
        task_id: "offline-1",
        intent: "Criar marcador offline-1",
        marker_name: "offline-1.txt",
        marker_content: "offline-1",
        offline_apply_marker: true,
      },
    });

    expect(result.kind).toBe("CircuitRunResult");
    expect(result.status).toBe("TRUE_FULL_PASS");
    expect(result.reason).toContain("TRUE_FULL_PASS");
    expect(result.goal_contract_id).toBeTruthy();
    expect(result.token_ledger_entry_id).toBeTruthy();
    expect(result.limitations.some((l) => /offline|not agent/i.test(l))).toBe(true);

    const db = new StateDb(dbPath);
    try {
      expect(db.journalMode()).toBe("wal");
      const ledger = db.listTokenLedger(result.work_id);
      expect(ledger.length).toBeGreaterThanOrEqual(1);
      expect(ledger.every((e) => ["reported", "estimated", "UNAVAILABLE"].includes(e.cost_provenance))).toBe(
        true,
      );
      const runs = db.listCircuitRuns(result.work_id);
      expect(runs.some((r) => r.run_id === result.run_id)).toBe(true);
    } finally {
      db.close();
    }
  });

  it("fire-5 offline fixtures produce 5 ledger-backed results", async () => {
    const dbPath = defaultStateDbPath(tmp);
    const results = await runFireFive({
      workspace: tmp,
      state_db_path: dbPath,
      use_offline_fixture: true,
      lightweight_validator: true,
    });
    expect(results.length).toBe(5);
    for (const r of results) {
      expect(["TRUE_FULL_PASS", "BLOCKED", "NOT_PASS"]).toContain(r.status);
      expect(r.token_ledger_entry_id).toBeTruthy();
    }
    expect(results.filter((r) => r.status === "TRUE_FULL_PASS").length).toBe(5);

    const db = new StateDb(dbPath);
    try {
      expect(db.listTokenLedger().length).toBeGreaterThanOrEqual(5);
      expect(db.listCircuitRuns().length).toBe(5);
    } finally {
      db.close();
    }
  });

  it("real adapter path without consent yields honest BLOCKED (no fake pass)", async () => {
    const prev = process.env.EVOLVELOOP_HARNESS_CONSENT;
    delete process.env.EVOLVELOOP_HARNESS_CONSENT;
    try {
      const result = await runV0Circuit({
        workspace: tmp,
        state_db_path: defaultStateDbPath(tmp),
        lightweight_validator: true,
        task: {
          task_id: "blocked-consent",
          intent: "Criar marcador blocked-consent",
          marker_name: "blocked-consent.txt",
          offline_apply_marker: false,
          adapter_timeout_ms: 5000,
        },
      });
      expect(result.status).toBe("BLOCKED");
      expect(result.reason).toMatch(/adapter:/);
    } finally {
      if (prev !== undefined) process.env.EVOLVELOOP_HARNESS_CONSENT = prev;
    }
  });
});
