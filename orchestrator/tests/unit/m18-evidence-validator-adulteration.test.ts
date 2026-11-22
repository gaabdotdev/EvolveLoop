/**
 * M18 — Evidence Validator blocks mutate / delete / skip of existing tests.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runEvidenceValidator } from "../../src/v3/circuit/evidence-validator.js";
import type { GoalContract } from "../../src/v3/goal-contract/types.js";

function minimalContract(id: string): GoalContract {
  const ts = new Date().toISOString();
  return {
    kind: "GoalContract",
    goal_contract_id: id,
    version: 1,
    created_at: ts,
    updated_at: ts,
    objective: "fixture",
    scope: [],
    out_of_scope: [],
    functional_requirements: [],
    non_functional_requirements: [],
    constraints: [],
    dependencies: [],
    risks: [],
    criteria: [
      {
        id: "c-accept",
        description: "commands green",
        mandatory: true,
        verification: [{ id: "v1", kind: "command", description: "validator" }],
        evidence_required: ["acceptance-evidence"],
        state: "NOT_STARTED",
        evidence_ids: [],
        updated_at: ts,
      },
    ],
  };
}

function git(cwd: string, args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
}

describe("M18 Evidence Validator — mutate/delete/skip blocked", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "m18-ev-"));
    git(tmp, ["init"]);
    writeFileSync(path.join(tmp, "README.md"), "x\n", "utf-8");
    mkdirSync(path.join(tmp, "tests"), { recursive: true });
    writeFileSync(
      path.join(tmp, "tests", "existing.test.ts"),
      `import { describe, it, expect } from "vitest";\n` +
        `describe("existing", () => {\n` +
        `  it("asserts truth", () => { expect(1).toBe(1); });\n` +
        `});\n`,
      "utf-8",
    );
    git(tmp, ["add", "."]);
    git(tmp, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "base"]);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("blocks MUTATE of existing test (assertion weakened)", async () => {
    writeFileSync(
      path.join(tmp, "tests", "existing.test.ts"),
      `import { describe, it, expect } from "vitest";\n` +
        `describe("existing", () => {\n` +
        `  it("asserts truth", () => { expect(true).toBe(true); });\n` +
        `});\n`,
      "utf-8",
    );

    const blocked = await runEvidenceValidator({
      workspace_root: tmp,
      goal_contract: minimalContract("gc-mutate"),
      commands: [{ id: "true", argv: ["true"], cwd: tmp }],
    });

    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.code).toBe("SENSITIVE_DIFF_UNAUTHORIZED");
    expect(blocked.sensitive_diff_blocked).toContain("tests/existing.test.ts");
    expect(blocked.test_adulterations.some((a) => a.kind === "mutate")).toBe(true);
    expect(blocked.reasons.some((r) => r.includes("test_adulteration_mutate"))).toBe(true);
  });

  it("blocks DELETE of existing test file", async () => {
    unlinkSync(path.join(tmp, "tests", "existing.test.ts"));

    const blocked = await runEvidenceValidator({
      workspace_root: tmp,
      goal_contract: minimalContract("gc-delete"),
      commands: [{ id: "true", argv: ["true"], cwd: tmp }],
    });

    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.code).toBe("SENSITIVE_DIFF_UNAUTHORIZED");
    expect(blocked.sensitive_diff_blocked).toContain("tests/existing.test.ts");
    expect(blocked.test_adulterations.some((a) => a.kind === "delete")).toBe(true);
    expect(blocked.reasons.some((r) => r.includes("test_adulteration_delete"))).toBe(true);
  });

  it("blocks SKIP of existing test (it.skip / xit)", async () => {
    writeFileSync(
      path.join(tmp, "tests", "existing.test.ts"),
      `import { describe, it, expect } from "vitest";\n` +
        `describe("existing", () => {\n` +
        `  it.skip("asserts truth", () => { expect(1).toBe(1); });\n` +
        `});\n`,
      "utf-8",
    );

    const blocked = await runEvidenceValidator({
      workspace_root: tmp,
      goal_contract: minimalContract("gc-skip"),
      commands: [{ id: "true", argv: ["true"], cwd: tmp }],
    });

    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.code).toBe("SENSITIVE_DIFF_UNAUTHORIZED");
    expect(blocked.test_adulterations.some((a) => a.kind === "skip")).toBe(true);
    expect(blocked.reasons.some((r) => r.includes("test_adulteration_skip"))).toBe(true);
  });

  it("does NOT block when Goal Contract authorizes the path", async () => {
    writeFileSync(
      path.join(tmp, "tests", "existing.test.ts"),
      `import { describe, it, expect } from "vitest";\n` +
        `describe("existing", () => {\n` +
        `  it.skip("asserts truth", () => { expect(1).toBe(1); });\n` +
        `});\n`,
      "utf-8",
    );

    const passed = await runEvidenceValidator({
      workspace_root: tmp,
      goal_contract: {
        ...minimalContract("gc-auth"),
        scope: ["authorize:tests/existing.test.ts"],
      },
      commands: [{ id: "true", argv: ["true"], cwd: tmp }],
    });

    expect(passed.status).toBe("TRUE_FULL_PASS");
    expect(passed.sensitive_diff_blocked).toHaveLength(0);
    expect(passed.test_adulterations).toHaveLength(0);
  });
});
