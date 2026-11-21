/**
 * Engineering Quality Gates — discover/configure/run; never invent commands.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { atomicWriteJson, nowIso } from "./atomic.js";
import type { OpsDataPaths } from "./paths.js";
import type {
  ProjectPolicy,
  ProjectRecord,
  QualityGateResult,
  QualityGateSpec,
} from "./types.js";

export interface DiscoveredGate {
  gate_id: string;
  name: string;
  command: string;
  confidence: "high" | "low";
  source: string;
}

/**
 * Discover likely commands from repo manifests — caller must confirm low-confidence.
 * Does not invent npm for non-node projects.
 */
export function discoverQualityGates(projectPath: string): DiscoveredGate[] {
  const found: DiscoveredGate[] = [];
  const pkgPath = join(projectPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        scripts?: Record<string, string>;
      };
      const scripts = pkg.scripts ?? {};
      const map: Array<[string, string, string]> = [
        ["test", "unit_tests", "npm test"],
        ["lint", "lint", "npm run lint"],
        ["typecheck", "typecheck", "npm run typecheck"],
        ["build", "build", "npm run build"],
      ];
      for (const [script, gateId, cmd] of map) {
        if (scripts[script]) {
          found.push({
            gate_id: gateId,
            name: script,
            command: cmd,
            confidence: "high",
            source: "package.json#scripts",
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  const pyproject = join(projectPath, "pyproject.toml");
  const pytestIni = join(projectPath, "pytest.ini");
  if (existsSync(pyproject) || existsSync(pytestIni)) {
    found.push({
      gate_id: "unit_tests",
      name: "pytest",
      command: "python -m pytest",
      confidence: existsSync(pytestIni) ? "high" : "low",
      source: existsSync(pytestIni) ? "pytest.ini" : "pyproject.toml",
    });
  }

  const cargo = join(projectPath, "Cargo.toml");
  if (existsSync(cargo)) {
    found.push({
      gate_id: "build",
      name: "cargo-check",
      command: "cargo check",
      confidence: "high",
      source: "Cargo.toml",
    });
    found.push({
      gate_id: "unit_tests",
      name: "cargo-test",
      command: "cargo test",
      confidence: "high",
      source: "Cargo.toml",
    });
  }

  return found;
}

export function applyDiscoveredGates(
  policy: ProjectPolicy,
  discovered: DiscoveredGate[],
  confirmLowConfidence: boolean,
): ProjectPolicy {
  const gates: QualityGateSpec[] = [...policy.quality_gates];
  for (const d of discovered) {
    if (d.confidence === "low" && !confirmLowConfidence) continue;
    if (gates.some((g) => g.gate_id === d.gate_id)) continue;
    gates.push({
      gate_id: d.gate_id,
      name: d.name,
      requirement: d.confidence === "high" ? "optional" : "unavailable",
      command: d.command,
      timeout_ms: 300_000,
      expected_exit_code: 0,
      phase: "both",
      provenance: d.confidence === "high" ? "measured" : "estimated",
    });
  }
  return { ...policy, quality_gates: gates };
}

export class QualityGateRunner {
  constructor(private readonly paths: OpsDataPaths) {
    mkdirSync(paths.qualityResultsDir, { recursive: true });
  }

  private pathFor(id: string): string {
    return join(this.paths.qualityResultsDir, `${id}.json`);
  }

  list(workflowId?: string): QualityGateResult[] {
    let items = readdirSync(this.paths.qualityResultsDir)
      .filter((f) => f.endsWith(".json"))
      .map(
        (f) =>
          JSON.parse(
            readFileSync(join(this.paths.qualityResultsDir, f), "utf-8"),
          ) as QualityGateResult,
      );
    if (workflowId) items = items.filter((r) => r.workflow_id === workflowId);
    return items;
  }

  run(input: {
    project: ProjectRecord;
    workflow_id: string;
    gate: QualityGateSpec;
    phase: "pre_integration" | "post_integration";
    artifact_hash?: string;
    /** Dry-run for tests: inject exit code instead of executing */
    inject_exit_code?: number;
  }): QualityGateResult {
    const gate = input.gate;
    if (gate.requirement === "not_applicable" || gate.requirement === "unavailable") {
      const result: QualityGateResult = {
        kind: "QualityGateResult",
        result_id: `qg-${randomUUID()}`,
        project_id: input.project.project_id,
        workflow_id: input.workflow_id,
        gate_id: gate.gate_id,
        requirement: gate.requirement,
        expected_exit_code: gate.expected_exit_code,
        passed: gate.requirement === "not_applicable",
        phase: input.phase,
        artifact_hash: input.artifact_hash,
        provenance: gate.provenance,
      started_at: nowIso(),
      finished_at: nowIso(),
      stdout_tail: `skipped:${gate.requirement}`,
      };
      if (gate.requirement === "unavailable") {
        result.passed = false;
        result.stderr_tail = "UNAVAILABLE_GATE_CANNOT_PASS_AS_SUCCESS";
      }
      atomicWriteJson(this.pathFor(result.result_id), result);
      return result;
    }

    if (!gate.command) {
      const result: QualityGateResult = {
        kind: "QualityGateResult",
        result_id: `qg-${randomUUID()}`,
        project_id: input.project.project_id,
        workflow_id: input.workflow_id,
        gate_id: gate.gate_id,
        requirement: gate.requirement,
        expected_exit_code: gate.expected_exit_code,
        passed: false,
        phase: input.phase,
        artifact_hash: input.artifact_hash,
        provenance: "unavailable",
        started_at: nowIso(),
        finished_at: nowIso(),
        stderr_tail: "GATE_COMMAND_MISSING",
      };
      atomicWriteJson(this.pathFor(result.result_id), result);
      return result;
    }

    const started = nowIso();
    let exit_code = 1;
    let stdout_tail = "";
    let stderr_tail = "";

    if (input.inject_exit_code !== undefined) {
      exit_code = input.inject_exit_code;
      stdout_tail = "injected";
    } else {
      try {
        const cwd = gate.cwd
          ? join(input.project.canonical_path, gate.cwd)
          : input.project.canonical_path;
        const out = execFileSync("bash", ["-lc", gate.command], {
          cwd,
          encoding: "utf-8",
          timeout: gate.timeout_ms,
          stdio: ["ignore", "pipe", "pipe"],
        });
        exit_code = 0;
        stdout_tail = String(out).slice(-2000);
      } catch (err) {
        const e = err as { status?: number; stdout?: string; stderr?: string; message?: string };
        exit_code = typeof e.status === "number" ? e.status : 1;
        stdout_tail = String(e.stdout ?? "").slice(-2000);
        stderr_tail = String(e.stderr ?? e.message ?? "").slice(-2000);
      }
    }

    const passed = exit_code === gate.expected_exit_code;
    // Absence of tests is not success when required
    if (gate.requirement === "required" && !passed) {
      /* fail */
    }

    const result: QualityGateResult = {
      kind: "QualityGateResult",
      result_id: `qg-${randomUUID()}`,
      project_id: input.project.project_id,
      workflow_id: input.workflow_id,
      gate_id: gate.gate_id,
      requirement: gate.requirement,
      command: gate.command,
      cwd: gate.cwd,
      exit_code,
      expected_exit_code: gate.expected_exit_code,
      passed: gate.requirement === "optional" ? true : passed, // optional failure still recorded but doesn't block via passed flag for optional — wait, spec says optional can fail without blocking. Use passed=actual for honesty; blocker logic separate.
      phase: input.phase,
      artifact_hash: input.artifact_hash,
      provenance: gate.provenance,
      stdout_tail,
      stderr_tail,
      started_at: started,
      finished_at: nowIso(),
    };
    // Honest: passed reflects command outcome; callers use requirement to decide block
    result.passed = passed;
    atomicWriteJson(this.pathFor(result.result_id), result);
    return result;
  }

  runPhase(input: {
    project: ProjectRecord;
    workflow_id: string;
    phase: "pre_integration" | "post_integration";
    artifact_hash?: string;
    inject?: Record<string, number>;
  }): { results: QualityGateResult[]; blocked: boolean; reason?: string } {
    const results: QualityGateResult[] = [];
    for (const gate of input.project.policy.quality_gates) {
      if (gate.phase !== "both" && gate.phase !== input.phase) continue;
      const r = this.run({
        project: input.project,
        workflow_id: input.workflow_id,
        gate,
        phase: input.phase,
        artifact_hash: input.artifact_hash,
        inject_exit_code: input.inject?.[gate.gate_id],
      });
      results.push(r);
      if (gate.requirement === "required" && !r.passed) {
        return {
          results,
          blocked: true,
          reason: `QUALITY_GATE_FAILED:${gate.gate_id}`,
        };
      }
    }
    // Empty required set: do not treat as success of testing — only "no required gates configured"
    return { results, blocked: false };
  }
}

export function hashArtifact(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Persist confirmed gate config beside project (not inventing). */
export function writeGateConfirmation(
  project: ProjectRecord,
  gates: QualityGateSpec[],
): void {
  const dir = join(project.data_dir, "quality");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "gates.json"), JSON.stringify({ gates, confirmed_at: nowIso() }, null, 2));
}
