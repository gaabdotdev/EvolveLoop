/**
 * Live LLM prompts — intentionally do NOT include solver answers or task-id cheat sheets.
 */

export interface LiveTaskBrief {
  task_id: string;
  title: string;
  objective: string;
  acceptance: string[];
  constraints: string[];
}

/** Public briefs for live runs — no pre-coded solution body. */
export const LIVE_TASK_BRIEFS: Record<string, LiveTaskBrief> = {
  T01: {
    task_id: "T01",
    title: "Fix clamp lower bound",
    objective: "Investigate math helpers and fix incorrect lower-bound clamping behavior.",
    acceptance: ["Lower bound is enforced", "Existing tests still pass", "Add coverage for the lower bound"],
    constraints: ["Prefer minimal change", "Match existing module style"],
  },
  T04: {
    task_id: "T04",
    title: "Cart removeItem zero cleanup",
    objective: "When quantity reaches zero, cart keys must be removed from the store.",
    acceptance: ["Zero qty deletes key", "Partial remove still works", "Existing cart tests pass"],
    constraints: ["Touch only store/cart layers as needed"],
  },
  T07: {
    task_id: "T07",
    title: "Add /echo route",
    objective: "Add an authenticated /echo route that returns the request body.",
    acceptance: ["Echo works with auth", "Unauthorized rejected", "Existing routes unchanged"],
    constraints: ["Follow existing router/auth patterns"],
  },
};

export function buildWorkerPrompt(brief: LiveTaskBrief, workspaceHint: string): string {
  return [
    "You are an engineering agent working inside an isolated workspace.",
    `Workspace root (edit files here): ${workspaceHint}`,
    `Objective: ${brief.objective}`,
    "Acceptance criteria:",
    ...brief.acceptance.map((a) => `- ${a}`),
    "Constraints:",
    ...brief.constraints.map((c) => `- ${c}`),
    "Explore the repository yourself. Do not assume a hidden solution.",
    "Make real file edits under the workspace root, run `node --test` on test/*.test.js, and stop when criteria are met.",
    "Do not claim success without tests passing.",
  ].join("\n");
}

export function buildReviewerPrompt(input: {
  objective: string;
  acceptance: string[];
  diffSummary: string;
  testSummary: string;
  implementerClaim?: string;
}): string {
  return [
    "You are an independent reviewer in a separate session from the implementer.",
    "Do NOT trust the implementer's claim of completion.",
    "Do NOT invent file contents. The PREV/NEXT blocks below are the authoritative workspace snapshots.",
    "Judge ONLY from PREV/NEXT and the test summary.",
    "If NEXT meets acceptance criteria AND tests show exit=0 with # fail 0, verdict MUST be PASS.",
    "If NEXT still violates a mandatory criterion, verdict MUST be FAIL.",
    `Objective: ${input.objective}`,
    "Acceptance criteria:",
    ...input.acceptance.map((a) => `- ${a}`),
    "=== BEGIN FILE SNAPSHOTS (PREV → NEXT) ===",
    input.diffSummary.slice(0, 14000),
    "=== END FILE SNAPSHOTS ===",
    "=== BEGIN TEST SUMMARY ===",
    input.testSummary.slice(0, 4000),
    "=== END TEST SUMMARY ===",
    input.implementerClaim
      ? `Implementer claim (untrusted): ${input.implementerClaim}`
      : "No implementer claim provided.",
    "Respond with STRICT JSON only (no markdown fences, no prose outside JSON):",
    '{"verdict":"PASS"|"FAIL","findings":[{"severity":"low|medium|high","criterion":"...","detail":"..."}],"recommendation":"..."}',
  ].join("\n");
}
