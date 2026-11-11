import { describe, it, expect } from "vitest";
import { buildScrubbedEnv } from "../../src/providers/deterministic/shell-env.js";
import { shellExecute } from "../../src/providers/deterministic/shell.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("shell env scrubbing (ADR-V3-0002)", () => {
  it("does not copy secret-like keys from process env", () => {
    const scrubbed = buildScrubbedEnv({
      PATH: "/usr/bin",
      HOME: "/home/t",
      OPENAI_API_KEY: "sk-secret",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      EVOLVELOOP_CHECKPOINT_HMAC_KEY: "hmac-secret",
    });
    expect(scrubbed.PATH).toBe("/usr/bin");
    expect(scrubbed.OPENAI_API_KEY).toBeUndefined();
    expect(scrubbed.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(scrubbed.EVOLVELOOP_CHECKPOINT_HMAC_KEY).toBeUndefined();
  });

  it("shellExecute child does not see injected secret env", async () => {
    const prev = process.env.EVOLVELOOP_TEST_SECRET;
    process.env.EVOLVELOOP_TEST_SECRET = "should-not-leak";
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orch-shell-"));
    try {
      const result = await shellExecute({
        command: "node -e \"process.stdout.write(process.env.EVOLVELOOP_TEST_SECRET||'ABSENT')\"",
        workspaceRoot: tmp,
      });
      expect(result.exit_code).toBe(0);
      expect(result.stdout_excerpt).toContain("ABSENT");
      expect(result.stdout_excerpt).not.toContain("should-not-leak");
    } finally {
      if (prev === undefined) delete process.env.EVOLVELOOP_TEST_SECRET;
      else process.env.EVOLVELOOP_TEST_SECRET = prev;
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
