/**
 * V0-TOK-05 — Fail-Fast cascade: Syntax/Types → Tests → Lint; abort on first error.
 */

export type FailFastStageId = "syntax_types" | "tests" | "lint";

export const FAIL_FAST_ORDER: readonly FailFastStageId[] = [
  "syntax_types",
  "tests",
  "lint",
] as const;

export interface FailFastStageResult {
  stage: FailFastStageId;
  ok: boolean;
  exit_code: number | null;
  stdout?: string;
  stderr?: string;
  skipped?: boolean;
  reason?: string;
}

export interface FailFastCascadeReport {
  kind: "FailFastCascadeReport";
  aborted: boolean;
  abort_stage?: FailFastStageId;
  stages_run: FailFastStageResult[];
  stages_skipped: FailFastStageId[];
  tokens_used: 0;
}

export type FailFastRunner = (stage: FailFastStageId) => FailFastStageResult | Promise<FailFastStageResult>;

/**
 * Run cascade in rigid order. On first non-ok stage: abort and skip the rest.
 * Deterministic — no LLM.
 */
export async function runFailFastCascade(
  runner: FailFastRunner,
  order: readonly FailFastStageId[] = FAIL_FAST_ORDER,
): Promise<FailFastCascadeReport> {
  const stages_run: FailFastStageResult[] = [];
  const stages_skipped: FailFastStageId[] = [];
  let aborted = false;
  let abort_stage: FailFastStageId | undefined;

  for (let i = 0; i < order.length; i++) {
    const stage = order[i]!;
    if (aborted) {
      stages_skipped.push(stage);
      continue;
    }
    const result = await Promise.resolve(runner(stage));
    stages_run.push(result);
    if (!result.ok) {
      aborted = true;
      abort_stage = stage;
      for (let j = i + 1; j < order.length; j++) {
        stages_skipped.push(order[j]!);
      }
      break;
    }
  }

  return {
    kind: "FailFastCascadeReport",
    aborted,
    abort_stage,
    stages_run,
    stages_skipped,
    tokens_used: 0,
  };
}

/** Suggested local argv for Node/TS workspaces (caller may override). */
export function defaultFailFastCommands(workspaceHas: {
  tsc?: boolean;
  test?: boolean;
  lint?: boolean;
}): Record<FailFastStageId, string[]> {
  return {
    syntax_types: workspaceHas.tsc !== false ? ["npx", "tsc", "--noEmit"] : ["true"],
    tests: workspaceHas.test !== false ? ["npm", "test"] : ["true"],
    lint: workspaceHas.lint !== false ? ["npm", "run", "lint"] : ["true"],
  };
}
