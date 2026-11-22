import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { StateDb } from "../../src/v3/state-db/index.js";
import { runEvidenceValidator } from "../../src/v3/circuit/evidence-validator.js";
import type { GoalContract } from "../../src/v3/goal-contract/types.js";
import { OllamaModelProvider, OpenRouterModelProvider } from "../../src/v3/model-providers/index.js";

function minimalContract(id: string): GoalContract {
  const ts = new Date().toISOString();
  return {
    kind: "GoalContract",
    goal_contract_id: id,
    version: 1,
    created_at: ts,
    updated_at: ts,
    objective: "fixture",
    scope: [],
    out_of_scope: [],
    functional_requirements: [],
    non_functional_requirements: [],
    constraints: [],
    dependencies: [],
    risks: [],
    criteria: [
      {
        id: "c-accept",
        description: "commands green",
        mandatory: true,
        verification: [{ id: "v1", kind: "command", description: "validator" }],
        evidence_required: ["acceptance-evidence"],
        state: "NOT_STARTED",
        evidence_ids: [],
        updated_at: ts,
      },
    ],
  };
}

describe("V0 Token Ledger + Evidence Validator", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-ev-"));
    spawnSync("git", ["init"], { cwd: tmp, encoding: "utf-8" });
    writeFileSync(path.join(tmp, "README.md"), "x\n", "utf-8");
    spawnSync("git", ["add", "."], { cwd: tmp });
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "i"], {
      cwd: tmp,
    });
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("Token Ledger persists tokens/latency/model/cost provenance in SQLite WAL", () => {
    const db = new StateDb(path.join(tmp, ".evolveloop", "state.db"));
    try {
      expect(db.journalMode()).toBe("wal");
      const entry = db.recordTokenLedger({
        work_id: "w1",
        task_id: "t1",
        subsystem: "circuit.adapter",
        provider_id: "ollama",
        adapter_id: "cursor",
        model: "bonsai-64k:latest",
        model_requested: "bonsai-64k:latest",
        model_served: "bonsai-64k:latest",
        tokens_in: 10,
        tokens_out: 20,
        tokens_system: 2,
        tokens_context: 5,
        tokens_tools: 3,
        tokens_output: 20,
        tokens_cache_hit: 1,
        latency_ms: 123,
        cost_usd: null,
        cost_provenance: "reported",
        status: "ok",
      });
      const estimated = db.recordTokenLedger({
        work_id: "w1",
        task_id: "t2",
        cost_provenance: "estimated",
        cost_usd: 0.01,
        status: "ok",
      });
      const unavailable = db.recordTokenLedger({
        work_id: "w1",
        task_id: "t3",
        cost_provenance: "UNAVAILABLE",
        status: "BLOCKED",
      });
      const rows = db.listTokenLedger("w1");
      expect(rows.length).toBe(3);
      expect(entry.cost_provenance).toBe("reported");
      expect(entry.subsystem).toBe("circuit.adapter");
      expect(entry.model_requested).toBe("bonsai-64k:latest");
      expect(entry.tokens_cache_hit).toBe(1);
      expect(estimated.cost_provenance).toBe("estimated");
      expect(unavailable.cost_provenance).toBe("UNAVAILABLE");
      expect(rows.some((r) => r.model === "bonsai-64k:latest")).toBe(true);
    } finally {
      db.close();
    }
  });

  it("Evidence Validator PASS on lightweight commands; BLOCKED on unauthorized test diff", async () => {
    const pass = await runEvidenceValidator({
      workspace_root: tmp,
      goal_contract: minimalContract("gc-pass"),
      commands: [{ id: "true", argv: ["true"], cwd: tmp }],
    });
    expect(pass.status).toBe("TRUE_FULL_PASS");

    mkdirSync(path.join(tmp, "tests"), { recursive: true });
    writeFileSync(path.join(tmp, "tests", "hack.test.ts"), "export {}", "utf-8");
    spawnSync("git", ["add", "tests/hack.test.ts"], { cwd: tmp });
    // leave staged but uncommitted so diff --name-only HEAD sees it... 
    // actually staged new file may not show in diff HEAD without --cached.
    // Modify tracked file under tests after commit:
    spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "add test"], {
      cwd: tmp,
    });
    writeFileSync(path.join(tmp, "tests", "hack.test.ts"), "export const x = 1\n", "utf-8");

    const blocked = await runEvidenceValidator({
      workspace_root: tmp,
      goal_contract: minimalContract("gc-block"),
      commands: [{ id: "true", argv: ["true"], cwd: tmp }],
    });
    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.sensitive_diff_blocked.some((p) => p.includes("hack.test.ts"))).toBe(true);
  });

  it("OpenRouter healthCheck fails honestly without credentials", async () => {
    const prevA = process.env.OPENROUTER_API_KEY;
    const prevB = process.env.EVOLVELOOP_OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.EVOLVELOOP_OPENROUTER_API_KEY;
    try {
      const remote = new OpenRouterModelProvider();
      const health = await remote.healthCheck();
      expect(health.ok).toBe(false);
      expect(health.code).toBe("MISSING_CREDENTIALS");
    } finally {
      if (prevA !== undefined) process.env.OPENROUTER_API_KEY = prevA;
      if (prevB !== undefined) process.env.EVOLVELOOP_OPENROUTER_API_KEY = prevB;
    }
  });

  it("Ollama healthCheck reflects local daemon reachability", async () => {
    const local = new OllamaModelProvider({ timeoutMs: 3000 });
    const health = await local.healthCheck();
    // Do not invent: ok may be true or false depending on host; shape must be honest.
    expect(health.kind).toBe("ModelHealth");
    expect(health.provider_id).toBe("ollama");
    expect(typeof health.ok).toBe("boolean");
    expect(health.code.length).toBeGreaterThan(0);
  });
});
