/**
 * M07 test world: compose M01 GoalWorkEngine + M02 FileEventLedger.
 * IsolatedEventBuffer is not used — the Event Ledger is M02.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CapabilityProfile, CapabilityProfilePort, IsoTimestamp } from "../../../src/v4/contracts/index.js";
import { openM02, type M02Runtime } from "../../../src/v4/ledger/index.js";
import { markText, type IntentIngest } from "../../../src/v4/goal/index.js";
import { GoalWorkEngine, InMemoryWorkRepository } from "../../../src/v4/work/index.js";
import { PlanningEngine } from "../../../src/v4/planning/index.js";

export const NOW: IsoTimestamp = "2026-11-15T12:00:00.000Z";
export const HUMAN = { kind: "HUMAN" as const, id: "operator" };
export const EXECUTOR = { kind: "EXECUTOR" as const, id: "executor_worker01" };
export const PLATFORM = { kind: "PLATFORM" as const, id: "v4-m07-planning" };

export function frozenClock(at: IsoTimestamp = NOW): () => IsoTimestamp {
  return () => at;
}

export function intent(over: Partial<IntentIngest> = {}): IntentIngest {
  return {
    objective: markText("Deliver a queryable Work aggregate with proven acceptance", "USER_DIRECT"),
    acceptance_criteria: [
      {
        statement: markText("Work is queryable via WorkRepositoryPort without chat memory", "USER_DIRECT"),
        mandatory: true,
        verification_methods: ["AUTOMATED_TEST"],
        evidence_required: ["test_report"],
      },
      {
        statement: markText("Task graph remains acyclic after replanning", "USER_DIRECT"),
        mandatory: true,
        verification_methods: ["AUTOMATED_TEST"],
        evidence_required: ["unit_test"],
      },
    ],
    actor: HUMAN,
    ...over,
  };
}

export interface M07World {
  root: string;
  m02: M02Runtime;
  engine: GoalWorkEngine;
  planning: PlanningEngine;
  repository: InMemoryWorkRepository;
}

const roots: string[] = [];

export function trackRoot(root: string): string {
  roots.push(root);
  return root;
}

export function cleanupRoots(): void {
  for (const r of roots.splice(0)) {
    rmSync(r, { recursive: true, force: true });
  }
}

export function stubProfiles(calls: { executor_id: string }[]): CapabilityProfilePort {
  return {
    async profilesFor(executor_id, context): Promise<CapabilityProfile[]> {
      calls.push({ executor_id });
      const mk = (id: string, value: number): CapabilityProfile => ({
        kind: "CapabilityProfile",
        schema_version: "1.0.0",
        tenant_id: "local",
        profile_id: `cprof_${id}000001`,
        subject: { executor_id: id, executor_version: "1.0.0" },
        context,
        metrics: [
          {
            metric: "success_rate",
            value,
            unit: "ratio",
            sample_size: 8,
            window: { from: NOW, to: NOW },
            uncertainty: { method: "placeholder", lower: 0, upper: 1 },
            provenance: "OBSERVED",
            source_refs: ["bench_placeholder"],
          },
        ],
        methodology: { id: "cprof-methodology.placeholder.v0", version: "0", status: "PROVISIONAL" },
        status: "PROVISIONAL",
        computed_at: NOW,
        valid_until: NOW,
      });
      return [mk(executor_id, executor_id.endsWith("a") ? 0.9 : 0.1)];
    },
  };
}

export function openWorld(opts?: { profiles?: CapabilityProfilePort }): M07World {
  const root = trackRoot(mkdtempSync(join(tmpdir(), "v4-m07-")));
  const clock = frozenClock();
  const m02 = openM02({ root, clock });
  const repository = new InMemoryWorkRepository();
  const engine = new GoalWorkEngine({ ledger: m02.ledger, repository, clock });
  const planning = new PlanningEngine({
    ledger: m02.ledger,
    work: engine,
    clock,
    profiles: opts?.profiles,
  });
  return { root, m02, engine, planning, repository };
}

export async function seedAcceptedWork(world: M07World, ingest: IntentIngest = intent()): Promise<{
  work_id: string;
  goal_contract_id: string;
}> {
  const ingested = await world.engine.ingest(ingest);
  if (ingested.status !== "OK") throw new Error(`ingest failed: ${ingested.status === "REJECTED" ? ingested.message : ""}`);
  const work_id = ingested.work.work_id;
  const accepted = await world.engine.acceptGoal(work_id, HUMAN);
  if (accepted.status !== "OK") throw new Error(`accept failed: ${accepted.status === "REJECTED" ? accepted.message : ""}`);
  return { work_id, goal_contract_id: ingested.contract.goal_contract_id };
}
