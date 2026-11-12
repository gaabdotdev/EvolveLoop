/**
 * Coordinator service lifecycle FSM with tested transitions.
 */

export type ServiceLifecycleState =
  | "STOPPED"
  | "STARTING"
  | "RUNNING"
  | "DEGRADED"
  | "STOPPING"
  | "CRASHED"
  | "RECOVERING";

const TRANSITIONS: Record<ServiceLifecycleState, ServiceLifecycleState[]> = {
  STOPPED: ["STARTING"],
  STARTING: ["RUNNING", "CRASHED", "STOPPED"],
  RUNNING: ["DEGRADED", "STOPPING", "CRASHED"],
  DEGRADED: ["RUNNING", "STOPPING", "CRASHED", "RECOVERING"],
  STOPPING: ["STOPPED", "CRASHED"],
  CRASHED: ["RECOVERING", "STOPPED"],
  RECOVERING: ["RUNNING", "DEGRADED", "CRASHED", "STOPPED"],
};

export class LifecycleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LifecycleError";
  }
}

export class ServiceLifecycle {
  private state: ServiceLifecycleState = "STOPPED";
  private generation = 0;

  getState(): ServiceLifecycleState {
    return this.state;
  }

  getGeneration(): number {
    return this.generation;
  }

  canTransition(to: ServiceLifecycleState): boolean {
    return TRANSITIONS[this.state].includes(to);
  }

  transition(to: ServiceLifecycleState, reason?: string): ServiceLifecycleState {
    if (!this.canTransition(to)) {
      throw new LifecycleError(
        "INVALID_TRANSITION",
        `${this.state} -> ${to}${reason ? ` (${reason})` : ""}`,
      );
    }
    if (to === "STARTING") this.generation += 1;
    this.state = to;
    return this.state;
  }

  /** Load durable state after restart — only RECOVERING or STOPPED/CRASHED entry. */
  restore(fromDisk: ServiceLifecycleState): ServiceLifecycleState {
    if (fromDisk === "RUNNING" || fromDisk === "DEGRADED" || fromDisk === "STARTING") {
      this.state = "RECOVERING";
      return this.state;
    }
    this.state = fromDisk;
    return this.state;
  }
}

export function allowedTransitions(): typeof TRANSITIONS {
  return TRANSITIONS;
}
