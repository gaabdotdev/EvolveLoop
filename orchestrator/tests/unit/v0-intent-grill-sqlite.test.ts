import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { matchTrivialIntent, buildGrillMeQuestions, resolveAnswers } from "../../src/v3/grill-me/index.js";
import { runIntentFlow } from "../../src/v3/intake/intent-flow.js";
import { StateDb, defaultStateDbPath } from "../../src/v3/state-db/index.js";
import { silentScan } from "../../src/v3/workspace-scan/index.js";

describe("V0 Bloco 2 — silent scan + Grill-Me + SQLite", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-intent-"));
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "fixture-proj", version: "0.0.1" }),
      "utf-8",
    );
    await fs.mkdir(path.join(tmp, "src"), { recursive: true });
    await fs.writeFile(path.join(tmp, "src", "main.ts"), "export function hello() { return 1 }\n", "utf-8");
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("silent scan detects package.json language and symbols without asking", () => {
    const scan = silentScan(tmp);
    expect(scan.languages).toContain("javascript/typescript");
    expect(scan.package_name).toBe("fixture-proj");
    expect(scan.context_block).toContain("WORKSPACE_SCAN");
    expect(scan.symbols.some((s) => s.name === "hello")).toBe(true);
  });

  it("trivial status/pause/progress match zero-token bypass", () => {
    expect(matchTrivialIntent("status")?.kind).toBe("status");
    expect(matchTrivialIntent("pause")?.kind).toBe("pause");
    expect(matchTrivialIntent("progress")?.kind).toBe("progress");
    expect(matchTrivialIntent("implement auth flow")).toBeUndefined();
  });

  it("Grill-Me builds 2–3 PT questions (vague) with defaults; never exceeds cap", () => {
    const scan = silentScan(tmp);
    const qs = buildGrillMeQuestions("Adicionar endpoint de health", scan);
    expect(qs.length).toBeGreaterThanOrEqual(2);
    expect(qs.length).toBeLessThanOrEqual(3);
    for (const q of qs) {
      expect(q.prompt_pt.length).toBeGreaterThan(5);
      expect(q.internal_en.length).toBeGreaterThan(3);
      expect(q.default_answer.length).toBeGreaterThan(1);
    }
    const answers = resolveAnswers(qs, ["ok", "", undefined, "ok", "ok"]);
    expect(answers.every((a) => a.value.length > 0)).toBe(true);
    expect(answers.filter((a) => a.used_default).length).toBeGreaterThanOrEqual(2);
  });

  it("intent → ≤4 default answers → validated Goal Contract in SQLite WAL", () => {
    const dbPath = defaultStateDbPath(tmp);
    const out = runIntentFlow({
      workspace: tmp,
      intent: "Adicionar healthcheck HTTP mínimo",
      answers: ["ok", "ok", "ok", "ok"],
      confirm_mso: true,
      state_db_path: dbPath,
      goal_contract_id: "gc-v0-test",
    });

    expect(out.kind).toBe("goal_contract");
    if (out.kind !== "goal_contract") return;

    expect(out.question_count).toBeGreaterThanOrEqual(2);
    expect(out.question_count).toBeLessThanOrEqual(5);
    expect(out.question_count).toBeLessThanOrEqual(4); // ready criterion: ≤4 Qs
    expect(out.tokens_used).toBe(0);
    expect(out.persisted.validated).toBe(true);
    expect(out.persisted.mso_confirmed).toBe(true);
    expect(out.persisted.journal_mode).toBe("wal");
    expect(out.contract.goal_contract_id).toBe("gc-v0-test");
    expect(out.summary_lines.length).toBeGreaterThanOrEqual(5);

    const store = new StateDb(dbPath);
    try {
      const row = store.queryOne<{
        goal_contract_id: string;
        version: number;
        validated: number;
        mso_confirmed: number;
        objective: string;
      }>(
        `SELECT goal_contract_id, version, validated, mso_confirmed, objective
         FROM goal_contracts WHERE goal_contract_id = ? ORDER BY version DESC LIMIT 1`,
        "gc-v0-test",
      );
      expect(row?.goal_contract_id).toBe("gc-v0-test");
      expect(row?.validated).toBe(1);
      expect(row?.mso_confirmed).toBe(1);
      expect(row?.objective).toContain("healthcheck");

      const loaded = store.loadLatestGoalContract("gc-v0-test");
      expect(loaded?.validated).toBe(true);
      expect((loaded?.payload as { kind?: string }).kind).toBe("GoalContract");
    } finally {
      store.close();
    }
  });

  it("status bypass skips Grill-Me and uses SQLite", () => {
    runIntentFlow({
      workspace: tmp,
      intent: "ship logging middleware",
      answers: [],
      confirm_mso: false,
      goal_contract_id: "gc-for-status",
    });
    const status = runIntentFlow({ workspace: tmp, intent: "status" });
    expect(status).toMatchObject({ bypassed: true, grill_me: false, tokens_used: 0 });
    if (!("bypassed" in status)) return;
    expect(status.message_pt).toMatch(/Goal Contract/i);
  });
});
