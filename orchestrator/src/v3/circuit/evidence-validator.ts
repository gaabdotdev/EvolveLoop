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

/** All git inspection goes through ExecutionRunner (V0-SEC-01 / V0-SEC-06). */
function listChangedFiles(workspace: string, runner: ExecutionRunner): string[] {
  const unstaged = runner.runSync({
    argv: ["git", "diff", "--name-only", "HEAD"],
    cwd: workspace,
    workspace_root: workspace,
    timeout_ms: 30_000,
  });
  const staged = runner.runSync({
    argv: ["git", "diff", "--name-only", "--cached"],
    cwd: workspace,
    workspace_root: workspace,
    timeout_ms: 30_000,
  });
  const files = new Set<string>();
  for (const block of [unstaged, staged]) {
    if (block.status !== "ok" && block.exit_code !== 0) continue;
    for (const line of block.stdout.split("\n")) {
      const rel = line.trim();
      if (rel) files.add(rel);
    }
  }
  return [...files];
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
    "V2-QUAL-01: require_independent_review blocks TRUE_FULL_PASS/VERIFIED_PASS without IndependentReviewGate PASS",
    "V2-QUAL-02: require_mutation_gate blocks TRUE_FULL_PASS when mutation score < threshold or WEAK_TESTS",
  ];

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
    const changed = listChangedFiles(workspace, runner);
    for (const rel of changed) {
      if (isSensitive(rel) && !authorized(rel, opts.authorized_sensitive_paths, opts.goal_contract)) {
        sensitive_diff_blocked.push(rel);
      }
    }
    if (sensitive_diff_blocked.length > 0) {
      reasons.push(`unauthorized_sensitive_diff:${sensitive_diff_blocked.join(",")}`);
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
    command_results,
    evaluated_at,
    limitations,
  };
}

export { isSensitive as isSensitivePathForValidator };
