/**
 * Live harness invokers — Cursor Agent / Claude Code.
 * Never invents credentials; callers gate on readiness + consent.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { probeHarnessCli } from "../../adapters/drivers/cli-probe.js";

export type LiveHarnessId = "cursor-agent" | "claude-code";

export interface HarnessInvokeResult {
  status: "spawned" | "dry_run" | "blocked" | "failed";
  harness_id: LiveHarnessId | "none";
  output: string;
  session_id: string;
  duration_ms: number;
  exit_code: number | null;
}

export function resolveCursorAgentBin(): string | null {
  const p = probeHarnessCli("cursor-agent");
  return p.available && p.path ? p.path : null;
}

export function cursorAgentLoggedIn(): { loggedIn: boolean; detail: string } {
  const bin = resolveCursorAgentBin();
  if (!bin) return { loggedIn: false, detail: "cursor-agent cli absent" };
  try {
    const r = spawnSync(bin, ["status"], { encoding: "utf-8", timeout: 20_000, env: process.env });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    if (/Logged in as/i.test(out) || /✓\s*Logged in/i.test(out)) {
      return {
        loggedIn: true,
        detail: out.split("\n").find((l) => /Logged in/i.test(l))?.trim() ?? "logged_in",
      };
    }
    return { loggedIn: false, detail: "cursor-agent status: not logged in" };
  } catch (e) {
    return { loggedIn: false, detail: `cursor-agent status failed: ${String(e)}` };
  }
}

/** Short can-start smoke in ask mode (read-only, no MCP write tools). */
export function smokeCursorAgentCanStart(): { ok: boolean; detail: string; duration_ms: number } {
  const bin = resolveCursorAgentBin();
  if (!bin) return { ok: false, detail: "cli absent", duration_ms: 0 };
  const t0 = Date.now();
  const r = spawnSync(
    bin,
    [
      "-p",
      "--mode",
      "ask",
      "--trust",
      "--output-format",
      "text",
      "Reply with exactly one word: READY",
    ],
    {
      encoding: "utf-8",
      timeout: 180_000,
      env: { ...process.env, CURSOR_AGENT_NO_MCP: "1" },
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  const duration_ms = Date.now() - t0;
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (r.error) {
    return { ok: false, detail: `smoke_error:${r.error.message}`, duration_ms };
  }
  if (r.status !== 0 && !/READY/i.test(out)) {
    return { ok: false, detail: `smoke_failed:status=${r.status}:${out.slice(0, 300)}`, duration_ms };
  }
  if (!/READY/i.test(out)) {
    return { ok: false, detail: `unexpected_smoke_output:${out.slice(0, 200)}`, duration_ms };
  }
  return { ok: true, detail: "cursor-agent ask-mode smoke READY", duration_ms };
}

export function invokeLiveHarness(input: {
  harness: LiveHarnessId;
  prompt: string;
  real: boolean;
  outDir: string;
  label: string;
  workspace?: string;
  timeoutMs?: number;
  /** ask = read-only reviewer/smoke; omit for engineering writes */
  mode?: "ask" | "plan";
}): HarnessInvokeResult {
  const session_id = `live-${input.label}-${randomUUID().slice(0, 8)}`;
  mkdirSync(input.outDir, { recursive: true });
  const promptPath = join(input.outDir, `${session_id}.md`);
  writeFileSync(promptPath, input.prompt, "utf-8");

  if (!input.real) {
    return {
      status: "dry_run",
      harness_id: input.harness,
      output: `DRY_RUN prompt written to ${promptPath}`,
      session_id,
      duration_ms: 0,
      exit_code: null,
    };
  }

  const t0 = Date.now();
  if (input.harness === "cursor-agent") {
    const bin = resolveCursorAgentBin();
    if (!bin) {
      return {
        status: "blocked",
        harness_id: "cursor-agent",
        output: "cursor-agent missing",
        session_id,
        duration_ms: 0,
        exit_code: null,
      };
    }
    const args = [
      "-p",
      "--trust",
      "--output-format",
      "text",
      ...(input.mode ? ["--mode", input.mode] : ["--force"]),
      ...(input.workspace ? ["--workspace", input.workspace] : []),
      // Prefer prompt file reference when long; CLI takes prompt as argv
      input.prompt.length > 12_000
        ? `Read the task file at ${promptPath} and execute it. Workspace is ${input.workspace ?? process.cwd()}.`
        : input.prompt,
    ];
    const r = spawnSync(bin, args, {
      encoding: "utf-8",
      timeout: input.timeoutMs ?? 600_000,
      env: process.env,
      maxBuffer: 8 * 1024 * 1024,
      cwd: input.workspace ?? process.cwd(),
    });
    const duration_ms = Date.now() - t0;
    const combined = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
    if (r.error) {
      return {
        status: "failed",
        harness_id: "cursor-agent",
        output: String(r.error).slice(0, 8000),
        session_id,
        duration_ms,
        exit_code: null,
      };
    }
    if (r.status !== 0 && !(r.stdout ?? "").trim()) {
      return {
        status: "failed",
        harness_id: "cursor-agent",
        output: combined.slice(0, 8000),
        session_id,
        duration_ms,
        exit_code: r.status,
      };
    }
    return {
      status: "spawned",
      harness_id: "cursor-agent",
      output: (r.stdout ?? combined).slice(0, 12000),
      session_id,
      duration_ms,
      exit_code: r.status,
    };
  }

  // claude-code
  const r = spawnSync("claude", ["-p", input.prompt, "--output-format", "text"], {
    encoding: "utf-8",
    timeout: input.timeoutMs ?? 180_000,
    env: process.env,
    maxBuffer: 4 * 1024 * 1024,
    cwd: input.workspace,
  });
  const duration_ms = Date.now() - t0;
  if (r.error || r.status !== 0) {
    return {
      status: "failed",
      harness_id: "claude-code",
      output: `${r.stderr ?? ""}\n${r.stdout ?? ""}\n${r.error ?? ""}`.slice(0, 8000),
      session_id,
      duration_ms,
      exit_code: r.status,
    };
  }
  return {
    status: "spawned",
    harness_id: "claude-code",
    output: (r.stdout ?? "").slice(0, 12000),
    session_id,
    duration_ms,
    exit_code: r.status,
  };
}
