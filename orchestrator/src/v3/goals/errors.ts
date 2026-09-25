/**
 * Explicit goal-domain failures — never silent.
 */

export class GoalStoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GoalStoreError";
    this.code = code;
  }
}

/** Silent delete is forbidden (Meta 3 / Goal Lifecycle — goals must not disappear). */
export class SilentDeleteForbiddenError extends GoalStoreError {
  constructor(goalId?: string) {
    super(
      "SILENT_DELETE_FORBIDDEN",
      goalId
        ? `GoalStore refuses silent delete of goal "${goalId}"; use abandon or supersede`
        : "GoalStore refuses silent delete; use abandon or supersede",
    );
    this.name = "SilentDeleteForbiddenError";
  }
}

export class GoalNotFoundError extends GoalStoreError {
  constructor(goalId: string) {
    super("GOAL_NOT_FOUND", `Goal not found: ${goalId}`);
    this.name = "GoalNotFoundError";
  }
}

export class InvalidGoalTransitionError extends GoalStoreError {
  constructor(from: string, to: string) {
    super(
      "INVALID_GOAL_TRANSITION",
      `Invalid GoalLifecycle transition: ${from} → ${to}`,
    );
    this.name = "InvalidGoalTransitionError";
  }
}

export class GoalValidationError extends GoalStoreError {
  readonly details: string[];

  constructor(details: string[]) {
    super("GOAL_VALIDATION_FAILED", `GoalContract invalid: ${details.join("; ")}`);
    this.name = "GoalValidationError";
    this.details = details;
  }
}
