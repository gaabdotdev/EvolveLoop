/**
 * V2-QUAL-02 — Selective Mutation Testing + Evidence Validator hook.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  SelectiveMutator,
  runMutationBattery,
  evaluateMutationGate,
  contractRequiresMutationGate,
  DEFAULT_SELECTIVE_PATHS,
  evaluateVerifiedTrueFullPass,
  EvidenceStore,
} from "../../src/v3/evaluation/index.js";
import type { MutationBatteryResult, Mutant } from "../../src/v3/evaluation/index.js";
import { GoalContractStore } from "../../src/v3/goal-contract/index.js";
import type { GoalContract } from "../../src/v3/goal-contract/types.js";
import { runEvidenceValidator } from "../../src/v3/circuit/evidence-validator.js";
import { EngineeringWorkspace } from "../../src/v3/engineering/index.js";

/** Tiny synthetic module under selective path — exercises all three operators. */
const CRITICAL_SOURCE = `
export function inRange(n: number, max: number): boolean {
  if (n < 0) return false;
  if (n <= max) return true;
  return false;
}

export function pickFlag(on: boolean): boolean {
  return on === true && on !== false;
}

export function identity(x: number): number {
  return x;
}
`;

const CRITICAL_PATH =
  "orchestrator/src/v3/evaluation/fixtures/synthetic-critical.ts";
const OUTSIDE_PATH = "orchestrator/src/v3/token-economy/unrelated.ts";

/**
 * Strong mockable runner: any mutant must fail (kills all survivors).
 * Uses mutant metadata + source delta — not "teatro de cobertura".
 */
async function strongTestRunner(input: {
  sourcePath: string;
  source: string;
  mutant: Mutant | null;
}): Promise<{ passed: boolean }> {
  if (!input.mutant) return { passed: true };
  // Behavioural assertion: mutated source must differ and operator must be known
  expect(input.source).not.toBe(CRITICAL_SOURCE);
  expect(["boundary", "boolean_flip", "return_null"]).toContain(input.mutant.operator);
  return { passed: false }; // mutant killed
}

/** Superficial runner — always passes (coverage theater). */
async function weakTestRunner(_input: {
  sourcePath: string;
  source: string;
  mutant: Mutant | null;
}): Promise<{ passed: boolean }> {
  return { passed: true };
}

function minimalContract(
  id: string,
  opts?: {
    require_mutation_gate?: boolean;
    mutation_score_threshold?: number;
    work_id?: string;
  },
): GoalContract {
  const ts = "2026-11-21T22:00:00.000Z";
  return {
    kind: "GoalContract",
    goal_contract_id: id,
    version: 1,
    created_at: ts,
    updated_at: ts,
    objective: "qual-02",
    scope: [],
    out_of_scope: [],
    functional_requirements: [],
    non_functional_requirements: [],
    constraints: [],
    dependencies: [],
    risks: [],
    work_id: opts?.work_id ?? `w-${id}`,
    require_mutation_gate: opts?.require_mutation_gate,
    mutation_score_threshold: opts?.mutation_score_threshold,
    criteria: [
      {
        id: "c1",
        description: "done",
        mandatory: true,
        verification: [{ id: "v", kind: "manual", description: "m" }],
        evidence_required: ["review"],
        state: "PASS",
        evidence_ids: ["ev-placeholder"],
        updated_at: ts,
      },
    ],
  };
}

describe("V2-QUAL-02 SelectiveMutator", () => {
  it("generates boundary, boolean_flip, and return_null mutants for selective paths", () => {
    const mutator = new SelectiveMutator({
      selective_paths: ["orchestrator/src/v3/evaluation/"],
    });
    expect(mutator.isSelective(CRITICAL_PATH)).toBe(true);
    const mutants = mutator.generateMutants(CRITICAL_SOURCE, CRITICAL_PATH);
    expect(mutants.length).toBeGreaterThan(0);
    const ops = new Set(mutants.map((m) => m.operator));
    expect(ops.has("boolean_flip")).toBe(true);
    expect(ops.has("boundary")).toBe(true);
    expect(ops.has("return_null")).toBe(true);
    for (const m of mutants) {
      expect(m.mutated_source).not.toBe(CRITICAL_SOURCE);
      expect(m.mutant_id).toMatch(/^[a-f0-9]{16}$/);
    }
  });

  it("does not mutate modules outside the selective set", () => {
    const mutator = new SelectiveMutator({
      selective_paths: [...DEFAULT_SELECTIVE_PATHS],
    });
    expect(mutator.isSelective(OUTSIDE_PATH)).toBe(false);
    const mutants = mutator.generateMutants(CRITICAL_SOURCE, OUTSIDE_PATH);
    expect(mutants).toEqual([]);

    const batteryPromise = runMutationBattery({
      sourcePath: OUTSIDE_PATH,
      source: CRITICAL_SOURCE,
      testRunner: async () => ({ passed: true }),
      mutator,
    });
    return batteryPromise.then((r) => {
      expect(r.status).toBe("SKIPPED_NOT_SELECTIVE");
      expect(r.mutants_generated).toBe(0);
      expect(r.selective).toBe(false);
    });
  });
});

describe("V2-QUAL-02 runMutationBattery", () => {
  it("strong tests kill mutants → PASS", async () => {
    const mutator = new SelectiveMutator({
      selective_paths: ["orchestrator/src/v3/evaluation/"],
    });
    const result = await runMutationBattery({
      sourcePath: CRITICAL_PATH,
      source: CRITICAL_SOURCE,
      mutator,
      threshold: 1,
      testRunner: strongTestRunner,
    });
    expect(result.status).toBe("PASS");
    expect(result.code).toBe("PASS");
    expect(result.survivors).toHaveLength(0);
    expect(result.score).toBe(1);
    expect(result.killed).toBe(result.total);
    expect(result.total).toBeGreaterThan(0);
  });

  it("superficial tests leave mutants alive → WEAK_TESTS reject", async () => {
    const mutator = new SelectiveMutator({
      selective_paths: ["orchestrator/src/v3/evaluation/"],
    });
    const result = await runMutationBattery({
      sourcePath: CRITICAL_PATH,
      source: CRITICAL_SOURCE,
      mutator,
      threshold: 1,
      testRunner: weakTestRunner,
    });
    expect(result.status).toBe("WEAK_TESTS");
    expect(result.code).toBe("WEAK_TESTS");
    expect(result.survivors.length).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
    expect(result.reasons).toContain("WEAK_TESTS");
  });
});

describe("V2-QUAL-02 Evidence Validator + mutation_gate", () => {
  let tmp: string;
  let ws: EngineeringWorkspace;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v2-qual-02-"));
    ws = new EngineeringWorkspace(path.join(tmp, "ws"));
    ws.writeFile("src/a.js", "export const a = 1;\n");
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("contractRequiresMutationGate binds Goal Contract flag", () => {
    expect(contractRequiresMutationGate(minimalContract("off"))).toBe(false);
    expect(
      contractRequiresMutationGate(
        minimalContract("on", { require_mutation_gate: true }),
      ),
    ).toBe(true);
  });

  it("evaluateMutationGate blocks when score < threshold", () => {
    const weak: MutationBatteryResult = {
      kind: "MutationBatteryResult",
      status: "WEAK_TESTS",
      code: "WEAK_TESTS",
      score: 0.25,
      threshold: 1,
      killed: 1,
      total: 4,
      survivors: [
        {
          mutant_id: "abc",
          operator: "boolean_flip",
          description: "flip",
          site: "x",
        },
      ],
      mutants_generated: 4,
      source_path: CRITICAL_PATH,
      selective: true,
      reasons: ["WEAK_TESTS"],
    };
    const blocked = evaluateMutationGate({
      required: true,
      threshold: 1,
      battery: weak,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reasons.some((r) => r.includes("WEAK_TESTS") || r.includes("threshold"))).toBe(
      true,
    );

    const ok = evaluateMutationGate({
      required: true,
      threshold: 1,
      battery: { ...weak, status: "PASS", code: "PASS", score: 1, survivors: [], killed: 4, reasons: [] },
    });
    expect(ok.allowed).toBe(true);
  });

  it("Evidence Validator blocks TRUE_FULL_PASS when mutation_gate required and weak", async () => {
    const contract = minimalContract("gc-mut-weak", {
      require_mutation_gate: true,
      mutation_score_threshold: 1,
      work_id: "w-mut-weak",
    });
    contract.criteria = contract.criteria.map((c) => ({
      ...c,
      state: "PASS" as const,
      evidence_ids: ["ev-ok"],
    }));

    const weakBattery = await runMutationBattery({
      sourcePath: CRITICAL_PATH,
      source: CRITICAL_SOURCE,
      mutator: new SelectiveMutator({
        selective_paths: ["orchestrator/src/v3/evaluation/"],
      }),
      testRunner: async () => ({ passed: true }),
    });
    expect(weakBattery.status).toBe("WEAK_TESTS");

    const blocked = await runEvidenceValidator({
      workspace_root: ws.root,
      goal_contract: contract,
      skip_diff_gate: true,
      commands: [{ id: "true", argv: ["true"], cwd: ws.root }],
      mutation_battery: weakBattery,
    });
    expect(blocked.status).not.toBe("TRUE_FULL_PASS");
    expect(
      blocked.reasons.some(
        (r) => r.includes("mutation") || r.includes("WEAK_TESTS"),
      ),
    ).toBe(true);
  });

  it("Evidence Validator allows TRUE_FULL_PASS when mutation score meets threshold", async () => {
    const contract = minimalContract("gc-mut-ok", {
      require_mutation_gate: true,
      mutation_score_threshold: 1,
      work_id: "w-mut-ok",
    });
    contract.criteria = contract.criteria.map((c) => ({
      ...c,
      state: "PASS" as const,
      evidence_ids: ["ev-ok"],
    }));

    const strongBattery = await runMutationBattery({
      sourcePath: CRITICAL_PATH,
      source: CRITICAL_SOURCE,
      mutator: new SelectiveMutator({
        selective_paths: ["orchestrator/src/v3/evaluation/"],
      }),
      testRunner: strongTestRunner,
    });
    expect(strongBattery.status).toBe("PASS");

    const passed = await runEvidenceValidator({
      workspace_root: ws.root,
      goal_contract: contract,
      skip_diff_gate: true,
      commands: [{ id: "true", argv: ["true"], cwd: ws.root }],
      mutation_battery: strongBattery,
    });
    expect(passed.status).toBe("TRUE_FULL_PASS");
    expect(passed.code).toBe("TRUE_FULL_PASS");
  });

  it("Evidence Validator blocks when mutation_gate required but battery missing", async () => {
    const contract = minimalContract("gc-mut-missing", {
      require_mutation_gate: true,
    });
    contract.criteria = contract.criteria.map((c) => ({
      ...c,
      state: "PASS" as const,
      evidence_ids: ["ev-ok"],
    }));
    const blocked = await runEvidenceValidator({
      workspace_root: ws.root,
      goal_contract: contract,
      skip_diff_gate: true,
      commands: [{ id: "true", argv: ["true"], cwd: ws.root }],
    });
    expect(blocked.status).not.toBe("TRUE_FULL_PASS");
    expect(blocked.reasons.some((r) => r.includes("mutation"))).toBe(true);
  });

  it("GoalContractStore persists require_mutation_gate", () => {
    const root = path.join(tmp, "goals");
    const goals = new GoalContractStore(root);
    goals.create({
      goal_contract_id: "gc-persist",
      objective: "persist",
      require_mutation_gate: true,
      mutation_score_threshold: 0.9,
      criteria: [
        {
          id: "c1",
          description: "d",
          mandatory: true,
          verification: [{ id: "v", kind: "manual", description: "m" }],
          evidence_required: [],
        },
      ],
    });
    const c = goals.loadLatest("gc-persist");
    expect(c.require_mutation_gate).toBe(true);
    expect(c.mutation_score_threshold).toBe(0.9);
  });

  it("evaluateVerifiedTrueFullPass rejects WEAK_TESTS when gate required", () => {
    const evidence = new EvidenceStore(path.join(tmp, "ev"));
    const contract = minimalContract("gc-vp", {
      require_mutation_gate: true,
      work_id: "w-vp",
    });
    // Soften evidence requirements so we only exercise mutation gate
    contract.criteria = [
      {
        ...contract.criteria[0]!,
        evidence_required: [],
        evidence_ids: [],
        state: "PASS",
      },
    ];
    const weak: MutationBatteryResult = {
      kind: "MutationBatteryResult",
      status: "WEAK_TESTS",
      code: "WEAK_TESTS",
      score: 0,
      threshold: 1,
      killed: 0,
      total: 2,
      survivors: [
        {
          mutant_id: "m1",
          operator: "return_null",
          description: "r",
          site: "s",
        },
      ],
      mutants_generated: 2,
      source_path: CRITICAL_PATH,
      selective: true,
      reasons: ["WEAK_TESTS"],
    };
    const v = evaluateVerifiedTrueFullPass(contract, {
      evidence,
      workspace_root: ws.root,
      mutation_battery: weak,
    });
    expect(v.eligible).toBe(false);
    expect(v.adversarial_checks).toContain("reject_weak_or_missing_mutation_gate");
  });
});

describe("V2-QUAL-02 mutator determinism", () => {
  it("same source+path yields stable mutant_ids", () => {
    const a = new SelectiveMutator({
      selective_paths: ["orchestrator/src/v3/evaluation/"],
    });
    const b = new SelectiveMutator({
      selective_paths: ["orchestrator/src/v3/evaluation/"],
    });
    const ma = a.generateMutants(CRITICAL_SOURCE, CRITICAL_PATH);
    const mb = b.generateMutants(CRITICAL_SOURCE, CRITICAL_PATH);
    expect(ma.map((m: Mutant) => m.mutant_id)).toEqual(mb.map((m: Mutant) => m.mutant_id));
  });
});
