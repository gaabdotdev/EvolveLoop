import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import {
  identifyProcess,
  sameProcess,
  cancelProcessTree,
  spawnSupervised,
} from "../../src/v3/sandbox/process-supervisor.js";

describe("V3.5 process supervisor", () => {
  it("records starttime and detects same process", async () => {
    const { child, identity } = spawnSupervised({
      argv: [process.execPath, "-e", "setTimeout(()=>{}, 5000)"],
    });
    expect(identity).toBeTruthy();
    expect(sameProcess(identity!)).toBe(true);
    const result = cancelProcessTree(identity!, "SIGKILL");
    expect(result.signalled).toBe(true);
    await new Promise<void>((resolve) => child.on("exit", () => resolve()));
  });

  it("refuses kill on mismatched starttime (pid reuse guard)", () => {
    const fake = {
      pid: process.pid,
      pgid: process.pid,
      starttime: "0",
      cmdline: "fake",
    };
    // current process starttime != "0"
    const me = identifyProcess(process.pid);
    expect(me).toBeTruthy();
    expect(sameProcess(fake)).toBe(false);
    expect(cancelProcessTree(fake).signalled).toBe(false);
  });
});
