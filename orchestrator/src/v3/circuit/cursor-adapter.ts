/**
 * Cursor agent adapter (V0 1+1+1 agent slot).
 * All process spawn goes through ExecutionRunner.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { probeHarnessCli } from "../adapters/drivers/cli-probe.js";
import {
  defaultExecutionRunner,
  type ExecutionRunner,
  type ExecutionRunnerResult,
} from "../execution-runner/index.js";
import type {
  AdapterHealth,
  AdapterInvokeRequest,
  CircuitAgentAdapter,
  NormalizedAdapterResult,
} from "./adapter-types.js";
import { harnessConsentGranted } from "../security/harness-consent.js";

function consentOk(): boolean {
  return harnessConsentGranted();
}

export class CursorCircuitAdapter implements CircuitAgentAdapter {
  readonly adapter_id = "cursor";

  constructor(private readonly runner: ExecutionRunner = defaultExecutionRunner) {}

  async healthCheck(): Promise<AdapterHealth> {
    const checked_at = new Date().toISOString();
    const probe = probeHarnessCli("cursor-agent");
    const limitations = [
      "V0 agent adapter slot — Cursor via cursor-agent CLI",
      "invoke requires EVOLVELOOP_HARNESS_CONSENT=true for real spawn",
      "All spawn routed through ExecutionRunner",
    ];
    if (!probe.available || !probe.path) {
      return {
        kind: "AdapterHealth",
        adapter_id: this.adapter_id,
        ok: false,
        code: "CLI_NOT_AVAILABLE",
        message: "cursor-agent not on PATH",
        checked_at,
        limitations,
      };
    }
    return {
      kind: "AdapterHealth",
      adapter_id: this.adapter_id,
      ok: true,
      code: consentOk() ? "OK" : "OK_NEEDS_CONSENT",
      message: consentOk()
        ? `cursor-agent available at ${probe.path}`
        : `cursor-agent available at ${probe.path}; set EVOLVELOOP_HARNESS_CONSENT=true to invoke`,
      cli_path: probe.path,
      checked_at,
      limitations,
    };
  }

  normalizeResult(
    runner: ExecutionRunnerResult,
    meta?: Partial<NormalizedAdapterResult>,
  ): NormalizedAdapterResult {
    const status =
      runner.status === "ok"
        ? "ok"
        : runner.status === "timeout"
          ? "timeout"
          : runner.status === "cancelled"
            ? "cancelled"
            : runner.status === "blocked"
              ? "blocked"
              : "failed";
    return {
      kind: "NormalizedAdapterResult",
      adapter_id: this.adapter_id,
      status,
      code: runner.code,
      message: runner.stderr || runner.stdout || runner.code,
      exit_code: runner.exit_code,
      stdout: runner.stdout,
      stderr: runner.stderr,
      duration_ms: runner.duration_ms,
      pid: runner.pid,
      pgid: runner.pgid,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      cost_provenance: "UNAVAILABLE",
      limitations: [...runner.limitations, "token_usage_not_reported_by_cli"],
      raw_runner: runner,
      ...meta,
    };
  }

  async invoke(req: AdapterInvokeRequest): Promise<NormalizedAdapterResult> {
    const health = await this.healthCheck();
    if (!health.ok || !health.cli_path) {
      return {
        kind: "NormalizedAdapterResult",
        adapter_id: this.adapter_id,
        status: "blocked",
        code: health.code,
        message: health.message,
        exit_code: null,
        stdout: "",
        stderr: health.message,
        duration_ms: 0,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        cost_provenance: "UNAVAILABLE",
        limitations: health.limitations,
      };
    }
    if (!consentOk()) {
      return {
        kind: "NormalizedAdapterResult",
        adapter_id: this.adapter_id,
        status: "blocked",
        code: "CONSENT_REQUIRED",
        message: "EVOLVELOOP_HARNESS_CONSENT=true required for real invoke",
        exit_code: null,
        stdout: "",
        stderr: "consent missing",
        duration_ms: 0,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        cost_provenance: "UNAVAILABLE",
        limitations: health.limitations,
      };
    }
    if (!existsSync(req.workspace_path)) {
      return {
        kind: "NormalizedAdapterResult",
        adapter_id: this.adapter_id,
        status: "blocked",
        code: "WORKSPACE_MISSING",
        message: `workspace missing: ${req.workspace_path}`,
        exit_code: null,
        stdout: "",
        stderr: "workspace missing",
        duration_ms: 0,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        cost_provenance: "UNAVAILABLE",
        limitations: health.limitations,
      };
    }

    const session_id = `sess-${randomUUID()}`;
    const promptDir = join(req.workspace_path, ".evolveloop", "harness-prompts");
    mkdirSync(promptDir, { recursive: true });
    const promptPath = join(promptDir, `${session_id}.md`);
    writeFileSync(
      promptPath,
      [
        `# EvolveLoop V0 circuit prompt`,
        ``,
        `- work_id: ${req.work_id}`,
        `- task_id: ${req.task_id}`,
        `- session_id: ${session_id}`,
        ``,
        req.prompt,
        ``,
        `Stay inside the workspace. Do not modify tests or build scripts unless the Goal Contract explicitly authorizes it.`,
        ``,
      ].join("\n"),
      "utf-8",
    );

    const args = [
      health.cli_path,
      "-p",
      "--output-format",
      "text",
      "--trust",
      "--workspace",
      req.workspace_path,
    ];
    if (req.cli_mode === "ask" || req.cli_mode === "plan") {
      args.push("--mode", req.cli_mode);
    } else if (req.force_tools !== false) {
      args.push("--force");
    }
    args.push(
      `Read the prompt file at ${promptPath} and complete the assigned task. Stay strictly inside the workspace.`,
    );

    const runnerResult = await this.runner.run({
      argv: args,
      cwd: req.workspace_path,
      workspace_root: req.workspace_path,
      // cursor-agent cold path is typically ~70–90s; keep headroom for large worktrees
      timeout_ms: req.timeout_ms ?? 300_000,
      // Harness auth needs real HOME; still scrubbed — only allowlisted keys (V0-SEC-03).
      inherit_home: true,
      env_extra_allowlist: [
        "HOME",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
        "XDG_CACHE_HOME",
        "CURSOR_API_KEY",
        "CURSOR_API_ENDPOINT",
        "TERM",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "NODE_EXTRA_CA_CERTS",
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "NO_PROXY",
      ],
      stdout_deny_patterns: [/api[_-]?key/i, /authorization:\s*bearer/i],
    });

    return this.normalizeResult(runnerResult, { session_id });
  }

  cancel(pid: number): { signalled: boolean; reason: string } {
    return this.runner.cancel(pid, "SIGTERM");
  }
}

/** Prefer Cursor; fall back probe only — Claude not selected unless Cursor absent. */
export async function selectV0AgentAdapter(
  runner?: ExecutionRunner,
): Promise<CircuitAgentAdapter> {
  const cursor = new CursorCircuitAdapter(runner);
  const health = await cursor.healthCheck();
  if (health.ok) return cursor;
  // Still return Cursor adapter so healthCheck failures remain honest/visible.
  return cursor;
}
