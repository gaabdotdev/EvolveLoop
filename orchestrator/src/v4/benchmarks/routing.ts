/**
 * M17 must not become a back-door ranking API.
 * ADR-V4-0010 / WAVE4-COMMON: no L2/L3 routing by score.
 */

import { BaselineScoreRoutingForbidden } from "./errors.js";
import { BASELINE_MAY_DRIVE_L2_L3_ROUTING } from "./protocol.js";

export function baselineMayDriveL2L3Routing(): false {
  return BASELINE_MAY_DRIVE_L2_L3_ROUTING;
}

export function rankExecutorsFromBaseline(_artifact: unknown): never {
  throw new BaselineScoreRoutingForbidden("rankExecutorsFromBaseline");
}

export function preferExecutorFromBaseline(_autonomy: string, _artifact: unknown): never {
  throw new BaselineScoreRoutingForbidden(`preferExecutorFromBaseline(${_autonomy})`);
}
