/**
 * V1-TOK-17 — Brain vs Hand Fast-Apply (deterministic surgical path).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  splitPlanAndApply,
  estimatePlanTokensProxy,
  hashLineRange,
  type CompactEditPlan,
} from "../../src/v3/token-economy/index.js";

describe("V1-TOK-17 brain vs hand", () => {
  let tmp: string;
  let file: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-tok17-"));
    file = path.join(tmp, "target.ts");
    await fs.writeFile(file, ["a", "b", "c", "d"].join("\n") + "\n", "utf-8");
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("splitPlanAndApply uses deterministic surgical-edit hand", async () => {
    const src = await fs.readFile(file, "utf-8");
    const plan: CompactEditPlan = {
      kind: "CompactEditPlan",
      path: file,
      op: "REPLACE",
      start: 2,
      end: 3,
      content: "B\nC",
      expectedHash: hashLineRange(src, 2, 3),
      note: "compact",
    };

    const tokens = estimatePlanTokensProxy(plan);
    expect(tokens).toBeGreaterThan(0);

    const result = await splitPlanAndApply({ plan, apply: true });
    expect(result.mode).toBe("deterministic");
    expect(result.applied).toBe(true);
    expect(result.edit?.ok).toBe(true);
    expect(result.plan_tokens_proxy).toBe(tokens);

    const after = await fs.readFile(file, "utf-8");
    expect(after).toBe(["a", "B", "C", "d"].join("\n") + "\n");
  });

  it("plan_only skips mutation", async () => {
    const plan: CompactEditPlan = {
      kind: "CompactEditPlan",
      path: file,
      op: "DELETE",
      start: 1,
      end: 1,
    };
    const result = await splitPlanAndApply({ plan, apply: false });
    expect(result.applied).toBe(false);
    expect(result.mode).toBe("plan_only");
    const after = await fs.readFile(file, "utf-8");
    expect(after).toContain("a");
  });
});
