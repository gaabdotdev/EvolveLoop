/**
 * V1-SEC-05 — Holdout test registry: invisible to agent during RUNNING;
 * read-only in VALIDATING; evidence SHA-256 bound to git HEAD.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export type HoldoutVisibilityPhase = "RUNNING" | "VALIDATING" | "IDLE" | "OTHER";

export interface HoldoutTestCase {
  id: string;
  /** Opaque payload — never shown to agent while RUNNING. */
  prompt: string;
  expected_signals: string[];
  created_at: string;
}

export interface HoldoutRegistrySnapshot {
  kind: "HoldoutRegistry";
  cases: HoldoutTestCase[];
  /** Content hash of registry body (not including git). */
  registry_sha256: string;
}

export interface HoldoutEvidence {
  kind: "HoldoutEvidence";
  registry_sha256: string;
  git_head: string;
  /** sha256(registry_sha256 + ":" + git_head) */
  bound_sha256: string;
  phase: HoldoutVisibilityPhase;
  case_ids_visible: string[];
  read_only: boolean;
  valid: boolean;
  tamper_reason?: string;
}

export class HoldoutError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HoldoutError";
  }
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

export function hashHoldoutRegistry(cases: HoldoutTestCase[]): string {
  const canonical = JSON.stringify(
    [...cases].sort((a, b) => a.id.localeCompare(b.id)).map((c) => ({
      id: c.id,
      prompt: c.prompt,
      expected_signals: c.expected_signals,
      created_at: c.created_at,
    })),
  );
  return sha256(canonical);
}

export function bindEvidenceToGit(registry_sha256: string, git_head: string): string {
  return sha256(`${registry_sha256}:${git_head}`);
}

export function resolveGitHead(repoRoot: string): string {
  const r = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf-8",
    timeout: 5_000,
  });
  if (r.status !== 0) {
    throw new HoldoutError("GIT_HEAD_UNAVAILABLE", r.stderr || "git rev-parse HEAD failed");
  }
  return r.stdout.trim();
}

export class HoldoutRegistry {
  private cases: HoldoutTestCase[] = [];
  private phase: HoldoutVisibilityPhase = "IDLE";
  private sealed_evidence: HoldoutEvidence | null = null;
  readonly path: string;
  readonly repo_root: string;

  constructor(opts: { registry_path: string; repo_root: string }) {
    this.path = resolve(opts.registry_path);
    this.repo_root = resolve(opts.repo_root);
  }

  setPhase(phase: HoldoutVisibilityPhase): void {
    this.phase = phase;
  }

  getPhase(): HoldoutVisibilityPhase {
    return this.phase;
  }

  load(cases: HoldoutTestCase[]): HoldoutRegistrySnapshot {
    if (this.phase === "VALIDATING" && this.sealed_evidence) {
      throw new HoldoutError("READ_ONLY", "holdout registry is read-only in VALIDATING");
    }
    this.cases = [...cases];
    this.sealed_evidence = null;
    return this.snapshot();
  }

  snapshot(): HoldoutRegistrySnapshot {
    return {
      kind: "HoldoutRegistry",
      cases: this.cases.map((c) => ({ ...c, expected_signals: [...c.expected_signals] })),
      registry_sha256: hashHoldoutRegistry(this.cases),
    };
  }

  /**
   * Agent-facing view: empty during RUNNING (invisible), full list only outside RUNNING
   * for non-agent roles. During VALIDATING returns ids only for scoring harness.
   */
  agentVisibleCases(): HoldoutTestCase[] {
    if (this.phase === "RUNNING") return [];
    if (this.phase === "VALIDATING") {
      // Harness may see ids; prompts remain withheld from agent mutation surface.
      return this.cases.map((c) => ({
        ...c,
        prompt: "[REDACTED_DURING_VALIDATING]",
      }));
    }
    return this.snapshot().cases;
  }

  /** True when agent must not see holdout content. */
  isInvisibleToAgent(): boolean {
    return this.phase === "RUNNING";
  }

  isReadOnly(): boolean {
    return this.phase === "VALIDATING";
  }

  /**
   * Seal evidence bound to current git HEAD. VALIDATING is read-only afterward for mutations.
   */
  sealEvidence(phase: HoldoutVisibilityPhase = this.phase): HoldoutEvidence {
    const snap = this.snapshot();
    const git_head = resolveGitHead(this.repo_root);
    const bound_sha256 = bindEvidenceToGit(snap.registry_sha256, git_head);
    const evidence: HoldoutEvidence = {
      kind: "HoldoutEvidence",
      registry_sha256: snap.registry_sha256,
      git_head,
      bound_sha256,
      phase,
      case_ids_visible: phase === "RUNNING" ? [] : snap.cases.map((c) => c.id),
      read_only: phase === "VALIDATING",
      valid: true,
    };
    this.sealed_evidence = evidence;
    this.phase = phase;
    return evidence;
  }

  /**
   * Recompute binding; invalid if registry or git HEAD drifted (tamper).
   */
  verifyEvidence(evidence: HoldoutEvidence, opts?: { git_head_override?: string }): HoldoutEvidence {
    const current_registry = hashHoldoutRegistry(this.cases);
    const git_head = opts?.git_head_override ?? resolveGitHead(this.repo_root);
    const expected = bindEvidenceToGit(current_registry, git_head);

    if (current_registry !== evidence.registry_sha256) {
      return {
        ...evidence,
        valid: false,
        tamper_reason: "registry_sha256_mismatch",
      };
    }
    if (git_head !== evidence.git_head) {
      return {
        ...evidence,
        valid: false,
        tamper_reason: "git_head_mismatch",
      };
    }
    if (expected !== evidence.bound_sha256) {
      return {
        ...evidence,
        valid: false,
        tamper_reason: "bound_sha256_mismatch",
      };
    }
    return { ...evidence, valid: true, tamper_reason: undefined };
  }

  /** Attempt mutation — denied in VALIDATING. */
  addCase(testCase: HoldoutTestCase): void {
    if (this.isReadOnly()) {
      throw new HoldoutError("READ_ONLY", "cannot mutate holdout registry in VALIDATING");
    }
    this.cases.push(testCase);
    this.sealed_evidence = null;
  }

  persist(): void {
    if (this.isReadOnly()) {
      throw new HoldoutError("READ_ONLY", "cannot persist holdout registry in VALIDATING");
    }
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.snapshot(), null, 2), "utf-8");
  }

  restoreFromDisk(): HoldoutRegistrySnapshot {
    if (!existsSync(this.path)) {
      throw new HoldoutError("NOT_FOUND", `holdout registry missing: ${this.path}`);
    }
    const raw = JSON.parse(readFileSync(this.path, "utf-8")) as HoldoutRegistrySnapshot;
    if (this.isReadOnly()) {
      throw new HoldoutError("READ_ONLY", "cannot reload into mutable store in VALIDATING");
    }
    this.cases = raw.cases ?? [];
    return this.snapshot();
  }
}

export function defaultHoldoutPath(workspaceRoot: string): string {
  return join(resolve(workspaceRoot), ".evolveloop", "holdout", "registry.json");
}
