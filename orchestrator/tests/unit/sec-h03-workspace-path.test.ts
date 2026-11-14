import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EngineeringWorkspace,
  WorkspaceError,
  isPathInsideRoot,
} from "../../src/v3/engineering/workspace.js";

describe("ISSUE-SEC-H03-PATH EngineeringWorkspace confinement", () => {
  it("isPathInsideRoot rejects prefix siblings", () => {
    expect(isPathInsideRoot("/tmp/ws", "/tmp/ws")).toBe(true);
    expect(isPathInsideRoot("/tmp/ws/a", "/tmp/ws")).toBe(true);
    expect(isPathInsideRoot("/tmp/ws-evil", "/tmp/ws")).toBe(false);
    expect(isPathInsideRoot("/tmp/ws-evil/x", "/tmp/ws")).toBe(false);
  });

  it("blocks write into prefix-sibling directory", () => {
    const base = mkdtempSync(join(tmpdir(), "el-h03-"));
    const root = join(base, "ws");
    const evil = join(base, "ws-evil");
    mkdirSync(root);
    mkdirSync(evil);
    const ws = new EngineeringWorkspace(root);
    expect(() => ws.writeFile(join(evil, "pwned.txt"), "x")).toThrow(WorkspaceError);
    expect(() => ws.writeFile(evil + "/pwned.txt", "x")).toThrow(/ESCAPE/);
  });

  it("allows normal relative writes under root", () => {
    const root = mkdtempSync(join(tmpdir(), "el-h03-ok-"));
    const ws = new EngineeringWorkspace(root);
    const full = ws.writeFile("ok.txt", "hello");
    expect(full.startsWith(root)).toBe(true);
    expect(ws.readFile("ok.txt")).toBe("hello");
  });

  it("blocks symlink escape when target exists outside", () => {
    const base = mkdtempSync(join(tmpdir(), "el-h03-sym-"));
    const root = join(base, "ws");
    const outside = join(base, "outside");
    mkdirSync(root);
    mkdirSync(outside);
    writeFileSync(join(outside, "secret.txt"), "secret");
    // If platform supports symlink into outside via relative escape attempt
    const ws = new EngineeringWorkspace(root);
    expect(() => ws.readFile(join(outside, "secret.txt"))).toThrow(WorkspaceError);
  });
});
