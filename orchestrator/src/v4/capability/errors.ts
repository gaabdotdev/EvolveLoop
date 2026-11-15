/**
 * Typed failures for the M08 Capability Intelligence engine.
 * Codes are stable for tests. Never used as proof of quality.
 */

export class CapabilityError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly path?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class CapabilityValidationError extends CapabilityError {
  constructor(code: string, message: string, path?: string) {
    super(code, message, path);
  }
}

export class CapabilityIngestError extends CapabilityError {
  constructor(code: string, message: string, path?: string) {
    super(code, message, path);
  }
}

export class ScoreRoutingForbidden extends CapabilityError {
  constructor(autonomy: string) {
    super(
      "SCORE_ROUTING_FORBIDDEN",
      `capability scores must not prefer an executor for ${autonomy} work while methodology is not ACCEPTED (ADR-V4-0010)`,
    );
  }
}
