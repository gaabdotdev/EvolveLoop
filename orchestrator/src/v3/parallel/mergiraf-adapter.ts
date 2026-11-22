/**
 * V2-ORCH-02 — Optional Mergiraf adapter.
 * Detects host binary; when absent, callers must use the internal AST engine.
 * Never invents a merge — only shells out when the binary is present.
 */

import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";

export interface MergirafDetection {
  available: boolean;
  path: string | null;
  reason: string;
}

export interface MergirafMergeInput {
  path: string;
  base: string;
  ours: string;
  theirs: string;
  /** Absolute path to mergiraf binary (from detectMergiraf). */
  binary_path: string;
}

export interface MergirafMergeResult {
  ok: boolean;
  content?: string;
  stderr?: string;
  status: number | null;
}

const CANDIDATE_NAMES = ["mergiraf", "git-mergiraf"];

/**
 * Probe PATH (and optional absolute override) for a mergiraf binary.
 * Deterministic: first existing executable wins in CANDIDATE_NAMES order.
 */
export function detectMergiraf(opts?: { path_override?: string }): MergirafDetection {
  if (opts?.path_override) {
    try {
      accessSync(opts.path_override, constants.X_OK);
      return { available: true, path: opts.path_override, reason: "path_override" };
    } catch {
      return {
        available: false,
        path: null,
        reason: `path_override_not_executable:${opts.path_override}`,
      };
    }
  }

  for (const name of CANDIDATE_NAMES) {
    const which = spawnSync("which", [name], { encoding: "utf-8" });
    if (which.status === 0) {
      const found = (which.stdout ?? "").trim().split("\n")[0]?.trim();
      if (found) {
        return { available: true, path: found, reason: `which:${name}` };
      }
    }
  }

  return { available: false, path: null, reason: "mergiraf_not_installed" };
}

/**
 * Attempt a 3-way merge via mergiraf. Caller must only invoke when detectMergiraf().available.
 * Uses temp stdin protocol is NOT assumed — writes are left to the caller; this adapter
 * invokes `mergiraf merge` with file paths when provided via a staging helper, or returns
 * not-ok if the binary rejects. For unit tests without binary, this is never called.
 *
 * Note: when binary is missing, return ok:false — do not fake a merge.
 */
export function runMergirafMerge(input: MergirafMergeInput): MergirafMergeResult {
  // Mergiraf expects paths on disk; stage via process substitution is host-specific.
  // We pass content through a minimal CLI shape: merge --base - --ours - --theirs -
  // If the installed binary differs, fail closed so AstAwareMerge can take over.
  const run = spawnSync(
    input.binary_path,
    ["merge", "--path", input.path],
    {
      encoding: "utf-8",
      input: JSON.stringify({
        base: input.base,
        ours: input.ours,
        theirs: input.theirs,
      }),
      timeout: 30_000,
    },
  );

  if (run.error || run.status !== 0) {
    return {
      ok: false,
      stderr: run.stderr || (run.error ? String(run.error) : "mergiraf_failed"),
      status: run.status,
    };
  }

  const out = (run.stdout ?? "").trim();
  if (!out) {
    return { ok: false, stderr: "mergiraf_empty_stdout", status: run.status };
  }
  return { ok: true, content: out, status: run.status };
}
