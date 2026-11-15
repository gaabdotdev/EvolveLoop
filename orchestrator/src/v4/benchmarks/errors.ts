/**
 * Typed failures for the M17 baseline harness.
 * Never used as proof of quality or as a routing signal.
 */

export class BaselineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly path?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BaselineValidationError extends BaselineError {
  constructor(code: string, message: string, path?: string) {
    super(code, message, path);
  }
}

export class BaselineScoreRoutingForbidden extends BaselineError {
  constructor(detail: string) {
    super(
      "SCORE_ROUTING_FORBIDDEN",
      `fair-baseline artifacts must not prefer an executor (${detail}) (ADR-V4-0010 / D04)`,
    );
  }
}
