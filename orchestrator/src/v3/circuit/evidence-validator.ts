/**
 * Evidence Validator (V0) — runs build/typecheck/tests OUTSIDE the agent session.
 * Blocks if git diff touches tests/build scripts without Goal Contract authorization.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  defaultExecutionRunner,
  type ExecutionRunner,
  type ExecutionRunnerResult,
} from "../execution-runner/index.js";
import type { GoalContract } from "../goal-contract/types.js";
import { evaluateTrueFullPass } from "../goal-contract/types.js";

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

function listChangedFiles(workspace: string, _runner: ExecutionRunner): string[] {
  const r = spawnSync("git", ["diff", "--name-only", "HEAD"], {
    cwd: workspace,
    encoding: "utf-8",
  });
  if (r.status !== 0) return [];
  return (r.stdout ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
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
  ];

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
