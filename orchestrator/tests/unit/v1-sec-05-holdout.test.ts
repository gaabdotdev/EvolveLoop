/**
 * V1-SEC-05 — Holdout tests read-only in VALIDATING + SHA-256 bound to git.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  HoldoutRegistry,
  HoldoutError,
  hashHoldoutRegistry,
  bindEvidenceToGit,
  resolveGitHead,
} from "../../src/v3/security/holdout.js";

const REPO = path.resolve(__dirname, "../../..");

describe("V1-SEC-05 holdout registry", () => {
  let tmp: string;
  let registry: HoldoutRegistry;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v1-sec05-"));
    registry = new HoldoutRegistry({
      registry_path: path.join(tmp, "holdout.json"),
      repo_root: REPO,
    });
    registry.load([
      {
        id: "H-1",
        prompt: "secret holdout prompt alpha",
        expected_signals: ["alpha"],
        created_at: "2026-11-21T00:00:00Z",
      },
      {
        id: "H-2",
        prompt: "secret holdout prompt beta",
        expected_signals: ["beta"],
        created_at: "2026-11-21T00:00:01Z",
      },
    ]);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("is invisible to agent during RUNNING", () => {
    registry.setPhase("RUNNING");
    expect(registry.isInvisibleToAgent()).toBe(true);
    expect(registry.agentVisibleCases()).toEqual([]);
  });

  it("VALIDATING is read-only and redacts prompts", () => {
    registry.setPhase("VALIDATING");
    expect(registry.isReadOnly()).toBe(true);
    const visible = registry.agentVisibleCases();
    expect(visible).toHaveLength(2);
    expect(visible.every((c) => c.prompt.includes("REDACTED"))).toBe(true);
    expect(() =>
      registry.addCase({
        id: "H-x",
        prompt: "nope",
        expected_signals: [],
        created_at: "2026-11-21T00:00:02Z",
      }),
    ).toThrow(HoldoutError);
  });

  it("seals SHA-256 evidence bound to git HEAD; tamper invalidates", () => {
    const evidence = registry.sealEvidence("VALIDATING");
    const head = resolveGitHead(REPO);
    expect(evidence.git_head).toBe(head);
    expect(evidence.bound_sha256).toBe(
      bindEvidenceToGit(evidence.registry_sha256, evidence.git_head),
    );
    expect(evidence.read_only).toBe(true);
    expect(registry.verifyEvidence(evidence).valid).toBe(true);

    // Tamper git head binding first (registry still matches)
    const fakeHead = registry.verifyEvidence(evidence, { git_head_override: "0".repeat(40) });
    expect(fakeHead.valid).toBe(false);
    expect(fakeHead.tamper_reason).toBe("git_head_mismatch");

    // Tamper registry content
    registry.setPhase("IDLE");
    registry.addCase({
      id: "H-tamper",
      prompt: "injected",
      expected_signals: ["x"],
      created_at: "2026-11-21T00:00:03Z",
    });
    const afterTamper = registry.verifyEvidence(evidence);
    expect(afterTamper.valid).toBe(false);
    expect(afterTamper.tamper_reason).toBe("registry_sha256_mismatch");
  });

  it("hashHoldoutRegistry is deterministic", () => {
    const a = hashHoldoutRegistry(registry.snapshot().cases);
    const b = hashHoldoutRegistry(registry.snapshot().cases);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});
