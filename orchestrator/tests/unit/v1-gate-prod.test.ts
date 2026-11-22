/**
 * V1-GATE-PROD — named aggregate checklist (evidence entrypoint).
 * Full proofs live in sibling v1-orch-01 / v1-sec-0{1..5} files run by
 * `npm run test:v1-gate-prod`. This file asserts the gate matrix is wired.
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import {
  isBwrapAvailable,
  probeCgroupV2,
} from "../../src/v3/sandbox/index.js";
import { evaluateCredentialProxy } from "../../src/v3/security/credential-proxy.js";
import { evaluateTaintGate, taint } from "../../src/v3/security/taint.js";
import { HoldoutRegistry } from "../../src/v3/security/holdout.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

const GATE_SSRF = [
  "127.0.0.1",
  "localhost:11434",
  "10.0.0.1",
  "192.168.1.1",
  "100.64.0.1",
] as const;

describe("V1-GATE-PROD matrix", () => {
  it("documents required evidence files present", () => {
    const root = path.resolve(__dirname);
    for (const f of [
      "v1-orch-01-daemon-uds.test.ts",
      "v1-sec-01-bwrap-wrapper.test.ts",
      "v1-sec-02-credential-proxy.test.ts",
      "v1-sec-03-phase-isolation.test.ts",
      "v1-sec-04-taint.test.ts",
      "v1-sec-05-holdout.test.ts",
    ]) {
      expect(existsSync(path.join(root, f)), f).toBe(true);
    }
  });

  it("SSRF gate hosts blocked (smoke)", () => {
    const config = { authorized_domains: ["api.example.com"], credentials: {} };
    for (const h of GATE_SSRF) {
      expect(evaluateCredentialProxy(h, config).blocked, h).toBe(true);
    }
  });

  it("taint blocks privileged tool from dirty input (smoke)", () => {
    const g = evaluateTaintGate("shell.execute", [taint("x", "untrusted_input")]);
    expect(g.blocked).toBe(true);
  });

  it("holdout invisible in RUNNING (smoke)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "v1-gate-prod-"));
    try {
      const reg = new HoldoutRegistry({
        registry_path: path.join(dir, "h.json"),
        repo_root: path.resolve(__dirname, "../../.."),
      });
      reg.load([
        {
          id: "G1",
          prompt: "secret",
          expected_signals: ["x"],
          created_at: "2026-11-21T00:00:00Z",
        },
      ]);
      reg.setPhase("RUNNING");
      expect(reg.isInvisibleToAgent()).toBe(true);
      expect(reg.agentVisibleCases()).toEqual([]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("host capabilities recorded for bwrap + cgroup", () => {
    const bwrap = isBwrapAvailable();
    const cg = probeCgroupV2();
    // Soft record — hard fail belongs to sec-01 / sec-03 host-proof tests
    expect(typeof bwrap).toBe("boolean");
    expect(cg.kind).toBe("CgroupV2Probe");
    if (!bwrap) {
      expect.fail("V1-GATE-PROD: bwrap missing — confinement unprovable");
    }
    if (!(cg.can_memory || cg.can_pids)) {
      expect.fail(
        `V1-GATE-PROD: cgroup memory/pids unprovable gaps=${cg.gaps.join(",")}`,
      );
    }
  });
});
