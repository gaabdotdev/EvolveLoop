/**
 * V1-TOK-06 — Stateless worker snapshot O(1): Goal + Git Diff + Last Filtered Error.
 * Size must stay stable across N fake turns (no chat-history growth).
 */

import { describe, it, expect } from "vitest";
import {
  buildStatelessWorkerSnapshot,
  buildStatelessWorkerPrompt,
} from "../../src/v3/token-economy/index.js";
import { buildStatelessWorkerSnapshot as fromExecutionRunner } from "../../src/v3/execution-runner/index.js";
import { buildWorkerPrompt as liveBuildWorkerPrompt } from "../../src/v3/evaluation/live/prompts.js";

describe("V1-TOK-06 stateless worker snapshot", () => {
  const goal = "Fix clamp lower bound in math helpers.";
  const gitDiff = [
    "diff --git a/src/math.js b/src/math.js",
    "--- a/src/math.js",
    "+++ b/src/math.js",
    "@@ -1,3 +1,3 @@",
    "-  return Math.max(lo, Math.min(hi, x));",
    "+  return Math.min(hi, Math.max(lo, x));",
  ].join("\n");
  const lastError = [
    "\u001b[31mError: expected 0\u001b[0m",
    "    at test (math.test.js:10:5)",
    "    at test (math.test.js:10:5)",
    "✓ should pass unrelated",
  ].join("\n");

  it("builds O(1) snapshot with Goal + Diff + Filtered Error only", () => {
    const snap = buildStatelessWorkerSnapshot({
      goal,
      git_diff: gitDiff,
      last_filtered_error: lastError,
      workspace_hint: "/tmp/ws",
      worker_id: "w1",
    });

    expect(snap.kind).toBe("StatelessWorkerSnapshot");
    expect(snap.includes_chat_history).toBe(false);
    expect(snap.prompt).toContain("=== GOAL ===");
    expect(snap.prompt).toContain(goal);
    expect(snap.prompt).toContain("=== GIT DIFF ===");
    expect(snap.prompt).toContain("src/math.js");
    expect(snap.prompt).toContain("=== LAST FILTERED ERROR ===");
    // stdout filter: ANSI stripped, passed tests hidden, stack deduped
    expect(snap.last_filtered_error).not.toContain("\u001b[");
    expect(snap.last_filtered_error).not.toMatch(/✓ should pass/);
    expect(snap.prompt).toMatch(/No chat history/);
    expect(snap.prompt).not.toMatch(/previous messages|conversation transcript/i);
    expect(snap.byte_length).toBe(Buffer.byteLength(snap.prompt, "utf-8"));
  });

  it("snapshot size is stable across N fake turns (no O(N) history)", () => {
    const sizes: number[] = [];
    for (let turn = 1; turn <= 40; turn++) {
      // Simulate growing chat that a naive builder would append — we MUST ignore it.
      const fakeHistory = Array.from({ length: turn }, (_, i) => ({
        role: "tool" as const,
        content: `HUGE_TOOL_OUTPUT_TURN_${i}_` + "x".repeat(500),
        turn: i,
      }));
      void fakeHistory; // deliberately unused — API has no history channel

      const snap = buildStatelessWorkerSnapshot({
        goal,
        git_diff: gitDiff,
        last_filtered_error: lastError,
      });
      sizes.push(snap.byte_length);

      // Prompt must not contain fabricated history payloads
      expect(snap.prompt).not.toContain("HUGE_TOOL_OUTPUT_TURN_");
    }

    const first = sizes[0]!;
    for (const s of sizes) {
      expect(s).toBe(first);
    }
    // Bound: O(1) relative to N=40 — variance zero
    const max = Math.max(...sizes);
    const min = Math.min(...sizes);
    expect(max - min).toBe(0);
  });

  it("buildStatelessWorkerPrompt appends acceptance without history", () => {
    const { snapshot, prompt } = buildStatelessWorkerPrompt({
      goal,
      git_diff: gitDiff,
      acceptance: ["Lower bound enforced"],
      constraints: ["Minimal change"],
    });
    expect(snapshot.includes_chat_history).toBe(false);
    expect(prompt).toContain("Lower bound enforced");
    expect(prompt.startsWith(snapshot.prompt)).toBe(true);
  });

  it("execution-runner re-exports snapshot builder", () => {
    expect(fromExecutionRunner).toBe(buildStatelessWorkerSnapshot);
    const snap = fromExecutionRunner({ goal: "g", git_diff: "d", last_filtered_error: "e" });
    expect(snap.kind).toBe("StatelessWorkerSnapshot");
  });

  it("live buildWorkerPrompt wires through stateless snapshot", () => {
    const brief = {
      task_id: "T01",
      title: "Fix clamp",
      objective: goal,
      acceptance: ["Lower bound is enforced"],
      constraints: ["Prefer minimal change"],
    };
    const prompt = liveBuildWorkerPrompt(brief, "/tmp/ws", {
      git_diff: gitDiff,
      last_filtered_error: "Error: boom",
    });
    expect(prompt).toContain("=== GOAL ===");
    expect(prompt).toContain("=== GIT DIFF ===");
    expect(prompt).toContain(gitDiff);
    expect(prompt).toContain("=== LAST FILTERED ERROR ===");
    expect(prompt).toContain("Lower bound is enforced");
    expect(prompt).not.toContain("HUGE_HISTORY");
  });
});
