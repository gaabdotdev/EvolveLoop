import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StateDb } from "../../src/v3/state-db/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evolveCli = path.join(__dirname, "../../dist/cli/evolve.js");

describe("evolve intent integration (V0 Bloco 2)", () => {
  let tmp: string;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "evolve-intent-cli-"));
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "cli-fixture", version: "0.0.1" }),
      "utf-8",
    );
  });

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("CLI intent persists validated Goal Contract in SQLite", () => {
    const out = execFileSync(
      process.execPath,
      [
        evolveCli,
        "intent",
        "--text",
        "Criar comando de status do workspace",
        "--workspace",
        tmp,
        "--goal-id",
        "gc-cli-intent",
        "--confirm-mso",
        "true",
        "--format",
        "json",
      ],
      { encoding: "utf-8" },
    );
    const parsed = JSON.parse(out) as {
      kind: string;
      question_count: number;
      persisted: { validated: boolean; journal_mode: string; db_path: string };
      contract: { goal_contract_id: string; objective: string };
    };
    expect(parsed.kind).toBe("goal_contract");
    expect(parsed.question_count).toBeLessThanOrEqual(4);
    expect(parsed.persisted.validated).toBe(true);
    expect(parsed.persisted.journal_mode).toBe("wal");
    expect(parsed.contract.goal_contract_id).toBe("gc-cli-intent");

    const db = new StateDb(parsed.persisted.db_path);
    try {
      const row = db.queryOne<{
        validated: number;
        mso_confirmed: number;
        objective: string;
      }>(
        `SELECT validated, mso_confirmed, objective FROM goal_contracts
         WHERE goal_contract_id = ? ORDER BY version DESC LIMIT 1`,
        "gc-cli-intent",
      );
      expect(row?.validated).toBe(1);
      expect(row?.mso_confirmed).toBe(1);
      expect(row?.objective).toContain("status");
    } finally {
      db.close();
    }
  });
});
