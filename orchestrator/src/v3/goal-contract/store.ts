/**
 * Filesystem Goal Contract store — versioned JSON, never silently mutates prior versions.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  AcceptanceCriterion,
  CriterionState,
  GoalContract,
  GoalContractCreateInput,
} from "./types.js";
import { evaluateTrueFullPass } from "./types.js";

export class GoalContractError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoalContractError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

export class GoalContractStore {
  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
  }

  private dirFor(id: string): string {
    return join(this.rootDir, id);
  }

  private pathFor(id: string, version: number): string {
    return join(this.dirFor(id), `v${version}.json`);
  }

  private latestPointer(id: string): string {
    return join(this.dirFor(id), "LATEST");
  }

  create(input: GoalContractCreateInput): GoalContract {
    const dir = this.dirFor(input.goal_contract_id);
    if (existsSync(dir) && existsSync(this.latestPointer(input.goal_contract_id))) {
      throw new GoalContractError(
        "ALREADY_EXISTS",
        `goal contract '${input.goal_contract_id}' already exists; use revise()`,
      );
    }
    const ts = nowIso();
    const criteria: AcceptanceCriterion[] = input.criteria.map((c) => ({
      ...c,
      state: c.state ?? "NOT_STARTED",
      evidence_ids: [],
      updated_at: ts,
    }));
    const contract: GoalContract = {
      kind: "GoalContract",
      goal_contract_id: input.goal_contract_id,
      version: 1,
      created_at: ts,
      updated_at: ts,
      objective: input.objective,
      scope: input.scope ?? [],
      out_of_scope: input.out_of_scope ?? [],
      functional_requirements: input.functional_requirements ?? [],
      non_functional_requirements: input.non_functional_requirements ?? [],
      constraints: input.constraints ?? [],
      dependencies: input.dependencies ?? [],
      risks: input.risks ?? [],
      criteria,
      work_id: input.work_id,
      require_independent_review: input.require_independent_review,
      require_mutation_gate: input.require_mutation_gate,
      mutation_score_threshold: input.mutation_score_threshold,
    };
    this.writeVersion(contract);
    return contract;
  }

  /**
   * Creates a new version. Does not overwrite previous version files.
   */
  revise(
    id: string,
    patch: Partial<
      Omit<GoalContract, "kind" | "goal_contract_id" | "version" | "created_at" | "supersedes_version">
    >,
  ): GoalContract {
    const current = this.loadLatest(id);
    const ts = nowIso();
    const next: GoalContract = {
      ...current,
      ...patch,
      kind: "GoalContract",
      goal_contract_id: id,
      version: current.version + 1,
      created_at: current.created_at,
      updated_at: ts,
      supersedes_version: current.version,
      criteria: patch.criteria ?? current.criteria,
    };
    this.writeVersion(next);
    return next;
  }

  loadLatest(id: string): GoalContract {
    const pointer = this.latestPointer(id);
    if (!existsSync(pointer)) {
      throw new GoalContractError("NOT_FOUND", `goal contract '${id}' not found`);
    }
    const version = parseInt(readFileSync(pointer, "utf-8").trim(), 10);
    if (!Number.isFinite(version)) {
      throw new GoalContractError("CORRUPT_POINTER", `invalid LATEST for '${id}'`);
    }
    return this.loadVersion(id, version);
  }

  loadVersion(id: string, version: number): GoalContract {
    const path = this.pathFor(id, version);
    if (!existsSync(path)) {
      throw new GoalContractError("NOT_FOUND", `goal contract '${id}' v${version} not found`);
    }
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as GoalContract;
    if (parsed.kind !== "GoalContract") {
      throw new GoalContractError("INVALID", `not a GoalContract at ${path}`);
    }
    return parsed;
  }

  updateCriterionState(
    id: string,
    criterionId: string,
    state: CriterionState,
    evidenceIds: string[] = [],
  ): GoalContract {
    const current = this.loadLatest(id);
    const criteria = current.criteria.map((c) => {
      if (c.id !== criterionId) return c;
      return {
        ...c,
        state,
        evidence_ids: evidenceIds.length > 0 ? evidenceIds : c.evidence_ids,
        updated_at: nowIso(),
      };
    });
    if (!criteria.some((c) => c.id === criterionId)) {
      throw new GoalContractError("CRITERION_NOT_FOUND", criterionId);
    }
    return this.revise(id, { criteria });
  }

  /**
   * Deterministic evaluator — never accepts free-text "success" claims.
   */
  evaluate(id: string): ReturnType<typeof evaluateTrueFullPass> & { contract: GoalContract } {
    const contract = this.loadLatest(id);
    return { contract, ...evaluateTrueFullPass(contract) };
  }

  private writeVersion(contract: GoalContract): void {
    const path = this.pathFor(contract.goal_contract_id, contract.version);
    if (existsSync(path)) {
      throw new GoalContractError(
        "VERSION_EXISTS",
        `refusing overwrite of ${contract.goal_contract_id} v${contract.version}`,
      );
    }
    atomicWrite(path, JSON.stringify(contract, null, 2));
    atomicWrite(this.latestPointer(contract.goal_contract_id), String(contract.version));
  }
}
