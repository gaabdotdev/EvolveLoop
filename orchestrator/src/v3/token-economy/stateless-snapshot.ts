/**
 * V1-TOK-06 — Stateless Snapshot workers.
 *
 * Worker execution context is O(1): [Goal] + [Git Diff] + [Last Filtered Error].
 * Chat history MUST NOT be included — size stays stable across N turns.
 */

import { filterProcessOutput } from "./stdout-filter.js";

export interface StatelessWorkerSnapshotInput {
  goal: string;
  /** Unified / patch diff for the worker workspace. */
  git_diff?: string | null;
  /** Last process error already filtered, or raw stderr to filter. */
  last_filtered_error?: string | null;
  /** When true (default), run filterProcessOutput on last_filtered_error. */
  filter_error?: boolean;
  /** Optional worker id / task label for the prompt header. */
  worker_id?: string;
  workspace_hint?: string;
}

export interface StatelessWorkerSnapshot {
  kind: "StatelessWorkerSnapshot";
  goal: string;
  git_diff: string;
  last_filtered_error: string;
  /** Assembled prompt — O(1) fields only. */
  prompt: string;
  byte_length: number;
  /** Explicit proof no history channel exists on this object. */
  includes_chat_history: false;
}

const EMPTY_DIFF = "(no diff)";
const EMPTY_ERROR = "(no filtered error)";

function normalizeBlock(value: string | null | undefined, empty: string): string {
  const t = (value ?? "").trim();
  return t.length > 0 ? t : empty;
}

/**
 * Build O(1) worker context. Deliberately accepts NO messages/history parameter.
 */
export function buildStatelessWorkerSnapshot(
  input: StatelessWorkerSnapshotInput,
): StatelessWorkerSnapshot {
  const goal = normalizeBlock(input.goal, "(no goal)");
  const git_diff = normalizeBlock(input.git_diff, EMPTY_DIFF);

  let errRaw = input.last_filtered_error ?? "";
  if (input.filter_error !== false && errRaw.trim().length > 0) {
    errRaw = filterProcessOutput(errRaw).text;
  }
  const last_filtered_error = normalizeBlock(errRaw, EMPTY_ERROR);

  const headerBits: string[] = ["You are a stateless engineering worker."];
  if (input.worker_id) headerBits.push(`Worker id: ${input.worker_id}`);
  if (input.workspace_hint) headerBits.push(`Workspace: ${input.workspace_hint}`);
  headerBits.push(
    "Context is O(1): Goal + Git Diff + Last Filtered Error only. No chat history.",
  );

  const prompt = [
    ...headerBits,
    "",
    "=== GOAL ===",
    goal,
    "=== GIT DIFF ===",
    git_diff,
    "=== LAST FILTERED ERROR ===",
    last_filtered_error,
    "=== END SNAPSHOT ===",
  ].join("\n");

  return {
    kind: "StatelessWorkerSnapshot",
    goal,
    git_diff,
    last_filtered_error,
    prompt,
    byte_length: Buffer.byteLength(prompt, "utf-8"),
    includes_chat_history: false,
  };
}

/**
 * Worker prompt builder that ALWAYS goes through the stateless snapshot.
 * Extra acceptance/constraints are appended AFTER the O(1) snapshot (still no history).
 */
export function buildStatelessWorkerPrompt(
  input: StatelessWorkerSnapshotInput & {
    acceptance?: readonly string[];
    constraints?: readonly string[];
  },
): { snapshot: StatelessWorkerSnapshot; prompt: string } {
  const snapshot = buildStatelessWorkerSnapshot(input);
  const extras: string[] = [];
  if (input.acceptance && input.acceptance.length > 0) {
    extras.push("Acceptance criteria:", ...input.acceptance.map((a) => `- ${a}`));
  }
  if (input.constraints && input.constraints.length > 0) {
    extras.push("Constraints:", ...input.constraints.map((c) => `- ${c}`));
  }
  const prompt =
    extras.length > 0 ? [snapshot.prompt, "", ...extras].join("\n") : snapshot.prompt;
  return { snapshot, prompt };
}
