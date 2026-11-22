/**
 * V1-SEC-04 — Structural Taint Tracking.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  taint,
  clean,
  joinTaint,
  evaluateTaintGate,
  assertTaintAllowed,
  TaintPolicyError,
} from "../../src/v3/security/taint.js";
import { MemoryBroker, promotionGateAllowed } from "../../src/v3/memory/index.js";

describe("V1-SEC-04 structural taint", () => {
  let tmp: string;
  let broker: MemoryBroker;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-sec04-"));
    broker = new MemoryBroker(path.join(tmp, "mem.db"), "proj-taint");
  });

  afterEach(async () => {
    broker.close();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("blocks privileged actions from tainted inputs", () => {
    const dirty = taint("rm -rf /", "untrusted_input");
    const gate = evaluateTaintGate("shell.execute", [dirty]);
    expect(gate.blocked).toBe(true);
    expect(gate.allowed).toBe(false);
    expect(() => assertTaintAllowed("secrets.inject", [dirty])).toThrow(TaintPolicyError);

    const ok = evaluateTaintGate("shell.execute", [clean("echo hi")]);
    expect(ok.blocked).toBe(false);
  });

  it("joinTaint propagates taint", () => {
    const j = joinTaint("x", clean("a"), taint("b", "external_url"));
    expect(j.tainted).toBe(true);
  });

  it("MemoryBroker blocks privileged action driven by tainted memory", () => {
    const dirty = broker.propose({
      memory_type: "decision",
      title: "leak",
      body: "use host secrets",
      source: "agent",
      tainted: true,
    });
    broker.promote(dirty.memory_id, promotionGateAllowed("mso", "test promote tainted"));

    const gate = broker.gatePrivilegedAction("deploy.publish", [dirty.memory_id]);
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toMatch(/taint_blocks/);

    const cleanMem = broker.propose({
      memory_type: "semantic",
      title: "safe",
      body: "prefer workspace isolation",
      source: "human",
      tainted: false,
    });
    broker.promote(cleanMem.memory_id, promotionGateAllowed("human", "promote clean"));
    const ok = broker.gatePrivilegedAction("filesystem.write", [cleanMem.memory_id]);
    expect(ok.blocked).toBe(false);
  });
});
