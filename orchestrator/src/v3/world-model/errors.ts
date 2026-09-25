/**
 * Explicit World Model failures — never silent channel mixing.
 */

export class WorldModelError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WorldModelError";
    this.code = code;
  }
}

/** Inference / Belief content must not enter the Observation channel (§184, §187). */
export class ChannelSeparationError extends WorldModelError {
  readonly details: string[];

  constructor(details: string[]) {
    super(
      "CHANNEL_SEPARATION_VIOLATION",
      `Observation/Belief channel separation violated: ${details.join("; ")}`,
    );
    this.name = "ChannelSeparationError";
    this.details = details;
  }
}

export class WorldModelValidationError extends WorldModelError {
  readonly details: string[];

  constructor(kind: "Observation" | "Belief", details: string[]) {
    super(
      "WORLD_MODEL_VALIDATION_FAILED",
      `${kind} invalid: ${details.join("; ")}`,
    );
    this.name = "WorldModelValidationError";
    this.details = details;
  }
}

export class BeliefRevisionError extends WorldModelError {
  constructor(message: string) {
    super("BELIEF_REVISION_INVALID", message);
    this.name = "BeliefRevisionError";
  }
}
