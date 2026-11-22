/**
 * V2-ORCH-02 — Deterministic Merge Queue + AST-Aware Merge.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  MergeQueue,
  astAwareMerge,
  detectMergiraf,
  runIntegratedTests,
} from "../../src/v3/parallel/index.js";
import { getSymbolMapTreeSitterInitError } from "../../src/v3/token-economy/index.js";

const BASE_TS = `export function shared(): number {
  return 1;
}
`;

const OURS_DISJOINT = `export function shared(): number {
  return 1;
}

export function alpha(): string {
  return "alpha";
}
`;

const THEIRS_DISJOINT = `export function shared(): number {
  return 1;
}

export function beta(): string {
  return "beta";
}
`;

const OURS_SAME_FN = `export function shared(): number {
  return 2;
}
`;

const THEIRS_SAME_FN = `export function shared(): number {
  return 3;
}
`;

describe("V2-ORCH-02 Merge Queue + AST-Aware Merge", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v2-orch-02-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  });

  it("fila ordena deterministicamente por enqueue_seq | created_at | task_id", () => {
    const q = new MergeQueue();
    // Same created_at → task_id tie-break after seq.
    const t0 = "2026-01-01T00:00:00.000Z";
    q.enqueue({
      task_id: "z-last",
      created_at: t0,
      target_branch: "main",
      files: [],
    });
    q.enqueue({
      task_id: "a-first-same-time-but-later-seq",
      created_at: t0,
      target_branch: "main",
      files: [],
    });
    q.enqueue({
      task_id: "early-created",
      created_at: "2025-12-01T00:00:00.000Z",
      target_branch: "main",
      files: [],
    });

    const order = q.listQueued().map((i) => i.task_id);
    // enqueue_seq dominates: first enqueued wins even if created_at is later.
    expect(order).toEqual(["z-last", "a-first-same-time-but-later-seq", "early-created"]);
    expect(q.listQueued().map((i) => i.enqueue_seq)).toEqual([1, 2, 3]);
  });

  it("merge sintático de funções disjuntas no mesmo arquivo TS → sucesso sem LLM", () => {
    expect(getSymbolMapTreeSitterInitError()).toBeNull();

    const result = astAwareMerge({
      path: "src/mod.ts",
      base: BASE_TS,
      ours: OURS_DISJOINT,
      theirs: THEIRS_DISJOINT,
      prefer_mergiraf: false,
    });

    expect(result.status).toBe("MERGED");
    expect(result.engine).toBe("ast-internal");
    expect(result.syntactic_resolved).toBe(true);
    expect(result.semantic_needed).toBe(false);
    expect(result.content).toBeDefined();
    expect(result.content!).toContain("function alpha");
    expect(result.content!).toContain("function beta");
    expect(result.content!).toContain("function shared");
  });

  it("conflito no mesmo identificador/função → NEEDS_SEMANTIC_TASK", () => {
    const result = astAwareMerge({
      path: "src/mod.ts",
      base: BASE_TS,
      ours: OURS_SAME_FN,
      theirs: THEIRS_SAME_FN,
      prefer_mergiraf: false,
    });

    expect(result.status).toBe("NEEDS_SEMANTIC_TASK");
    expect(result.semantic_needed).toBe(true);
    expect(result.syntactic_resolved).toBe(false);
    expect(result.overlapping_symbols).toContain("shared");
    expect(result.content).toBeUndefined();
  });

  it("testes integrados falhando bloqueiam finalize (sem commit)", async () => {
    const repo = path.join(tmp, "repo");
    mkdirSync(repo, { recursive: true });
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf-8" });
    spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: repo });
    mkdirSync(path.join(repo, "src"), { recursive: true });
    writeFileSync(path.join(repo, "src", "mod.ts"), BASE_TS, "utf-8");
    spawnSync("git", ["add", "."], { cwd: repo });
    spawnSync("git", ["commit", "-m", "base"], { cwd: repo });

    const q = new MergeQueue();
    q.enqueue({
      task_id: "t-fail-tests",
      created_at: "2026-01-01T00:00:00.000Z",
      target_branch: "main",
      cwd: repo,
      files: [
        {
          path: "src/mod.ts",
          base: BASE_TS,
          ours: OURS_DISJOINT,
          theirs: THEIRS_DISJOINT,
        },
      ],
    });

    const logBefore = spawnSync("git", ["log", "--oneline"], { cwd: repo, encoding: "utf-8" });
    const commitsBefore = (logBefore.stdout ?? "").trim().split("\n").filter(Boolean).length;

    const out = await q.processNext("main", {
      prefer_mergiraf: false,
      commit: true,
      commit_message: "should-not-commit",
      runIntegratedTests: async () => ({
        ok: false,
        output: "injected failure",
        exit_code: 1,
      }),
    });

    expect(out.blocked_by_tests).toBe(true);
    expect(out.item?.status).toBe("TESTS_FAILED");
    expect(out.item?.last_error).toContain("injected failure");

    const logAfter = spawnSync("git", ["log", "--oneline"], { cwd: repo, encoding: "utf-8" });
    const commitsAfter = (logAfter.stdout ?? "").trim().split("\n").filter(Boolean).length;
    expect(commitsAfter).toBe(commitsBefore);
  });

  it("quando mergiraf ausente, fallback AST interno ainda funciona", async () => {
    const detected = detectMergiraf();
    expect(detected.available).toBe(false);
    expect(detected.path).toBeNull();

    const q = new MergeQueue();
    q.enqueue({
      task_id: "t-fallback",
      created_at: "2026-01-01T00:00:00.000Z",
      target_branch: "main",
      cwd: tmp,
      files: [
        {
          path: "src/mod.ts",
          base: BASE_TS,
          ours: OURS_DISJOINT,
          theirs: THEIRS_DISJOINT,
        },
      ],
    });

    const out = await q.processNext("main", {
      prefer_mergiraf: true, // detect → absent → internal AST
      commit: false,
      runIntegratedTests,
    });

    expect(out.mergiraf_available).toBe(false);
    expect(out.blocked_by_tests).toBe(false);
    expect(out.item?.status).toBe("MERGED");
    expect(out.item?.merge_results?.["src/mod.ts"]?.engine).toBe("ast-internal");
    expect(out.item?.merged_files?.["src/mod.ts"]).toContain("function alpha");
    expect(out.item?.merged_files?.["src/mod.ts"]).toContain("function beta");
    expect(existsSync(path.join(tmp, "src", "mod.ts"))).toBe(true);
    expect(out.metrics.syntactic_resolved).toBeGreaterThanOrEqual(1);
    expect(out.metrics.syntactic_ratio).toBeGreaterThanOrEqual(0.9);
  });

  it("default runIntegratedTests é no-op success", async () => {
    const r = await runIntegratedTests(tmp);
    expect(r.ok).toBe(true);
  });

  it("MergeQueue serializa: processNext só avança a cabeça", async () => {
    const q = new MergeQueue();
    q.enqueue({
      task_id: "t1",
      created_at: "2026-01-01T00:00:00.000Z",
      target_branch: "main",
      files: [
        {
          path: "a.ts",
          base: BASE_TS,
          ours: OURS_DISJOINT,
          theirs: THEIRS_DISJOINT,
        },
      ],
    });
    q.enqueue({
      task_id: "t2",
      created_at: "2026-01-01T00:00:01.000Z",
      target_branch: "main",
      files: [
        {
          path: "b.ts",
          base: BASE_TS,
          ours: OURS_DISJOINT,
          theirs: THEIRS_DISJOINT,
        },
      ],
    });

    const first = await q.processNext("main", { prefer_mergiraf: false, apply_files: false });
    expect(first.item?.task_id).toBe("t1");
    expect(first.item?.status).toBe("MERGED");
    expect(q.listQueued().map((i) => i.task_id)).toEqual(["t2"]);
  });
});
