/**
 * V1-TOK-14 — Deterministic codemods before LLM.
 *
 * Attempts eslint --fix / prettier / ruff / ts-morph-style hooks only when
 * the binary (or runner) exists; otherwise no-op with reason.
 */

import { accessSync, constants as fsConstants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

export type MechanicalFixToolId = "eslint" | "prettier" | "ruff" | "ts_morph";

export interface MechanicalFixHookResult {
  tool: MechanicalFixToolId;
  ran: boolean;
  ok: boolean;
  skipped: boolean;
  reason: string;
  exit_code?: number | null;
  stdout?: string;
  stderr?: string;
  paths: string[];
}

export interface MechanicalFixReport {
  kind: "MechanicalFixReport";
  paths: string[];
  hooks: MechanicalFixHookResult[];
  any_ran: boolean;
  all_ok: boolean;
  /** True when at least one hook mutated / attempted a fix. */
  attempted_fix: boolean;
  tokens_used: 0;
}

export type MechanicalBinaryResolver = (tool: MechanicalFixToolId) => string | null;

export type MechanicalHookRunner = (args: {
  tool: MechanicalFixToolId;
  binary: string;
  paths: string[];
}) => Promise<{
  ok: boolean;
  exit_code?: number | null;
  stdout?: string;
  stderr?: string;
}> | {
  ok: boolean;
  exit_code?: number | null;
  stdout?: string;
  stderr?: string;
};

export interface MechanicalFixOptions {
  /** Override PATH lookup (inject for unit tests). */
  resolveBinary?: MechanicalBinaryResolver;
  /** Override execution (inject for unit tests). */
  runner?: MechanicalHookRunner;
  /** Subset of tools; default all. */
  tools?: MechanicalFixToolId[];
}

const DEFAULT_TOOLS: readonly MechanicalFixToolId[] = [
  "eslint",
  "prettier",
  "ruff",
  "ts_morph",
] as const;

const BINARY_CANDIDATES: Record<MechanicalFixToolId, string[]> = {
  eslint: ["eslint", "node_modules/.bin/eslint"],
  prettier: ["prettier", "node_modules/.bin/prettier"],
  ruff: ["ruff"],
  // ts-morph is a library; treat `tsx`/`ts-node` presence as "can run scripted codemod"
  // or a custom `ts-morph-fix` shim. Without a binary → no-op.
  ts_morph: ["ts-morph-fix", "node_modules/.bin/ts-morph-fix"],
};

/**
 * Resolve an executable on PATH or as a relative workspace bin.
 * Returns null when missing (caller must no-op).
 */
export function resolveMechanicalBinary(
  tool: MechanicalFixToolId,
  cwd: string = process.cwd(),
  pathEnv: string = process.env.PATH ?? "",
): string | null {
  const candidates = BINARY_CANDIDATES[tool] ?? [];
  for (const name of candidates) {
    if (isAbsolute(name) || name.includes("/") || name.includes("\\")) {
      const abs = isAbsolute(name) ? name : join(cwd, name);
      if (isExecutable(abs)) return abs;
      continue;
    }
    for (const dir of pathEnv.split(delimiter)) {
      if (!dir) continue;
      const abs = join(dir, name);
      if (isExecutable(abs)) return abs;
    }
  }
  return null;
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, fsConstants.X_OK);
    return true;
  } catch {
    try {
      accessSync(path, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Gate: run mechanical fixes before any LLM call.
 * Missing binaries → skipped with reason (not a failure).
 */
export async function mechanicalFixBeforeLlm(
  paths: string[],
  options: MechanicalFixOptions = {},
): Promise<MechanicalFixReport> {
  const tools = options.tools ?? [...DEFAULT_TOOLS];
  const resolveBin = options.resolveBinary ?? ((t) => resolveMechanicalBinary(t));
  const hooks: MechanicalFixHookResult[] = [];

  for (const tool of tools) {
    const binary = resolveBin(tool);
    if (!binary) {
      hooks.push({
        tool,
        ran: false,
        ok: true,
        skipped: true,
        reason: `binary_missing:${tool}`,
        paths,
      });
      continue;
    }

    if (!options.runner) {
      hooks.push({
        tool,
        ran: false,
        ok: true,
        skipped: true,
        reason: `binary_found_no_runner:${binary}`,
        paths,
      });
      continue;
    }

    const result = await Promise.resolve(
      options.runner({ tool, binary, paths }),
    );
    hooks.push({
      tool,
      ran: true,
      ok: result.ok,
      skipped: false,
      reason: result.ok ? "fixed_or_clean" : "hook_failed",
      exit_code: result.exit_code ?? null,
      stdout: result.stdout,
      stderr: result.stderr,
      paths,
    });
  }

  const any_ran = hooks.some((h) => h.ran);
  const all_ok = hooks.every((h) => h.ok);
  return {
    kind: "MechanicalFixReport",
    paths: [...paths],
    hooks,
    any_ran,
    all_ok,
    attempted_fix: any_ran,
    tokens_used: 0,
  };
}
