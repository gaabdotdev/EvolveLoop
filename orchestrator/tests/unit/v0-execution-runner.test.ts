import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { DefaultExecutionRunner } from "../../src/v3/execution-runner/index.js";

describe("V0 ExecutionRunner", () => {
  let tmp: string;
  const runner = new DefaultExecutionRunner();

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-runner-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("runs command with scrubbed env (secrets not inherited) + ephemeral HOME", async () => {
    const prev = process.env.SUPER_SECRET_TOKEN;
    const prevHome = process.env.HOME;
    process.env.SUPER_SECRET_TOKEN = "should-not-leak";
    process.env.HOME = "/should/not/inherit/real/home";
    try {
      const result = await runner.run({
        argv: [
          "bash",
          "-lc",
          "echo SECRET=$SUPER_SECRET_TOKEN; echo PATH_OK=${PATH:+yes}; echo HOME=$HOME",
        ],
        cwd: tmp,
        workspace_root: tmp,
        timeout_ms: 5000,
      });
      expect(result.status).toBe("ok");
      expect(result.stdout).toContain("SECRET=");
      expect(result.stdout).not.toContain("should-not-leak");
      expect(result.stdout).toContain("PATH_OK=yes");
      expect(result.stdout).not.toContain("/should/not/inherit/real/home");
      expect(result.ephemeral_home).toBeTypeOf("string");
      expect(result.pgid).toBeTypeOf("number");
    } finally {
      if (prev === undefined) delete process.env.SUPER_SECRET_TOKEN;
      else process.env.SUPER_SECRET_TOKEN = prev;
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
    }
  });

  it("blocks cwd symlink that escapes workspace", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "v0-outside-"));
    try {
      writeFileSync(path.join(outside, "secret.txt"), "nope", "utf-8");
      const link = path.join(tmp, "escape");
      symlinkSync(outside, link);
      const result = await runner.run({
        argv: ["true"],
        cwd: link,
        workspace_root: tmp,
        timeout_ms: 3000,
      });
      expect(result.status).toBe("blocked");
      expect(result.code).toMatch(/SYMLINK|ESCAPE|PATH/);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("times out and kills process group (SIGTERM→SIGKILL)", async () => {
    const result = await runner.run({
      argv: ["bash", "-lc", "sleep 30"],
      cwd: tmp,
      workspace_root: tmp,
      timeout_ms: 400,
      kill_grace_ms: 200,
    });
    expect(result.status).toBe("timeout");
    expect(result.code).toBe("TIMEOUT");
  });

  it("redacts secrets in captured stdout", async () => {
    const result = await runner.run({
      argv: ["bash", "-lc", "echo API_KEY=abc123secretvalue999; echo ok"],
      cwd: tmp,
      workspace_root: tmp,
      timeout_ms: 3000,
    });
    expect(result.status).toBe("ok");
    expect(result.stdout).toContain("ok");
    expect(result.stdout).not.toContain("abc123secretvalue999");
    expect(result.stdout).toMatch(/REDACTED/i);
  });

  it("blocks destructive capability via Capability Gate", async () => {
    const result = await runner.run({
      argv: ["true"],
      cwd: tmp,
      workspace_root: tmp,
      capability: "filesystem.delete",
      timeout_ms: 3000,
    });
    expect(result.status).toBe("blocked");
    expect(result.code).toBe("CAPABILITY_BLOCKED");
  });

  it("filters denied stdout patterns", async () => {
    const result = await runner.run({
      argv: ["bash", "-lc", "echo safe; echo Authorization: Bearer abc123; echo ok"],
      cwd: tmp,
      workspace_root: tmp,
      timeout_ms: 3000,
      stdout_deny_patterns: [/authorization:\s*bearer/i],
    });
    expect(result.status).toBe("ok");
    expect(result.stdout).toContain("safe");
    expect(result.stdout).not.toMatch(/abc123/);
  });

  it("allows writing under workspace via node", async () => {
    mkdirSync(path.join(tmp, "out"), { recursive: true });
    const out = path.join(tmp, "out", "x.txt");
    const result = await runner.run({
      argv: [
        "node",
        "-e",
        "require('fs').writeFileSync(process.argv[1], 'hi')",
        out,
      ],
      cwd: tmp,
      workspace_root: tmp,
      timeout_ms: 5000,
    });
    expect(result.status).toBe("ok");
    expect(await fs.readFile(out, "utf-8")).toBe("hi");
  });

  it("allows absolute host CLI outside workspace (PATH tools)", async () => {
    const which = await import("node:child_process").then((m) =>
      m.spawnSync("which", ["node"], { encoding: "utf-8" }),
    );
    const nodeBin = which.stdout.trim();
    expect(nodeBin.startsWith("/")).toBe(true);
    const result = await runner.run({
      argv: [nodeBin, "-e", "process.stdout.write('host-ok')"],
      cwd: tmp,
      workspace_root: tmp,
      timeout_ms: 5000,
    });
    expect(result.status).toBe("ok");
    expect(result.stdout).toContain("host-ok");
  });
});
