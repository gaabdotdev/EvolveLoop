/**
 * V2-QUAL-02 — Selective Mutation Testing (offline / synthetic).
 * Applies controlled in-memory mutants to critical modules so superficial
 * tests ("coverage theater") that leave mutants alive are rejected as WEAK_TESTS.
 * Integrates with Evidence Validator when Goal Contract require_mutation_gate is set.
 */

import { createHash } from "node:crypto";
import { normalize as pathNormalize } from "node:path";
import type { GoalContract } from "../goal-contract/types.js";

export type MutationOperator = "boundary" | "boolean_flip" | "return_null";

export interface Mutant {
  mutant_id: string;
  operator: MutationOperator;
  source_path: string;
  description: string;
  /** Site label for diagnostics (e.g. "boolean_flip@true#0"). */
  site: string;
  /** Full mutated source (in memory only — never written to disk by this module). */
  mutated_source: string;
}

export interface SelectiveMutatorOptions {
  /**
   * Path prefixes / substrings that are in the selective set.
   * Paths outside this set produce zero mutants.
   * Default: critical orchestrator evaluation / circuit / security / goal-contract.
   */
  selective_paths?: string[];
  /** Operators to apply (default: all three). */
  operators?: MutationOperator[];
  /** Cap mutants per operator to keep batteries bounded (default 8). */
  max_per_operator?: number;
}

/** Default critical modules touched by agent quality gates. */
export const DEFAULT_SELECTIVE_PATHS: readonly string[] = [
  "orchestrator/src/v3/evaluation/",
  "orchestrator/src/v3/circuit/",
  "orchestrator/src/v3/security/",
  "orchestrator/src/v3/goal-contract/",
];

const DEFAULT_OPERATORS: MutationOperator[] = [
  "boundary",
  "boolean_flip",
  "return_null",
];

function normalizePath(p: string): string {
  return pathNormalize(p).replace(/\\/g, "/");
}

function mutantId(
  sourcePath: string,
  operator: MutationOperator,
  site: string,
): string {
  return createHash("sha256")
    .update(`${sourcePath}|${operator}|${site}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Generates synthetic mutants in memory using simple operators.
 * Does not touch the filesystem.
 */
export class SelectiveMutator {
  private readonly selectivePaths: string[];
  private readonly operators: MutationOperator[];
  private readonly maxPerOperator: number;

  constructor(opts?: SelectiveMutatorOptions) {
    this.selectivePaths = (opts?.selective_paths ?? [...DEFAULT_SELECTIVE_PATHS]).map(
      normalizePath,
    );
    this.operators = opts?.operators ?? [...DEFAULT_OPERATORS];
    this.maxPerOperator = opts?.max_per_operator ?? 8;
  }

  /** True when sourcePath is inside the selective critical-module set. */
  isSelective(sourcePath: string): boolean {
    const n = normalizePath(sourcePath);
    return this.selectivePaths.some(
      (prefix) => n === prefix || n.includes(prefix) || n.startsWith(prefix),
    );
  }

  /**
   * Produce in-memory mutants for selective paths only.
   * Non-selective paths → empty list (never mutated).
   */
  generateMutants(source: string, sourcePath: string): Mutant[] {
    if (!this.isSelective(sourcePath)) {
      return [];
    }
    const out: Mutant[] = [];
    for (const op of this.operators) {
      const generated = this.applyOperator(source, sourcePath, op);
      out.push(...generated.slice(0, this.maxPerOperator));
    }
    return out;
  }

  private applyOperator(
    source: string,
    sourcePath: string,
    operator: MutationOperator,
  ): Mutant[] {
    switch (operator) {
      case "boolean_flip":
        return this.flipBooleans(source, sourcePath);
      case "boundary":
        return this.flipBoundaries(source, sourcePath);
      case "return_null":
        return this.returnNull(source, sourcePath);
      default:
        return [];
    }
  }

  private flipBooleans(source: string, sourcePath: string): Mutant[] {
    const mutants: Mutant[] = [];
    // Literal true/false (avoid matching inside identifiers via word boundary)
    const litRe = /\b(true|false)\b/g;
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = litRe.exec(source)) !== null) {
      const from = m[1]!;
      const to = from === "true" ? "false" : "true";
      const site = `boolean_flip@${from}#${idx}`;
      const mutated =
        source.slice(0, m.index) + to + source.slice(m.index + from.length);
      mutants.push({
        mutant_id: mutantId(sourcePath, "boolean_flip", site),
        operator: "boolean_flip",
        source_path: sourcePath,
        description: `flip literal ${from} → ${to}`,
        site,
        mutated_source: mutated,
      });
      idx += 1;
      if (mutants.length >= this.maxPerOperator) break;
    }
    // Relational / equality flips (single occurrence each pass)
    const pairOps: Array<[RegExp, string, string]> = [
      [/(!==)/g, "!==", "==="],
      [/(===)/g, "===", "!=="],
      [/(\&\&)/g, "&&", "||"],
      [/(\|\|)/g, "||", "&&"],
    ];
    for (const [re, from, to] of pairOps) {
      if (mutants.length >= this.maxPerOperator) break;
      re.lastIndex = 0;
      const hit = re.exec(source);
      if (!hit || hit.index === undefined) continue;
      // Skip === if we already flipped from !== at same index pattern collision — still ok as synthetic
      const site = `boolean_flip@op:${from}#${hit.index}`;
      const mutated =
        source.slice(0, hit.index) + to + source.slice(hit.index + from.length);
      if (mutated === source) continue;
      mutants.push({
        mutant_id: mutantId(sourcePath, "boolean_flip", site),
        operator: "boolean_flip",
        source_path: sourcePath,
        description: `flip operator ${from} → ${to}`,
        site,
        mutated_source: mutated,
      });
    }
    return mutants;
  }

  private flipBoundaries(source: string, sourcePath: string): Mutant[] {
    const mutants: Mutant[] = [];
    // Order matters: check two-char ops first via explicit patterns
    const replacements: Array<{ from: string; to: string; label: string }> = [
      { from: "<=", to: "<", label: "<=" },
      { from: ">=", to: ">", label: ">=" },
      { from: "<", to: "<=", label: "<" },
      { from: ">", to: ">=", label: ">" },
    ];
    for (const { from, to, label } of replacements) {
      if (mutants.length >= this.maxPerOperator) break;
      let searchFrom = 0;
      while (mutants.length < this.maxPerOperator) {
        const at = source.indexOf(from, searchFrom);
        if (at < 0) break;
        // Avoid matching the first char of <= / >= when replacing < or >
        if (from.length === 1) {
          const next = source[at + 1];
          if (next === "=") {
            searchFrom = at + 1;
            continue;
          }
        }
        const site = `boundary@${label}#${at}`;
        const mutated =
          source.slice(0, at) + to + source.slice(at + from.length);
        mutants.push({
          mutant_id: mutantId(sourcePath, "boundary", site),
          operator: "boundary",
          source_path: sourcePath,
          description: `boundary ${from} → ${to}`,
          site,
          mutated_source: mutated,
        });
        searchFrom = at + from.length;
        break; // one site per from→to pair keeps battery bounded and deterministic
      }
    }
    // Off-by-one: n + 1 → n / n - 1 → n (first occurrence)
    const offByOne = /(\b\w+\s*)([+-])(\s*1\b)/;
    const ob = offByOne.exec(source);
    if (ob && mutants.length < this.maxPerOperator) {
      const site = `boundary@off_by_one#${ob.index}`;
      // Replace "+ 1" / "- 1" with "+ 0" / "- 0"
      const safer =
        source.slice(0, ob.index) +
        `${ob[1]}${ob[2]} 0` +
        source.slice(ob.index + ob[0].length);
      mutants.push({
        mutant_id: mutantId(sourcePath, "boundary", site),
        operator: "boundary",
        source_path: sourcePath,
        description: `off-by-one ${ob[2]}1 → ${ob[2]}0`,
        site,
        mutated_source: safer,
      });
    }
    return mutants;
  }

  private returnNull(source: string, sourcePath: string): Mutant[] {
    const mutants: Mutant[] = [];
    // return <expr>;  — replace expression with null (skip already-null / void)
    const re = /\breturn\s+([^;\n]+)(;?)/g;
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = re.exec(source)) !== null) {
      const expr = m[1]!.trim();
      if (expr === "null" || expr === "undefined" || expr.startsWith("//")) {
        continue;
      }
      const site = `return_null#${idx}@${m.index}`;
      const mutated =
        source.slice(0, m.index) +
        `return null${m[2] ?? ""}` +
        source.slice(m.index + m[0].length);
      mutants.push({
        mutant_id: mutantId(sourcePath, "return_null", site),
        operator: "return_null",
        source_path: sourcePath,
        description: `return ${expr} → return null`,
        site,
        mutated_source: mutated,
      });
      idx += 1;
      if (mutants.length >= this.maxPerOperator) break;
    }
    return mutants;
  }
}

export type MutationTestRunner = (input: {
  sourcePath: string;
  source: string;
  /** null when running the unmutated baseline (optional). */
  mutant: Mutant | null;
}) => Promise<{ passed: boolean }> | { passed: boolean };

export type MutationBatteryStatus =
  | "PASS"
  | "WEAK_TESTS"
  | "SKIPPED_NOT_SELECTIVE"
  | "NO_MUTANTS";

export interface MutationBatteryResult {
  kind: "MutationBatteryResult";
  status: MutationBatteryStatus;
  code: MutationBatteryStatus | "WEAK_TESTS";
  score: number;
  threshold: number;
  killed: number;
  total: number;
  survivors: Array<{
    mutant_id: string;
    operator: MutationOperator;
    description: string;
    site: string;
  }>;
  mutants_generated: number;
  source_path: string;
  selective: boolean;
  reasons: string[];
}

export interface MutationBatteryOptions {
  sourcePath: string;
  source: string;
  /** Mockable test runner — receives mutated source in memory. */
  testRunner: MutationTestRunner;
  mutator?: SelectiveMutator;
  /** Minimum kill ratio (killed/total). Default 1.0 (all mutants must die). */
  threshold?: number;
}

/**
 * Run mutation battery. Surviving mutants (tests still pass) → WEAK_TESTS.
 * Non-selective paths → SKIPPED_NOT_SELECTIVE with score 1 (not scored as weak).
 */
export async function runMutationBattery(
  opts: MutationBatteryOptions,
): Promise<MutationBatteryResult> {
  const mutator = opts.mutator ?? new SelectiveMutator();
  const threshold = opts.threshold ?? 1;
  const selective = mutator.isSelective(opts.sourcePath);
  const reasons: string[] = [];

  if (!selective) {
    return {
      kind: "MutationBatteryResult",
      status: "SKIPPED_NOT_SELECTIVE",
      code: "SKIPPED_NOT_SELECTIVE",
      score: 1,
      threshold,
      killed: 0,
      total: 0,
      survivors: [],
      mutants_generated: 0,
      source_path: opts.sourcePath,
      selective: false,
      reasons: ["not_in_selective_set"],
    };
  }

  const mutants = mutator.generateMutants(opts.source, opts.sourcePath);
  if (mutants.length === 0) {
    return {
      kind: "MutationBatteryResult",
      status: "NO_MUTANTS",
      code: "NO_MUTANTS",
      score: 1,
      threshold,
      killed: 0,
      total: 0,
      survivors: [],
      mutants_generated: 0,
      source_path: opts.sourcePath,
      selective: true,
      reasons: ["no_applicable_mutants"],
    };
  }

  const survivors: MutationBatteryResult["survivors"] = [];
  let killed = 0;

  for (const mutant of mutants) {
    const result = await opts.testRunner({
      sourcePath: opts.sourcePath,
      source: mutant.mutated_source,
      mutant,
    });
    if (result.passed) {
      survivors.push({
        mutant_id: mutant.mutant_id,
        operator: mutant.operator,
        description: mutant.description,
        site: mutant.site,
      });
    } else {
      killed += 1;
    }
  }

  const total = mutants.length;
  const score = total === 0 ? 1 : killed / total;

  if (survivors.length > 0 || score < threshold) {
    reasons.push("WEAK_TESTS");
    reasons.push(`mutation_score_below_threshold:${score}<${threshold}`);
    for (const s of survivors) {
      reasons.push(`survivor:${s.mutant_id}:${s.operator}`);
    }
    return {
      kind: "MutationBatteryResult",
      status: "WEAK_TESTS",
      code: "WEAK_TESTS",
      score,
      threshold,
      killed,
      total,
      survivors,
      mutants_generated: total,
      source_path: opts.sourcePath,
      selective: true,
      reasons,
    };
  }

  return {
    kind: "MutationBatteryResult",
    status: "PASS",
    code: "PASS",
    score,
    threshold,
    killed,
    total,
    survivors: [],
    mutants_generated: total,
    source_path: opts.sourcePath,
    selective: true,
    reasons: [],
  };
}

/** Read require_mutation_gate from a Goal Contract (default false). */
export function contractRequiresMutationGate(contract: GoalContract): boolean {
  return contract.require_mutation_gate === true;
}

/** Default kill-ratio threshold when contract omits mutation_score_threshold. */
export const DEFAULT_MUTATION_SCORE_THRESHOLD = 1;

export function contractMutationThreshold(contract: GoalContract): number {
  const t = contract.mutation_score_threshold;
  if (typeof t === "number" && Number.isFinite(t) && t >= 0 && t <= 1) {
    return t;
  }
  return DEFAULT_MUTATION_SCORE_THRESHOLD;
}

export interface MutationGateEvaluation {
  allowed: boolean;
  reasons: string[];
  score?: number;
  threshold: number;
}

/**
 * Evidence / verified-pass gate: when required, score must meet threshold
 * and battery must not be WEAK_TESTS.
 */
export function evaluateMutationGate(input: {
  required: boolean;
  threshold?: number;
  /** Precomputed battery result (preferred). */
  battery?: MutationBatteryResult | null;
  /** Raw score when battery object is not passed. */
  score?: number;
}): MutationGateEvaluation {
  const threshold = input.threshold ?? DEFAULT_MUTATION_SCORE_THRESHOLD;
  if (!input.required) {
    return { allowed: true, reasons: [], threshold };
  }

  const reasons: string[] = [];
  const battery = input.battery;
  let score = input.score;

  if (battery) {
    score = battery.score;
    if (battery.status === "WEAK_TESTS" || battery.code === "WEAK_TESTS") {
      reasons.push("WEAK_TESTS");
      reasons.push("mutation_gate_blocked:WEAK_TESTS");
    }
    if (battery.survivors.length > 0) {
      reasons.push(`mutation_survivors:${battery.survivors.length}`);
    }
  }

  if (score === undefined || score === null || Number.isNaN(score)) {
    reasons.push("missing_mutation_battery");
    reasons.push("mutation_gate_blocked:missing_score");
    return { allowed: false, reasons, threshold };
  }

  if (score < threshold) {
    reasons.push(`mutation_score_below_threshold:${score}<${threshold}`);
    reasons.push("mutation_gate_blocked:score");
  }

  // Deduplicate
  const uniq = [...new Set(reasons)];
  return {
    allowed: uniq.length === 0,
    reasons: uniq,
    score,
    threshold,
  };
}
