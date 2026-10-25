import { describe, it, expect } from "vitest";
import { shellExecute, sanitizeEnvironment } from "../../src/providers/deterministic/shell.js";
import os from "node:os";

describe("shell confinement and environment sanitization", () => {
  it("sanitizeEnvironment removes secrets and retains safe keys", () => {
    const raw = {
      PATH: "/usr/bin:/bin",
      HOME: "/home/user",
      OPENAI_API_KEY: "sk-secret-123456",
      ANTHROPIC_API_KEY: "sk-ant-secret",
      DATABASE_PASSWORD: "super-secret-password",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      LC_ALL: "en_US.UTF-8",
      CUSTOM_INJECTED: "should-be-omitted",
    };

    const clean = sanitizeEnvironment(raw);
    expect(clean.PATH).toBe("/usr/bin:/bin");
    expect(clean.HOME).toBe("/home/user");
    expect(clean.LC_ALL).toBe("en_US.UTF-8");
    expect(clean.OPENAI_API_KEY).toBeUndefined();
    expect(clean.ANTHROPIC_API_KEY).toBeUndefined();
    expect(clean.DATABASE_PASSWORD).toBeUndefined();
    expect(clean.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(clean.CUSTOM_INJECTED).toBeUndefined();
  });

  it("shellExecute does not leak ambient secrets into spawned environment", async () => {
    const origKey = process.env.OPENAI_API_KEY;
    const origAnt = process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = "sk-super-secret-ambient-key";
    process.env.ANTHROPIC_API_KEY = "sk-ant-super-secret-ambient";

    try {
      const res = await shellExecute({
        command: "env || printenv",
        workspaceRoot: os.tmpdir(),
      });

      expect(res.exit_code).toBe(0);
      expect(res.stdout_excerpt).not.toContain("sk-super-secret-ambient-key");
      expect(res.stdout_excerpt).not.toContain("sk-ant-super-secret-ambient");
    } finally {
      if (origKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = origKey;
      if (origAnt === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = origAnt;
    }
  });

  it("shellExecute times out and kills process group cleanly", async () => {
    const start = Date.now();
    const res = await shellExecute({
      command: "sleep 10",
      timeoutMs: 300,
      workspaceRoot: os.tmpdir(),
    });

    const elapsed = Date.now() - start;
    expect(res.timed_out).toBe(true);
    expect(elapsed).toBeLessThan(5000);
  });
});
