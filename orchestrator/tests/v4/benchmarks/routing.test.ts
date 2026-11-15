import { describe, expect, it } from "vitest";
import {
  BaselineScoreRoutingForbidden,
  baselineMayDriveL2L3Routing,
  preferExecutorFromBaseline,
  rankExecutorsFromBaseline,
} from "../../../src/v4/benchmarks/index.js";
import { executedFixture, loadCanonicalArtifact } from "./fixtures.js";

describe("M17 must not route L2/L3 by score", () => {
  it("baselineMayDriveL2L3Routing is always false", () => {
    expect(baselineMayDriveL2L3Routing()).toBe(false);
  });

  it("refuses ranking helpers for canonical and fixture artifacts", () => {
    expect(() => rankExecutorsFromBaseline(loadCanonicalArtifact())).toThrow(BaselineScoreRoutingForbidden);
    expect(() => rankExecutorsFromBaseline(executedFixture())).toThrow(BaselineScoreRoutingForbidden);
    expect(() => preferExecutorFromBaseline("L2_SUPERVISED", executedFixture())).toThrow(BaselineScoreRoutingForbidden);
    expect(() => preferExecutorFromBaseline("L3_AUTONOMOUS", executedFixture())).toThrow(BaselineScoreRoutingForbidden);
    expect(() => preferExecutorFromBaseline("L0_OBSERVE", executedFixture())).toThrow(BaselineScoreRoutingForbidden);
  });
});
