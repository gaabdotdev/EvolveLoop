/**
 * Goal Compiler + Work State command service.
 * Appends M01 events via EventLedgerPort; projections live in InMemoryWorkRepository.
 * Chat/conversation is never the source of Work State (constitution §4.1).
 */

import {
  DEFAULT_TENANT_ID,
  TASK_SCHEMA_VERSION,
  WORK_SCHEMA_VERSION,
  WORK_TRANSITIONS,
  assertConforms,
  isAllowedTransition,
  isValidId,
  validateTaskGraph,
  type ActorRef,
  type Ambiguity,
  type AppendOutcome,
  type EventLedgerPort,
  type GoalContract,
  type IsoTimestamp,
  type ProgressStatus,
  type Task,
  type TaskKind,
  type TaskState,
  type Work,
  type WorkEventDraft,
  type WorkState,
} from "../contracts/index.js";
import { allocateId } from "../goal/ids.js";
import { compileIntent, type ClarifyingQuestion } from "../goal/compiler.js";
import { actorMayVersionGoal, authorizeGoalVersion } from "../goal/versioning.js";
import type { IntentIngest } from "../goal/intent.js";
import { draftM01Event } from "./drafts.js";
import { IsolatedEventBuffer } from "./isolated-buffer.js";
import { allowlistPayload, type M01EventType } from "./payloads.js";
import { executorMaySetTaskState, progressForTaskState, taskTransitionAllowed } from "./progress.js";
import { InMemoryWorkRepository, type WorkSnapshot } from "./repository.js";

export type Clock = () => IsoTimestamp;

export type CommandOk<T> = { status: "OK" } & T;
export type CommandRejected = { status: "REJECTED"; code: string; message: string };
export type CommandResult<T> = CommandOk<T> | CommandRejected;

export interface TaskPlanInput {
  title: string;
  task_kind: TaskKind;
  depends_on?: string[];
  criterion_refs?: string[];
  expected_result: string;
  task_id?: string;
}

export interface GoalWorkEngineOptions {
  ledger: EventLedgerPort;
  repository: InMemoryWorkRepository;
  clock?: Clock;
}

function rejected(code: string, message: string): CommandRejected {
  return { status: "REJECTED", code, message };
}

function initialWorkState(hasBlocking: boolean): WorkState {
  return hasBlocking ? "CLARIFYING" : "CREATED";
}

export class GoalWorkEngine {
  private readonly ledger: EventLedgerPort;
  private readonly repository: InMemoryWorkRepository;
  private readonly clock: Clock;

  constructor(opts: GoalWorkEngineOptions) {
    this.ledger = opts.ledger;
    this.repository = opts.repository;
    this.clock = opts.clock ?? (() => new Date().toISOString());
  }

  repositoryView(): InMemoryWorkRepository {
    return this.repository;
  }

  async getWork(work_id: string): Promise<Work | undefined> {
    return this.repository.getWork(work_id);
  }

  async getGoalContract(goal_contract_id: string, version: number): Promise<GoalContract | undefined> {
    return this.repository.getGoalContract(goal_contract_id, version);
  }

  async listTasks(work_id: string): Promise<Task[]> {
    return this.repository.listTasks(work_id);
  }

  snapshot(work_id: string): WorkSnapshot {
    return this.repository.snapshot(work_id);
  }

  async ingest(intent: IntentIngest): Promise<
    CommandResult<{ work: Work; contract: GoalContract; questions: ClarifyingQuestion[]; head_seq: number }>
  > {
    const actorGate = actorMayVersionGoal(intent.actor);
    if (!actorGate.allowed) return rejected(actorGate.code, actorGate.message);

    const now = this.clock();
    const work_id = allocateId("work");
    const goal_contract_id = allocateId("goal_contract");
    const compiled = compileIntent(intent, {
      work_id,
      goal_contract_id,
      version: 1,
      now,
      actor: intent.actor,
    });
    const blocking = compiled.questions.some((q) => q.blocking);
    const work = makeWork({
      work_id,
      goal_contract_id,
      version: 1,
      state: initialWorkState(blocking),
      now,
    });
    const workCheck = assertConforms(work);
    if (!workCheck.valid) return rejected("STRUCT", workCheck.issues.map((i) => i.message).join("; "));

    const drafts = [
      this.event(work_id, "work.created", intent.actor, now, { work }),
      this.event(work_id, "goal_contract.versioned", intent.actor, now, { goal_contract: compiled.contract }),
    ];
    const appended = await this.commit(work_id, drafts, 0);
    if (appended.status !== "OK") return appended;
    return {
      status: "OK",
      work: (await this.repository.getWork(work_id))!,
      contract: compiled.contract,
      questions: compiled.questions,
      head_seq: appended.head_seq,
    };
  }

  async answerClarifications(
    work_id: string,
    actor: ActorRef,
    answers: Array<{ ambiguity_id: string; resolution: string }>,
    extras?: {
      policy_decision_id?: string;
      acceptance_criteria?: GoalContract["acceptance_criteria"];
      objective?: string;
      autonomy?: GoalContract["execution"]["autonomy"];
    },
  ): Promise<CommandResult<{ contract: GoalContract; questions: ClarifyingQuestion[] }>> {
    const current = await this.currentGoal(work_id);
    if (!current) return rejected("STRUCT", "work or goal contract not found");
    const now = this.clock();
    let ambiguities: Ambiguity[] = current.ambiguities.map((a) => {
      const ans = answers.find((x) => x.ambiguity_id === a.ambiguity_id);
      if (!ans) return { ...a };
      return { ...a, status: "RESOLVED" as const, resolution: ans.resolution, blocking: false };
    });
    const criteria = extras?.acceptance_criteria ?? current.acceptance_criteria;
    if (!criteria.some((c) => c.mandatory)) {
      const idx = ambiguities.findIndex((a) => a.ambiguity_id === "amb_criteria_missing");
      const missing: Ambiguity = {
        ambiguity_id: "amb_criteria_missing",
        question: "What mandatory acceptance criterion must be true for this work to be done?",
        status: "OPEN",
        blocking: true,
      };
      ambiguities = idx >= 0 ? ambiguities.map((a, i) => (i === idx ? { ...a, ...missing } : a)) : [...ambiguities, missing];
    }
    const stillBlocking = ambiguities.some((a) => a.status === "OPEN" && a.blocking);
    const next: GoalContract = {
      ...current,
      version: current.version + 1,
      supersedes_version: current.version,
      status: stillBlocking ? "NEEDS_CLARIFICATION" : "DRAFT",
      created_at: now,
      created_by: actor,
      ambiguities,
      objective: extras?.objective ?? current.objective,
      acceptance_criteria: criteria,
      execution: extras?.autonomy ? { ...current.execution, autonomy: extras.autonomy } : current.execution,
    };

    const gate = authorizeGoalVersion({
      actor,
      previous: current,
      next,
      policy_decision_id: extras?.policy_decision_id,
    });
    if (!gate.allowed) return rejected(gate.code, gate.message);
    const valid = assertConforms(next);
    if (!valid.valid) return rejected("STRUCT", valid.issues.map((i) => i.message).join("; "));

    const head = await this.ledger.head(work_id);
    const drafts = [
      this.event(work_id, "goal_contract.versioned", actor, now, {
        goal_contract: next,
        policy_decision_id: extras?.policy_decision_id,
      }),
    ];
    const appended = await this.commit(work_id, drafts, head);
    if (appended.status !== "OK") return appended;
    const stored = await this.repository.getGoalContract(next.goal_contract_id, next.version);
    return {
      status: "OK",
      contract: stored ?? next,
      questions: next.ambiguities.filter((a) => a.status === "OPEN").map((a) => ({
        ambiguity_id: a.ambiguity_id,
        question: a.question,
        blocking: a.blocking,
      })),
    };
  }

  async acceptGoal(work_id: string, actor: ActorRef): Promise<CommandResult<{ contract: GoalContract }>> {
    const current = await this.currentGoal(work_id);
    if (!current) return rejected("STRUCT", "work or goal contract not found");
    const actorGate = actorMayVersionGoal(actor);
    if (!actorGate.allowed) return rejected(actorGate.code, actorGate.message);
    if (current.ambiguities.some((a) => a.status === "OPEN" && a.blocking)) {
      return rejected("INV-GC-03", "ACCEPTED contract cannot have OPEN blocking ambiguities");
    }
    if (!current.acceptance_criteria.some((c) => c.mandatory)) {
      return rejected("INV-GC-02", "ACCEPTED contract needs at least one mandatory criterion");
    }
    const now = this.clock();
    const work = await this.repository.getWork(work_id);
    if (!work) return rejected("STRUCT", "work not found");
    const drafts: WorkEventDraft[] = [
      this.event(work_id, "goal_contract.accepted", actor, now, {
        goal_contract_id: current.goal_contract_id,
        version: current.version,
      }),
    ];
    if (work.state === "CREATED" || work.state === "CLARIFYING") {
      drafts.push(this.event(work_id, "work.state_changed", actor, now, { from: work.state, to: "PLANNING" }));
    }
    const appended = await this.commit(work_id, drafts, await this.ledger.head(work_id));
    if (appended.status !== "OK") return appended;
    const stored = await this.repository.getGoalContract(current.goal_contract_id, current.version);
    return { status: "OK", contract: stored ?? current };
  }

  async planTasks(work_id: string, actor: ActorRef, plans: TaskPlanInput[]): Promise<CommandResult<{ tasks: Task[] }>> {
    if (actor.kind === "EXECUTOR") return rejected("D15_EXECUTOR_CANNOT_VERSION", "executors cannot author the task graph");
    const work = await this.repository.getWork(work_id);
    const goal = await this.currentGoal(work_id);
    if (!work || !goal) return rejected("STRUCT", "work or goal contract not found");
    if (this.repository.projection(work_id).accepted_version === undefined && goal.status !== "ACCEPTED") {
      return rejected("INV-GC-03", "cannot plan tasks before the Goal Contract is ACCEPTED");
    }
    const now = this.clock();
    const existing = await this.repository.listTasks(work_id);
    const created: Task[] = plans.map((p) => {
      const task_id = p.task_id ?? allocateId("task");
      const depends_on = p.depends_on ?? [];
      const state: TaskState = depends_on.length === 0 ? "READY" : "PENDING";
      return {
        kind: "Task",
        schema_version: TASK_SCHEMA_VERSION,
        tenant_id: DEFAULT_TENANT_ID,
        task_id,
        work_id,
        goal_contract_ref: { id: goal.goal_contract_id, version: goal.version },
        title: p.title,
        task_kind: p.task_kind,
        state,
        progress_status: progressForTaskState(state),
        depends_on,
        criterion_refs: p.criterion_refs ?? [],
        expected_result: p.expected_result,
        execution_ids: [],
        evidence_ids: [],
        plan_version: 1,
        created_at: now,
        updated_at: now,
      };
    });
    for (const t of created) {
      if (!isValidId("task", t.task_id)) return rejected("STRUCT", `invalid task_id ${t.task_id}`);
      const v = assertConforms(t);
      if (!v.valid) return rejected("STRUCT", v.issues.map((i) => i.message).join("; "));
    }
    const graphIssues = validateTaskGraph([...existing, ...created]);
    if (graphIssues.length > 0) {
      return rejected(graphIssues[0]!.code, graphIssues.map((g) => g.message).join("; "));
    }
    const drafts = created.map((task) => this.event(work_id, "task.planned", actor, now, { task }));
    if (work.state === "PLANNING") {
      drafts.push(this.event(work_id, "work.state_changed", actor, now, { from: "PLANNING", to: "READY" }));
    }
    const appended = await this.commit(work_id, drafts, await this.ledger.head(work_id));
    if (appended.status !== "OK") return appended;
    return { status: "OK", tasks: await this.repository.listTasks(work_id) };
  }

  async changeTaskState(
    work_id: string,
    actor: ActorRef,
    input: { task_id: string; to: TaskState; progress_status?: ProgressStatus; evidence_ids?: string[] },
  ): Promise<CommandResult<{ task: Task }>> {
    const tasks = await this.repository.listTasks(work_id);
    const current = tasks.find((t) => t.task_id === input.task_id);
    if (!current) return rejected("STRUCT", "task not found");
    if (!taskTransitionAllowed(current.state, input.to)) {
      return rejected("INV-TASK-STATE", `illegal task transition ${current.state} → ${input.to}`);
    }
    if (!executorMaySetTaskState(actor, input.to)) {
      return rejected("INV-TASK-03", "executors cannot set VERIFIED");
    }
    const progress = progressForTaskState(input.to, input.progress_status);
    if (progress === "CONFIRMED" && input.to !== "VERIFIED" && input.to !== "OBSOLETE") {
      return rejected("INV-TASK-04", "CONFIRMED progress requires VERIFIED (or OBSOLETE after verified)");
    }
    const now = this.clock();
    const drafts = [
      this.event(work_id, "task.state_changed", actor, now, {
        task_id: input.task_id,
        from: current.state,
        to: input.to,
        progress_status: progress,
        evidence_ids: input.evidence_ids,
      }),
    ];
    const appended = await this.commit(work_id, drafts, await this.ledger.head(work_id));
    if (appended.status !== "OK") return appended;
    const updated = (await this.repository.listTasks(work_id)).find((t) => t.task_id === input.task_id);
    if (!updated) return rejected("STRUCT", "task missing after append");
    return { status: "OK", task: updated };
  }

  async changeWorkState(
    work_id: string,
    actor: ActorRef,
    to: WorkState,
    reason?: string,
    outcome?: Work["outcome"],
  ): Promise<CommandResult<{ work: Work }>> {
    const work = await this.repository.getWork(work_id);
    if (!work) return rejected("STRUCT", "work not found");
    if (!isAllowedTransition(WORK_TRANSITIONS, work.state, to)) {
      return rejected("INV-WORK-STATE", `illegal work transition ${work.state} → ${to}`);
    }
    if (to === "COMPLETED" && !outcome && !work.outcome) {
      return rejected("INV-WORK-04", "COMPLETED work must reference a WorkProof");
    }
    if (actor.kind === "EXECUTOR" && (to === "COMPLETED" || to === "CANCELLED")) {
      return rejected("D15_EXECUTOR_CANNOT_VERSION", "executors cannot complete or cancel Work");
    }
    const now = this.clock();
    const drafts = [
      this.event(work_id, "work.state_changed", actor, now, {
        from: work.state,
        to,
        reason,
        outcome: outcome ?? work.outcome,
      }),
    ];
    const appended = await this.commit(work_id, drafts, await this.ledger.head(work_id));
    if (appended.status !== "OK") return appended;
    return { status: "OK", work: (await this.repository.getWork(work_id))! };
  }

  private event(
    work_id: string,
    type: M01EventType,
    actor: ActorRef,
    now: IsoTimestamp,
    payload: Record<string, unknown>,
  ): WorkEventDraft {
    return draftM01Event({
      event_id: allocateId("event"),
      work_id,
      type,
      occurred_at: now,
      actor,
      correlation_id: work_id,
      payload: allowlistPayload(type, payload),
    });
  }

  private async commit(
    work_id: string,
    drafts: WorkEventDraft[],
    expected_head_seq: number,
  ): Promise<CommandResult<{ head_seq: number }> | CommandRejected> {
    const outcome: AppendOutcome = await this.ledger.append(work_id, drafts, { expected_head_seq });
    if (outcome.status === "APPENDED") {
      const issues = this.repository.apply(work_id, outcome.events);
      if (issues.length > 0) {
        return rejected(issues[0]!.code, issues.map((i) => i.message).join("; "));
      }
      return { status: "OK", head_seq: outcome.head_seq };
    }
    if (outcome.status === "DUPLICATE") {
      this.repository.apply(work_id, outcome.events);
      return { status: "OK", head_seq: outcome.head_seq };
    }
    if (outcome.status === "INVALID") {
      return rejected("INV-EVT", outcome.validation.issues.map((i) => i.message).join("; "));
    }
    if (outcome.status === "CONFLICT" || outcome.status === "FENCED") {
      return rejected(outcome.status, outcome.reason);
    }
    return rejected("APPEND_FAILED", "unexpected ledger outcome");
  }

  private async currentGoal(work_id: string): Promise<GoalContract | undefined> {
    const work = await this.repository.getWork(work_id);
    if (!work) return undefined;
    return this.repository.getGoalContract(work.goal_contract_ref.id, work.goal_contract_ref.version);
  }
}

function makeWork(input: {
  work_id: string;
  goal_contract_id: string;
  version: number;
  state: WorkState;
  now: IsoTimestamp;
}): Work {
  return {
    kind: "Work",
    schema_version: WORK_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    work_id: input.work_id,
    owner: "platform",
    goal_contract_ref: { id: input.goal_contract_id, version: input.version },
    state: input.state,
    last_event_seq: 1,
    created_at: input.now,
    updated_at: input.now,
  };
}

export function createIsolatedWorkEngine(clock?: Clock): GoalWorkEngine {
  const c = clock ?? (() => new Date().toISOString());
  return new GoalWorkEngine({
    ledger: new IsolatedEventBuffer(c),
    repository: new InMemoryWorkRepository(),
    clock: c,
  });
}
