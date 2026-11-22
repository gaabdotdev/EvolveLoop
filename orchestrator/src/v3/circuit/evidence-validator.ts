/**
 * Evidence Validator (V0) — runs build/typecheck/tests OUTSIDE the agent session.
 * Blocks if git diff touches tests/build scripts without Goal Contract authorization.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  defaultExecutionRunner,
  type ExecutionRunner,
  type ExecutionRunnerResult,
} from "../execution-runner/index.js";
import type { GoalContract } from "../goal-contract/types.js";
import { evaluateTrueFullPass } from "../goal-contract/types.js";
import {
  contractRequiresIndependentReview,
  type IndependentReviewGate,
} from "../evaluation/independent-review-gate.js";
import {
  contractMutationThreshold,
  contractRequiresMutationGate,
  evaluateMutationGate,
  type MutationBatteryResult,
} from "../evaluation/selective-mutation.js";

const TEST_OR_BUILD_PATTERNS = [
  /(^|\/)tests?\//i,
  /(^|\/)__tests__\//i,
  /\.(test|spec)\.[jt]sx?$/i,
  /(^|\/)vitest\.config\./i,
  /(^|\/)jest\.config\./i,
  /(^|\/)package\.json$/i,
  /(^|\/)tsconfig.*\.json$/i,
  /(^|\/)scripts\/.*build/i,
  /(^|\/)Makefile$/i,
];

export interface EvidenceValidatorOptions {
  workspace_root: string;
  goal_contract: GoalContract;
  /** Relative paths the contract authorizes for test/build script edits. */
  authorized_sensitive_paths?: string[];
  /** Commands to run outside agent session (default: detect package.json scripts). */
  commands?: Array<{ id: string; argv: string[]; cwd?: string }>;
  runner?: ExecutionRunner;
  timeout_ms?: number;
  /** Skip git-diff gate (tests only). */
  skip_diff_gate?: boolean;
  /**
   * V2-QUAL-01 — When goal_contract.require_independent_review, a valid PASS
   * review on this gate is required before TRUE_FULL_PASS / VERIFIED_PASS.
   */
  independent_review_gate?: IndependentReviewGate;
  /**
   * V2-QUAL-02 — Precomputed selective mutation battery. Required when
   * goal_contract.require_mutation_gate; score must meet threshold.
   */
  mutation_battery?: MutationBatteryResult;
  /** Override threshold (else contract.mutation_score_threshold or 1.0). */
  mutation_score_threshold?: number;
}

export interface EvidenceValidatorResult {
  kind: "EvidenceValidatorResult";
  status: "TRUE_FULL_PASS" | "BLOCKED" | "NOT_PASS";
  code: string;
  reasons: string[];
  sensitive_diff_blocked: string[];
  /** M18 — classified mutate/delete/skip of tests (or sensitive build paths as mutate). */
  test_adulterations: TestAdulteration[];
  command_results: Array<{
    id: string;
    argv: string[];
    exit_code: number | null;
    status: ExecutionRunnerResult["status"];
    duration_ms: number;
  }>;
  evaluated_at: string;
  limitations: string[];
}

export type TestAdulterationKind = "mutate" | "delete" | "skip";

export interface TestAdulteration {
  path: string;
  kind: TestAdulterationKind;
  detail?: string;
}

/** Skip / disable patterns that weaken or bypass existing tests. */
const SKIP_DIFF_PATTERNS = [
  /\b(?:it|test|describe)\s*\.\s*skip\b/,
  /\b(?:xit|xtest|xdescribe)\s*\(/,
  /\.skip\s*\(/,
  /\bpending\s*\(/,
];

/** All git inspection goes through ExecutionRunner (V0-SEC-01 / V0-SEC-06). */
function listChangedNameStatus(
  workspace: string,
  runner: ExecutionRunner,
): Array<{ status: string; path: string }> {
  const unstaged = runner.runSync({
    argv: ["git", "diff", "--name-status", "HEAD"],
    cwd: workspace,
    workspace_root: workspace,
    timeout_ms: 30_000,
  });
  const staged = runner.runSync({
    argv: ["git", "diff", "--name-status", "--cached"],
    cwd: workspace,
    workspace_root: workspace,
    timeout_ms: 30_000,
  });
  const byPath = new Map<string, string>();
  for (const block of [unstaged, staged]) {
    if (block.status !== "ok" && block.exit_code !== 0) continue;
    for (const line of block.stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Formats: "M\tpath", "D\tpath", "A\tpath", "R100\told\tnew"
      const parts = trimmed.split(/\t/);
      if (parts.length < 2) continue;
      const statusCode = (parts[0] ?? "").charAt(0).toUpperCase();
      const path = parts.length >= 3 ? (parts[parts.length - 1] ?? "") : (parts[1] ?? "");
      if (!path) continue;
      // Prefer delete over mutate if both appear
      const prev = byPath.get(path);
      if (prev === "D") continue;
      byPath.set(path, statusCode);
    }
  }
  return [...byPath.entries()].map(([path, status]) => ({ status, path }));
}

function listChangedFiles(workspace: string, runner: ExecutionRunner): string[] {
  return listChangedNameStatus(workspace, runner).map((e) => e.path);
}

function readUnifiedDiff(workspace: string, runner: ExecutionRunner, rel: string): string {
  const unstaged = runner.runSync({
    argv: ["git", "diff", "HEAD", "--", rel],
    cwd: workspace,
    workspace_root: workspace,
    timeout_ms: 30_000,
  });
  const staged = runner.runSync({
    argv: ["git", "diff", "--cached", "--", rel],
    cwd: workspace,
    workspace_root: workspace,
    timeout_ms: 30_000,
  });
  return `${unstaged.stdout ?? ""}\n${staged.stdout ?? ""}`;
}

function detectSkipInDiff(diff: string): boolean {
  // Only look at added lines to avoid flagging removals of prior skips.
  const added = diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1))
    .join("\n");
  return SKIP_DIFF_PATTERNS.some((re) => re.test(added));
}

/**
 * Classify unauthorized test-file changes as mutate / delete / skip.
 * Build scripts and non-test sensitive paths are reported as mutate.
 */
export function classifyTestAdulterations(
  entries: Array<{ status: string; path: string }>,
  opts: {
    workspace: string;
    runner: ExecutionRunner;
    isAuthorized: (rel: string) => boolean;
  },
): TestAdulteration[] {
  const out: TestAdulteration[] = [];
  for (const { status, path: rel } of entries) {
    if (!isSensitive(rel) || opts.isAuthorized(rel)) continue;
    const isTestFile =
      /(^|\/)tests?\//i.test(rel) ||
      /(^|\/)__tests__\//i.test(rel) ||
      /\.(test|spec)\.[jt]sx?$/i.test(rel);

    if (status === "D") {
      out.push({
        path: rel,
        kind: "delete",
        detail: "deleted_sensitive_path",
      });
      continue;
    }

    if (isTestFile && (status === "M" || status === "A" || status === "R")) {
      const diff = readUnifiedDiff(opts.workspace, opts.runner, rel);
      if (detectSkipInDiff(diff)) {
        out.push({
          path: rel,
          kind: "skip",
          detail: "skip_or_pending_pattern_in_diff",
        });
        continue;
      }
      out.push({
        path: rel,
        kind: "mutate",
        detail: status === "A" ? "added_or_replaced_test" : "modified_existing_test",
      });
      continue;
    }

    out.push({
      path: rel,
      kind: "mutate",
      detail: `sensitive_status_${status || "M"}`,
    });
  }
  return out;
}

function isSensitive(rel: string): boolean {
  return TEST_OR_BUILD_PATTERNS.some((re) => re.test(rel));
}

function authorized(rel: string, allow: string[] | undefined, contract: GoalContract): boolean {
  const fromContract = [
    ...(allow ?? []),
    ...contract.scope.filter((s) => s.startsWith("authorize:")).map((s) => s.slice("authorize:".length)),
  ];
  return fromContract.some((a) => rel === a || rel.startsWith(a.endsWith("/") ? a : `${a}/`));
}

function defaultCommands(workspace: string): Array<{ id: string; argv: string[]; cwd?: string }> {
  const pkgPath = join(workspace, "package.json");
  const orchPkg = join(workspace, "orchestrator", "package.json");
  if (existsSync(orchPkg)) {
    return [
      { id: "build", argv: ["npm", "run", "build"], cwd: join(workspace, "orchestrator") },
      { id: "test:unit", argv: ["npm", "run", "test:unit"], cwd: join(workspace, "orchestrator") },
    ];
  }
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      scripts?: Record<string, string>;
    };
    const cmds: Array<{ id: string; argv: string[]; cwd?: string }> = [];
    if (pkg.scripts?.build) cmds.push({ id: "build", argv: ["npm", "run", "build"], cwd: workspace });
    if (pkg.scripts?.["test:unit"]) {
      cmds.push({ id: "test:unit", argv: ["npm", "run", "test:unit"], cwd: workspace });
    } else if (pkg.scripts?.test) {
      cmds.push({ id: "test", argv: ["npm", "test"], cwd: workspace });
    }
    return cmds;
  }
  return [{ id: "true", argv: ["true"], cwd: workspace }];
}

export async function runEvidenceValidator(
  opts: EvidenceValidatorOptions,
): Promise<EvidenceValidatorResult> {
  const runner = opts.runner ?? defaultExecutionRunner;
  const workspace = resolve(opts.workspace_root);
  const reasons: string[] = [];
  const sensitive_diff_blocked: string[] = [];
  const evaluated_at = new Date().toISOString();
  const limitations = [
    "Validator runs outside agent session via ExecutionRunner",
    "TRUE_FULL_PASS requires mandatory criteria PASS + commands exit 0 + no unauthorized sensitive diffs",
    "M18: mutate/delete/skip of existing tests without Goal Contract authorize: is BLOCKED",
    "V2-QUAL-01: require_independent_review blocks TRUE_FULL_PASS/VERIFIED_PASS without IndependentReviewGate PASS",
    "V2-QUAL-02: require_mutation_gate blocks TRUE_FULL_PASS when mutation score < threshold or WEAK_TESTS",
  ];

  let test_adulterations: TestAdulteration[] = [];

  // V2-QUAL-01 — independent review before verified pass
  if (contractRequiresIndependentReview(opts.goal_contract)) {
    const gate = opts.independent_review_gate;
    const filter = {
      work_id: opts.goal_contract.work_id,
      goal_contract_id: opts.goal_contract.goal_contract_id,
    };
    if (!gate) {
      reasons.push("missing_independent_review_gate");
      reasons.push("missing_valid_independent_review:TRUE_FULL_PASS");
      reasons.push("missing_valid_independent_review:VERIFIED_PASS");
    } else {
      gate.bindContract(opts.goal_contract);
      const full = gate.evaluateForPass("TRUE_FULL_PASS", filter);
      const verified = gate.evaluateForPass("VERIFIED_PASS", filter);
      if (!full.allowed) reasons.push(...full.reasons);
      if (!verified.allowed) {
        for (const r of verified.reasons) {
          if (!reasons.includes(r)) reasons.push(r);
        }
      }
    }
  }

  // V2-QUAL-02 — selective mutation gate before TRUE_FULL_PASS
  if (contractRequiresMutationGate(opts.goal_contract)) {
    const threshold =
      opts.mutation_score_threshold ?? contractMutationThreshold(opts.goal_contract);
    const gate = evaluateMutationGate({
      required: true,
      threshold,
      battery: opts.mutation_battery ?? null,
      score: opts.mutation_battery?.score,
    });
    if (!gate.allowed) {
      for (const r of gate.reasons) {
        if (!reasons.includes(r)) reasons.push(r);
      }
      reasons.push("mutation_gate_blocked:TRUE_FULL_PASS");
    }
  }

  if (!opts.skip_diff_gate) {
    const changedEntries = listChangedNameStatus(workspace, runner);
    for (const { path: rel } of changedEntries) {
      if (isSensitive(rel) && !authorized(rel, opts.authorized_sensitive_paths, opts.goal_contract)) {
        sensitive_diff_blocked.push(rel);
      }
    }
    test_adulterations = classifyTestAdulterations(changedEntries, {
      workspace,
      runner,
      isAuthorized: (rel) => authorized(rel, opts.authorized_sensitive_paths, opts.goal_contract),
    });
    if (sensitive_diff_blocked.length > 0) {
      reasons.push(`unauthorized_sensitive_diff:${sensitive_diff_blocked.join(",")}`);
    }
    for (const a of test_adulterations) {
      const tag = `test_adulteration_${a.kind}:${a.path}`;
      if (!reasons.includes(tag)) reasons.push(tag);
    }
  }

  const commands = opts.commands ?? defaultCommands(workspace);
  const command_results: EvidenceValidatorResult["command_results"] = [];

  for (const cmd of commands) {
    const cwd = cmd.cwd ? resolve(cmd.cwd) : workspace;
    const result = await runner.run({
      argv: cmd.argv,
      cwd,
      workspace_root: workspace,
      timeout_ms: opts.timeout_ms ?? 300_000,
      env_extra_allowlist: ["npm_config_cache", "npm_config_user_agent", "NODE_OPTIONS"],
    });
    command_results.push({
      id: cmd.id,
      argv: cmd.argv,
      exit_code: result.exit_code,
      status: result.status,
      duration_ms: result.duration_ms,
    });
    if (result.status !== "ok" || result.exit_code !== 0) {
      reasons.push(`command_failed:${cmd.id}:${result.code}`);
    }
  }

  // Mark criteria PASS only when validation commands succeeded and no sensitive block.
  const contract: GoalContract = {
    ...opts.goal_contract,
    criteria: opts.goal_contract.criteria.map((c) => {
      if (!c.mandatory) return c;
      if (reasons.length === 0) {
        return {
          ...c,
          state: "PASS" as const,
          evidence_ids: c.evidence_ids.length ? c.evidence_ids : [`ev-validator-${c.id}`],
          updated_at: evaluated_at,
        };
      }
      if (sensitive_diff_blocked.length > 0) {
        return {
          ...c,
          state: "BLOCKED" as const,
          updated_at: evaluated_at,
        };
      }
      return {
        ...c,
        state: "NOT_PASS" as const,
        updated_at: evaluated_at,
      };
    }),
  };

  const evalPass = evaluateTrueFullPass(contract);
  if (!evalPass.eligible) {
    for (const r of evalPass.reasons) {
      if (!reasons.includes(r)) reasons.push(r);
    }
  }

  let status: EvidenceValidatorResult["status"] = "NOT_PASS";
  let code = "NOT_PASS";
  if (sensitive_diff_blocked.length > 0) {
    status = "BLOCKED";
    code = "SENSITIVE_DIFF_UNAUTHORIZED";
  } else if (evalPass.eligible && reasons.length === 0) {
    status = "TRUE_FULL_PASS";
    code = "TRUE_FULL_PASS";
  } else if (reasons.some((r) => r.startsWith("command_failed"))) {
    status = "NOT_PASS";
    code = "COMMANDS_FAILED";
  }

  return {
    kind: "EvidenceValidatorResult",
    status,
    code,
    reasons,
    sensitive_diff_blocked,
    test_adulterations,
    command_results,
    evaluated_at,
    limitations,
  };
}

export { isSensitive as isSensitivePathForValidator, listChangedFiles };
