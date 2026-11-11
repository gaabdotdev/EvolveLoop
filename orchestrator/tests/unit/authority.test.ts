import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CapabilityAuthority,
  pathEscapesWorkspace,
} from "../../src/authority/capability-authority.js";

describe("CapabilityAuthority", () => {
  const authority = new CapabilityAuthority();

  it("allows read-only filesystem", () => {
    const r = authority.authorize({
      capability: "filesystem.read",
      permissions: { filesystem: "read" },
      deterministic: true,
    });
    expect(r.decision).toBe("allow");
  });

  it("denies shell when no grant is present", () => {
    const r = authority.authorize({
      capability: "shell.execute",
      permissions: { shell: true },
      side_effects: true,
      requires_confirmation: true,
    });
    expect(r.decision).toBe("deny");
    expect(r.reason).toBe("shell_denied_by_context");
  });

  it("allows shell when allowShell=true", () => {
    const r = authority.authorize({
      capability: "shell.execute",
      permissions: { shell: true },
      context: { allowShell: true },
    });
    expect(r.decision).toBe("allow");
  });

  it("allows write when allowWrite=true", () => {
    const r = authority.authorize({
      capability: "filesystem.write",
      permissions: { filesystem: "write" },
      side_effects: true,
      context: { allowWrite: true },
    });
    expect(r.decision).toBe("allow");
  });

  it("denies path escape", () => {
    const r = authority.authorize({
      capability: "filesystem.read",
      targetPath: "../etc/passwd",
      context: { workspaceRoot: "/tmp/ws" },
    });
    expect(r.decision).toBe("deny");
  });

  it("allows git.inspect", () => {
    expect(authority.authorize({ capability: "git.inspect" }).decision).toBe("allow");
  });

  it("denies unknown capabilities (fail-closed)", () => {
    const r = authority.authorize({ capability: "backend-implementation" });
    expect(r.decision).toBe("deny");
    expect(r.reason).toBe("unknown_capability_denied");
  });

  it("denies targetPath without workspaceRoot", () => {
    const r = authority.authorize({
      capability: "filesystem.read",
      targetPath: "a.txt",
    });
    expect(r.decision).toBe("deny");
    expect(r.reason).toBe("workspace_root_required");
  });
});

describe("pathEscapesWorkspace symlink-safe (ADR-V3-0002)", () => {
  let tmp: string;
  let outside: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orch-ws-"));
    outside = await fs.mkdtemp(path.join(os.tmpdir(), "orch-out-"));
    await fs.writeFile(path.join(outside, "secret.txt"), "secret");
    await fs.symlink(path.join(outside, "secret.txt"), path.join(tmp, "leak.txt"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  it("treats symlink pointing outside workspace as escape", () => {
    expect(pathEscapesWorkspace("leak.txt", tmp)).toBe(true);
  });

  it("allows normal in-workspace file", async () => {
    await fs.writeFile(path.join(tmp, "ok.txt"), "ok");
    expect(pathEscapesWorkspace("ok.txt", tmp)).toBe(false);
  });
});
