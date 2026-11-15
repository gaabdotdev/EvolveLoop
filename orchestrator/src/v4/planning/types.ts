/**
 * M07-owned planning types on top of frozen Task / GoalContract / Work.
 * Additive only: no contract schema changes (CONTRACT-FREEZE).
 */

import type {
  ActorRef,
  CapabilityProfilePort,
  EventLedgerPort,
  GoalContract,
  IsoTimestamp,
  Task,
  TaskKind,
  Work,
  WorkEvent,
} from "../contracts/index.js";
import type { CommandResult, TaskPlanInput } from "../work/index.js";
import type { PlanTriggerKind, RemainingCostRecord } from "./payloads.js";

export type Clock = () => IsoTimestamp;

export type PlanningOk<T> = { status: "OK" } & T;
export type PlanningRejected = { status: "REJECTED"; code: string; message: string };
export type PlanningResult<T> = PlanningOk<T> | PlanningRejected;

/**
 * M01 command surface used to accept a proposal into Work.
 * Duck-typed so tests inject `GoalWorkEngine` without M07 rewriting work/.
 */
export interface PlanningWorkCommands {
  getWork(work_id: string): Promise<Work | undefined>;
  getGoalContract(goal_contract_id: string, version: number): Promise<GoalContract | undefined>;
  listTasks(work_id: string): Promise<Task[]>;
  planTasks(work_id: string, actor: ActorRef, plans: TaskPlanInput[]): Promise<CommandResult<{ tasks: Task[] }>>;
  changeTaskState(
    work_id: string,
    actor: ActorRef,
    input: { task_id: string; to: Task["state"]; progress_status?: Task["progress_status"] },
  ): Promise<CommandResult<{ task: Task }>>;
}

export interface PlanningDeps {
  ledger: EventLedgerPort;
  work: PlanningWorkCommands;
  profiles?: CapabilityProfilePort;
  clock?: Clock;
}

export interface ReplanTrigger {
  kind: PlanTriggerKind;
  justification: string;
  evidence_ids?: string[];
  reported_by?: ActorRef;
  failed_task_ids?: string[];
  supersede_task_ids?: string[];
  inspect_executor_ids?: string[];
}

export interface ProposeOptions {
  trigger?: ReplanTrigger;
  tasks?: TaskPlanInput[];
  /** Forbidden: M07 must not request autonomy (D06). */
  requested_autonomy?: unknown;
  /** Forbidden: capability scores must not drive routing (ADR-V4-0010). */
  ranked_executor_ids?: string[];
  prefer_executor_id?: string;
  inspect_executor_ids?: string[];
}

export interface ProposedTask {
  task_id: string;
  title: string;
  task_kind: TaskKind;
  depends_on: string[];
  criterion_refs: string[];
  expected_result: string;
  replaces_task_id?: string;
}

export interface PlanAnalysis {
  critical_path_task_ids: string[];
  independent_task_ids: string[];
  risks: string[];
  remaining_cost: RemainingCostRecord;
  blocked_task_ids: string[];
  failed_task_ids: string[];
}

export interface PlanProposal {
  work_id: string;
  goal_contract_id: string;
  goal_contract_version: number;
  plan_version: number;
  from_plan_version: number;
  trigger: PlanTriggerKind;
  justification: string;
  proposed_tasks: ProposedTask[];
  preserve_task_ids: string[];
  obsolete_task_ids: string[];
  interrupt_task_ids: string[];
  analysis: PlanAnalysis;
  evidence_ids: string[];
  evidence_from_executor: boolean;
  profiles_requested: boolean;
  profiles_used_for_routing: false;
  autonomy_requested: false;
  ranked_executor_ids: [];
}

export interface AcceptedPlan {
  proposal: PlanProposal;
  tasks: Task[];
  plan_revised_event: WorkEvent;
  head_seq: number;
  history_mutated: false;
}
