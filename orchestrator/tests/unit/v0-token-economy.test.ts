/**
 * V0-TOK-01..06 — Token Ledger fields, zero-token routing, stdout filter,
 * fail-fast cascade, node budget breaker, skill compress.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StateDb } from "../../src/v3/state-db/index.js";
import {
  matchTrivialIntent,
  applyTrivialBypass,
} from "../../src/v3/grill-me/trivial-bypass.js";
import {
  filterProcessOutput,
  STDOUT_FILTER_HEAD_LINES,
  STDOUT_FILTER_TAIL_LINES,
  compressRuntimeSkill,
  RUNTIME_SKILL_MAX_BYTES,
  RUNTIME_SKILL_TARGET_BYTES,
  toTelegraphicEn,
  runFailFastCascade,
  FAIL_FAST_ORDER,
  evaluateNodeTokenBudget,
  slidingFailedAttempts,
  applyBudgetAbortToNodePayload,
  FAILED_ATTEMPT_CONTEXT_WINDOW,
  matchLocalValidationIntent,
  mustSkipLlm,
} from "../../src/v3/token-economy/index.js";
import {
  V0_TOKEN_BASELINE_FIXTURE,
  V0_TOKEN_PHASE1_FIXTURE,
  V0_TOKEN_REDUCTION_TARGET_MIN_PCT,
  compareTokenBaseline,
  sumTokens,
} from "../fixtures/v0-token-baseline-comparator.js";
import { CIRCUIT_BREAKER_MAX_ATTEMPTS, createCircuitBreaker, recordCircuitFailure, canAttempt } from "../../src/v3/mso/index.js";

describe("V0-TOK-01 Token Ledger fields", () => {
  let tmp: string;
  let db: StateDb;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-tok-"));
    db = new StateDb(path.join(tmp, ".evolveloop", "state.db"));
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("records subsystem, model requested vs served, breakdown, latency, cost provenance", () => {
    expect(db.journalMode()).toBe("wal");
    const entry = db.recordTokenLedger({
      work_id: "w-tok",
      task_id: "t1",
      subsystem: "circuit.adapter",
      provider_id: "ollama",
      adapter_id: "cursor",
      model_requested: "bonsai-64k:latest",
      model_served: "bonsai-64k:latest",
      tokens_in: 100,
      tokens_out: 40,
      tokens_system: 20,
      tokens_context: 50,
      tokens_tools: 30,
      tokens_output: 40,
      tokens_cache_hit: 12,
      latency_ms: 321,
      cost_usd: 0.002,
      cost_provenance: "reported",
      status: "ok",
    });

    expect(entry.subsystem).toBe("circuit.adapter");
    expect(entry.model_requested).toBe("bonsai-64k:latest");
    expect(entry.model_served).toBe("bonsai-64k:latest");
    expect(entry.tokens_system).toBe(20);
    expect(entry.tokens_context).toBe(50);
    expect(entry.tokens_tools).toBe(30);
    expect(entry.tokens_output).toBe(40);
    expect(entry.tokens_cache_hit).toBe(12);
    expect(entry.latency_ms).toBe(321);
    expect(entry.cost_provenance).toBe("reported");

    const estimated = db.recordTokenLedger({
      work_id: "w-tok",
      task_id: "t2",
      subsystem: "mso",
      model_requested: "openrouter/x",
      model_served: "openrouter/y",
      cost_usd: 0.01,
      cost_provenance: "estimated",
      status: "ok",
    });
    expect(estimated.model_requested).toBe("openrouter/x");
    expect(estimated.model_served).toBe("openrouter/y");
    expect(estimated.cost_provenance).toBe("estimated");

    const unavailable = db.recordTokenLedger({
      work_id: "w-tok",
      task_id: "t3",
      subsystem: "grill-me",
      cost_provenance: "UNAVAILABLE",
      status: "BLOCKED",
    });
    expect(unavailable.cost_provenance).toBe("UNAVAILABLE");
    expect(unavailable.tokens_cache_hit).toBeNull();

    const rows = db.listTokenLedger("w-tok");
    expect(rows.length).toBe(3);
    expect(rows.some((r) => r.subsystem === "circuit.adapter")).toBe(true);
    expect(rows.some((r) => r.model_requested === "openrouter/x")).toBe(true);
  });
});

describe("V0-TOK-02 Zero-Token Routing", () => {
  let tmp: string;
  let db: StateDb;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-tok2-"));
    db = new StateDb(path.join(tmp, ".evolveloop", "state.db"));
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("status/pause/progress match zero-token bypass", () => {
    expect(matchTrivialIntent("status")?.kind).toBe("status");
    expect(matchTrivialIntent("pause")?.kind).toBe("pause");
    expect(matchTrivialIntent("progress")?.kind).toBe("progress");
    expect(matchTrivialIntent("progresso")?.kind).toBe("progress");
    expect(matchTrivialIntent("implement auth")).toBeUndefined();
  });

  it("applyTrivialBypass for status/pause uses SQLite and 0 tokens", () => {
    const status = applyTrivialBypass("status", db);
    expect(status?.tokens_used).toBe(0);
    expect(status?.grill_me).toBe(false);
    const pause = applyTrivialBypass("pause", db);
    expect(pause?.kind).toBe("pause");
    expect(pause?.tokens_used).toBe(0);
    const progress = applyTrivialBypass("progress", db);
    expect(progress?.kind).toBe("progress");
    expect(progress?.tokens_used).toBe(0);
  });

  it("local tsc/test validation routes before any LLM", () => {
    expect(matchLocalValidationIntent("tsc")?.kind).toBe("typecheck");
    expect(matchLocalValidationIntent("test")?.suggested_stages).toEqual(["tests"]);
    expect(mustSkipLlm("validate")).toBe(true);
    expect(mustSkipLlm("ship feature X")).toBe(false);
    const bypass = applyTrivialBypass("tsc", db);
    expect(bypass?.kind).toBe("local_validation");
    expect(bypass?.tokens_used).toBe(0);
    expect(bypass?.grill_me).toBe(false);
  });
});

describe("V0-TOK-03 Telegraphic + skill compress", () => {
  it("builds telegraphic EN facts", () => {
    const line = toTelegraphicEn({ op: "status", contracts: 2, tokens: 0 });
    expect(line).toBe("op=status contracts=2 tokens=0");
  });

  it("compresses runtime skill to max 2–3 KB", () => {
    // Dense unique lines survive flourish strip and exceed the hard max.
    const bulky = Array.from({ length: 400 }, (_, i) =>
      `RULE_${i}: path=/src/mod_${i}.ts never_invent keep_id=${i} constraint=no_push`,
    ).join("\n");
    expect(Buffer.byteLength(bulky, "utf-8")).toBeGreaterThan(RUNTIME_SKILL_MAX_BYTES);
    const out = compressRuntimeSkill(bulky);
    expect(out.bytes).toBeLessThanOrEqual(RUNTIME_SKILL_MAX_BYTES);
    expect(out.within_budget).toBe(true);
    expect(out.truncated).toBe(true);
    expect(RUNTIME_SKILL_TARGET_BYTES).toBeLessThanOrEqual(RUNTIME_SKILL_MAX_BYTES);
    const small = compressRuntimeSkill("short skill");
    expect(small.truncated).toBe(false);
    expect(small.within_budget).toBe(true);
  });
});

describe("V0-TOK-04 stdout/stderr filter middleware", () => {
  it("strips ANSI, hides passed tests, dedupes stacks, head 30 + tail 20", () => {
    const ansi = "\u001b[32m✓ should pass\u001b[0m";
    const stackDup = [
      "Error: boom",
      "    at foo (a.ts:1:1)",
      "    at foo (a.ts:1:1)",
      "    at foo (a.ts:1:1)",
      "    at bar (b.ts:2:2)",
    ];
    const middle = Array.from({ length: 80 }, (_, i) => `line-${i}`);
    const raw = [ansi, ...stackDup, ...middle, "FAIL remaining"].join("\n");

    const result = filterProcessOutput(raw);
    expect(result.stats.ansi_stripped).toBe(true);
    expect(result.stats.passed_tests_hidden).toBeGreaterThanOrEqual(1);
    expect(result.stats.stack_frames_deduped).toBeGreaterThanOrEqual(2);
    expect(result.text).not.toContain("\u001b[");
    expect(result.text).not.toMatch(/✓ should pass/);

    // head 30 + marker + tail 20 when truncated
    expect(STDOUT_FILTER_HEAD_LINES).toBe(30);
    expect(STDOUT_FILTER_TAIL_LINES).toBe(20);
    expect(result.stats.truncated_middle).toBe(true);
    expect(result.text).toMatch(/truncated \d+ lines; keep head 30 \+ tail 20/);
    const outLines = result.text.split("\n");
    // head + 1 marker + tail
    expect(outLines.length).toBeLessThanOrEqual(STDOUT_FILTER_HEAD_LINES + 1 + STDOUT_FILTER_TAIL_LINES);
    expect(result.text).toContain("FAIL remaining");
  });
});

describe("V0-TOK-05 Fail-Fast cascade", () => {
  it("aborts on first error and skips later stages", async () => {
    const calls: string[] = [];
    const report = await runFailFastCascade(async (stage) => {
      calls.push(stage);
      if (stage === "syntax_types") {
        return { stage, ok: false, exit_code: 1, stderr: "TS2322" };
      }
      return { stage, ok: true, exit_code: 0 };
    });
    expect(FAIL_FAST_ORDER).toEqual(["syntax_types", "tests", "lint"]);
    expect(report.aborted).toBe(true);
    expect(report.abort_stage).toBe("syntax_types");
    expect(calls).toEqual(["syntax_types"]);
    expect(report.stages_skipped).toEqual(["tests", "lint"]);
    expect(report.tokens_used).toBe(0);
  });

  it("runs full cascade when all stages pass", async () => {
    const report = await runFailFastCascade(async (stage) => ({
      stage,
      ok: true,
      exit_code: 0,
    }));
    expect(report.aborted).toBe(false);
    expect(report.stages_run.map((s) => s.stage)).toEqual([...FAIL_FAST_ORDER]);
    expect(report.stages_skipped).toEqual([]);
  });
});

describe("V0-TOK-06 max_tokens_budget breaker", () => {
  it("alerts at 80% and aborts+checkpoints at 100%", () => {
    const base = {
      work_id: "w1",
      task_id: "n1",
      max_tokens_budget: 1000,
      failed_attempts: [] as [],
    };
    const ok = evaluateNodeTokenBudget({ ...base, tokens_consumed: 500 });
    expect(ok.verdict).toBe("ok");
    expect(ok.aborted).toBe(false);

    const alert = evaluateNodeTokenBudget({ ...base, tokens_consumed: 800 });
    expect(alert.verdict).toBe("alert_80");
    expect(alert.aborted).toBe(false);

    const abort = evaluateNodeTokenBudget({ ...base, tokens_consumed: 1000 });
    expect(abort.verdict).toBe("abort_100");
    expect(abort.aborted).toBe(true);
    expect(abort.checkpoint).toBeDefined();
    expect((abort.checkpoint as { reason?: string }).reason).toBe("max_tokens_budget_exhausted");

    const payload = applyBudgetAbortToNodePayload({ title: "x" }, abort);
    expect(payload.token_budget_verdict).toBe("abort_100");
    expect(payload.token_budget_checkpoint).toBeDefined();
  });

  it("sliding window keeps max 2 failed attempts in context", () => {
    expect(FAILED_ATTEMPT_CONTEXT_WINDOW).toBe(2);
    const attempts = [
      { attempt_id: "a1", task_id: "n1", error_summary: "e1", at: "t1" },
      { attempt_id: "a2", task_id: "n1", error_summary: "e2", at: "t2" },
      { attempt_id: "a3", task_id: "n1", error_summary: "e3", at: "t3" },
    ];
    const win = slidingFailedAttempts(attempts);
    expect(win).toHaveLength(2);
    expect(win.map((a) => a.attempt_id)).toEqual(["a2", "a3"]);

    const evald = evaluateNodeTokenBudget({
      work_id: "w1",
      task_id: "n1",
      max_tokens_budget: 100,
      tokens_consumed: 10,
      failed_attempts: attempts,
    });
    expect(evald.context_failed_attempts).toHaveLength(2);
  });
});

describe("V0-TEST-D token economy baseline comparator (offline)", () => {
  it("zero tokens on status/pause; circuit breaker at 3; ledger + budget covered above", () => {
    expect(matchTrivialIntent("status")?.tokens_used).toBe(0);
    expect(matchTrivialIntent("pause")?.tokens_used).toBe(0);
    expect(CIRCUIT_BREAKER_MAX_ATTEMPTS).toBe(3);
    let cb = createCircuitBreaker("tok-cb");
    cb = recordCircuitFailure(cb, "EXEC_CODE", "1");
    cb = recordCircuitFailure(cb, "EXEC_CODE", "2");
    cb = recordCircuitFailure(cb, "EXEC_CODE", "3");
    expect(cb.open).toBe(true);
    expect(canAttempt(cb)).toBe(false);
  });

  it("deterministic baseline comparator fixture; does NOT claim live ≥50% without harness", () => {
    const baseline = sumTokens(V0_TOKEN_BASELINE_FIXTURE);
    const phase = sumTokens(V0_TOKEN_PHASE1_FIXTURE);
    expect(baseline).toBe(16_000);
    expect(phase).toBe(4_800);

    const offline = compareTokenBaseline(V0_TOKEN_BASELINE_FIXTURE, V0_TOKEN_PHASE1_FIXTURE);
    // Fixture math proves comparator; offline stand-in happens to exceed target,
    // but live_harness_required remains true so we never falsely claim live savings.
    expect(offline.reduction_pct).toBeGreaterThanOrEqual(V0_TOKEN_REDUCTION_TARGET_MIN_PCT);
    expect(offline.meets_target).toBe(true);
    expect(offline.live_harness_required).toBe(true);
    expect(offline.notes.some((n) => n.includes("LIVE_GAP"))).toBe(true);

    const liveClaimBlocked = compareTokenBaseline(V0_TOKEN_BASELINE_FIXTURE, V0_TOKEN_PHASE1_FIXTURE, {
      claim_live: false,
    });
    expect(liveClaimBlocked.live_harness_required).toBe(true);
  });
});
