/**
 * REMED-M1 — Runtime compatibility: engines + real StateDb (node:sqlite) lifecycle.
 * No mocks of sqlite — proves init / persist / query / close on disk.
 */
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { StateDb, StateDbError } from "../../src/v3/state-db/store.js";
import type { GoalContract } from "../../src/v3/goal-contract/types.js";

const require = createRequire(import.meta.url);
const PKG = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { engines?: { node?: string } };

function parseSemverParts(v: string): [number, number, number] {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function nodeMeetsMin(current: string, minMajor: number, minMinor: number, minPatch = 0): boolean {
  const [maj, min, patch] = parseSemverParts(current);
  if (maj > minMajor) return true;
  if (maj < minMajor) return false;
  if (min > minMinor) return true;
  if (min < minMinor) return false;
  return patch >= minPatch;
}

function minimalContract(id: string): GoalContract {
  const ts = new Date().toISOString();
  return {
    kind: "GoalContract",
    goal_contract_id: id,
    version: 1,
    created_at: ts,
    updated_at: ts,
    objective: "remed-m1 fixture",
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

describe("REMED-M1 — engines + StateDb runtime (real node:sqlite)", () => {
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

  it("package engines declare >=22.5.0 and current process meets it", () => {
    expect(PKG.engines?.node).toBe(">=22.5.0");
    expect(
      nodeMeetsMin(process.versions.node, 22, 5, 0),
      `Node ${process.version} below engines >=22.5.0 (LIMITATION: Node 20/21/22.0–22.4 unsupported)`,
    ).toBe(true);
  });

  it("node:sqlite DatabaseSync is loadable (no mock)", () => {
    const mod = require("node:sqlite") as { DatabaseSync?: unknown };
    expect(typeof mod.DatabaseSync).toBe("function");
  });

  it("StateDb init → persist → query → close on disk; reopen reads persisted row", () => {
    const ws = mkdtempSync(join(tmpdir(), "remed-m1-statedb-"));
    dirs.push(ws);
    const dbPath = join(ws, ".evolveloop", "state.db");

    const db = new StateDb(dbPath);
    expect(existsSync(dbPath)).toBe(true);
    expect(db.integrityCheck()).toBe("ok");

    db.saveGoalContract(minimalContract("gc-m1"), { validated: true });
    const loaded = db.loadLatestGoalContract("gc-m1");
    expect(loaded?.goal_contract_id).toBe("gc-m1");
    expect(loaded?.validated).toBe(true);
    expect(loaded?.objective).toBe("remed-m1 fixture");
    db.close();

    const reopened = new StateDb(dbPath);
    const again = reopened.loadLatestGoalContract("gc-m1");
    expect(again?.goal_contract_id).toBe("gc-m1");
    expect(again?.validated).toBe(true);
    expect(reopened.integrityCheck()).toBe("ok");
    reopened.close();
  });

  it("refuses :memory: (fail-honest; does not hide disk requirement)", () => {
    expect(() => new StateDb(":memory:")).toThrow(StateDbError);
    try {
      new StateDb(":memory:");
    } catch (e) {
      expect(e).toBeInstanceOf(StateDbError);
      expect((e as StateDbError).code).toBe("DISK_REQUIRED");
    }
  });
});
