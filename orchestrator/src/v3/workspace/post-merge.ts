/**
 * Real post-integration validation — discovers project commands; never invents PASS.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export interface PostMergeCheck {
  id: string;
  argv: string[];
  required: boolean;
  present: boolean;
  reason?: string;
}

export interface PostMergeResult {
  kind: "PostMergeResult";
  repo: string;
  checks: Array<
    PostMergeCheck & {
      ran: boolean;
      exit_code: number | null;
      stdout_tail: string;
      stderr_tail: string;
      duration_ms: number;
    }
  >;
  overall: "PASS" | "FAIL" | "BLOCKED" | "NO_CHECKS";
  notes: string[];
}

function tail(s: string, n = 2000): string {
  return s.length <= n ? s : s.slice(-n);
}

/**
 * Discover applicable checks from package.json / known markers.
 * Absence is recorded — never treated as PASS.
 */
export function discoverPostMergeChecks(repo: string): PostMergeCheck[] {
  const checks: PostMergeCheck[] = [];
  const pkgPath = join(repo, "package.json");
  if (!existsSync(pkgPath)) {
    return [
      {
        id: "no_package_json",
        argv: [],
        required: false,
        present: false,
        reason: "no_package_json_discovered",
      },
    ];
  }
  let pkg: { scripts?: Record<string, string>; name?: string };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    return [
      {
        id: "package_json_invalid",
        argv: [],
        required: true,
        present: false,
        reason: "package_json_parse_failed",
      },
    ];
  }
  const scripts = pkg.scripts ?? {};
  const node = process.execPath;

  if (scripts.build) {
    checks.push({
      id: "npm_run_build",
      argv: ["npm", "run", "build", "--silent"],
      required: true,
      present: true,
    });
  } else if (existsSync(join(repo, "tsconfig.json"))) {
    checks.push({
      id: "tsc_no_emit",
      argv: ["npx", "--yes", "tsc", "-p", repo, "--noEmit"],
      required: false,
      present: true,
      reason: "no_build_script_fallback_tsc",
    });
  } else {
    checks.push({
      id: "build",
      argv: [],
      required: false,
      present: false,
      reason: "no_build_script",
    });
  }

  if (scripts.test) {
    checks.push({
      id: "npm_run_test",
      argv: ["npm", "run", "test", "--silent"],
      required: true,
      present: true,
    });
  } else if (existsSync(join(repo, "tests")) || existsSync(join(repo, "test"))) {
    checks.push({
      id: "node_test",
      argv: [node, "--test"],
      required: true,
      present: true,
      reason: "no_test_script_using_node_test",
    });
  } else {
    checks.push({
      id: "test",
      argv: [],
      required: false,
      present: false,
      reason: "no_test_script_or_tests_dir",
    });
  }

  if (scripts.typecheck) {
    checks.push({
      id: "npm_run_typecheck",
      argv: ["npm", "run", "typecheck", "--silent"],
      required: true,
      present: true,
    });
  }

  return checks;
}

export function runPostMergeValidation(
  repo: string,
  opts?: { timeout_ms?: number; only?: string[] },
): PostMergeResult {
  const timeout = opts?.timeout_ms ?? 120_000;
  const discovered = discoverPostMergeChecks(repo);
  const notes: string[] = [];
  const results: PostMergeResult["checks"] = [];

  for (const check of discovered) {
    if (opts?.only && !opts.only.includes(check.id)) continue;
    if (!check.present || check.argv.length === 0) {
      results.push({
        ...check,
        ran: false,
        exit_code: null,
        stdout_tail: "",
        stderr_tail: "",
        duration_ms: 0,
      });
      notes.push(`absent:${check.id}:${check.reason ?? "n/a"}`);
      continue;
    }
    const started = Date.now();
    const run = spawnSync(check.argv[0]!, check.argv.slice(1), {
      cwd: repo,
      encoding: "utf-8",
      timeout,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "test",
        CI: "true",
      },
    });
    results.push({
      ...check,
      ran: true,
      exit_code: run.status,
      stdout_tail: tail(run.stdout ?? ""),
      stderr_tail: tail(run.stderr ?? ""),
      duration_ms: Date.now() - started,
    });
  }

  const ranRequired = results.filter((c) => c.required && c.present);
  const failedRequired = ranRequired.filter((c) => c.ran && c.exit_code !== 0);
  const anyRan = results.some((c) => c.ran);

  let overall: PostMergeResult["overall"];
  if (failedRequired.length) overall = "FAIL";
  else if (!anyRan) overall = "NO_CHECKS";
  else if (ranRequired.length === 0) {
    overall = "BLOCKED";
    notes.push("no_required_checks_present_cannot_auto_pass");
  } else overall = "PASS";

  return {
    kind: "PostMergeResult",
    repo,
    checks: results,
    overall,
    notes,
  };
}
