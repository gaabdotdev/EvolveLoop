/**
 * CLI process adapter driver — spawns external harness CLIs when present.
 * Default mode is dry-run (writes prompt package; no network) unless provider_mode=real
 * and EVOLVELOOP_HARNESS_CONSENT=true.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { V3DataPaths } from "../../paths.js";
import type { AdapterId } from "../types.js";
import type {
  AdapterInvokeRequest,
  AdapterInvokeResult,
  AgentAdapterDriver,
} from "./types.js";
import { probeHarnessCli, type HarnessCliId } from "./cli-probe.js";
import { ProcessSessionStore } from "./process-sessions.js";

export interface CliProcessDriverConfig {
  adapter_id: AdapterId;
  cli_id: HarnessCliId;
  buildArgs: (promptPath: string, request: AdapterInvokeRequest) => string[];
  notes: string[];
}

function consentOk(): boolean {
  return process.env.EVOLVELOOP_HARNESS_CONSENT === "true";
}

export class CliProcessAdapterDriver implements AgentAdapterDriver {
  readonly adapter_id: AdapterId;
  readonly can_invoke: boolean;
  private readonly cfg: CliProcessDriverConfig;

  constructor(cfg: CliProcessDriverConfig) {
    this.cfg = cfg;
    this.adapter_id = cfg.adapter_id;
    const probe = probeHarnessCli(cfg.cli_id);
    this.can_invoke = probe.available;
  }

  describe() {
    const probe = probeHarnessCli(this.cfg.cli_id);
    return {
      adapter_id: this.adapter_id,
      can_invoke: probe.available,
      notes: [
        ...this.cfg.notes,
        probe.available
          ? `cli=${probe.path} version_hint=${probe.version_hint ?? "n/a"}`
          : "cli not on PATH — invoke returns blocked",
        "real spawn requires provider_mode=real + EVOLVELOOP_HARNESS_CONSENT=true",
        "dry-run writes prompt package under --data-dir/harness-prompts without calling network",
      ],
    };
  }

  async invoke(paths: V3DataPaths, request: AdapterInvokeRequest): Promise<AdapterInvokeResult> {
    const probe = probeHarnessCli(this.cfg.cli_id);
    const notes = this.describe().notes;
    if (!probe.available || !probe.path) {
      return {
        kind: "AdapterInvokeResult",
        adapter_id: this.adapter_id,
        status: "blocked",
        code: "CLI_NOT_AVAILABLE",
        message: `${this.cfg.cli_id} not on PATH`,
        limitations: notes,
      };
    }
    const cliPath = probe.path;

    const promptDir = join(paths.root, "harness-prompts", request.work_id);
    mkdirSync(promptDir, { recursive: true });
    const session_id = `sess-${randomUUID()}`;
    const promptPath = join(promptDir, `${session_id}.md`);
    const body = [
      `# EvolveLoop harness prompt`,
      ``,
      `- adapter: ${this.adapter_id}`,
      `- work_id: ${request.work_id}`,
      `- task_id: ${request.task_id}`,
      `- agent_id: ${request.agent_id ?? ""}`,
      `- session_id: ${session_id}`,
      ``,
      request.note ?? "Continue from Handoff Package / TaskGraph verified state. Do not redo TRUE_PASS work.",
      ``,
    ].join("\n");
    writeFileSync(promptPath, body, "utf-8");

    const sessions = new ProcessSessionStore(join(paths.root, "process-sessions"));
    const mode = request.provider_mode ?? "mock";

    if (mode !== "real" || !consentOk()) {
      const rec = {
        kind: "ProcessSessionRecord" as const,
        session_id,
        work_id: request.work_id,
        task_id: request.task_id,
        adapter_id: this.adapter_id,
        status: "dry_run" as const,
        started_at: new Date().toISOString(),
        command: [cliPath, ...this.cfg.buildArgs(promptPath, request)],
        prompt_path: promptPath,
        limitations: notes,
      };
      sessions.upsert(rec);
      return {
        kind: "AdapterInvokeResult",
        adapter_id: this.adapter_id,
        status: "accepted",
        code: "DRY_RUN_PROMPT_WRITTEN",
        message: `prompt=${promptPath}`,
        bridge_ref: session_id,
        limitations: notes,
      };
    }

    const args = this.cfg.buildArgs(promptPath, request);
    // Detached process group for tree cancel; env allowlist (not full process.env).
    const child = spawn(cliPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: process.env.LANG,
        // Scoped secrets only when already present — never dump full env
        ...(process.env.ANTHROPIC_API_KEY
          ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY }
          : {}),
        ...(process.env.OPENAI_API_KEY ? { OPENAI_API_KEY: process.env.OPENAI_API_KEY } : {}),
      },
    });

    const started_at = new Date().toISOString();
    let rec: import("./process-sessions.js").ProcessSessionRecord = {
      kind: "ProcessSessionRecord",
      session_id,
      work_id: request.work_id,
      task_id: request.task_id,
      adapter_id: this.adapter_id,
      pid: child.pid,
      status: "running",
      started_at,
      command: [cliPath, ...args],
      prompt_path: promptPath,
      limitations: [
        ...notes,
        "detached_pgid_for_tree_cancel",
        "env_allowlist_not_full_process_env",
      ],
    };
    sessions.upsert(rec);
    if (child.pid != null) {
      rec = sessions.attachIdentity(rec, child.pid);
    }

    // Non-blocking accept — supervisor/operator can cancel via process-sessions
    child.on("exit", (code) => {
      sessions.upsert({
        ...rec,
        status: "exited",
        ended_at: new Date().toISOString(),
        exit_code: code ?? null,
      });
    });

    return {
      kind: "AdapterInvokeResult",
      adapter_id: this.adapter_id,
      status: "accepted",
      code: "PROCESS_SPAWNED",
      message: `pid=${child.pid} session=${session_id}`,
      bridge_ref: session_id,
      limitations: notes,
    };
  }
}

export function cancelHarnessSession(
  paths: V3DataPaths,
  workId: string,
  sessionId: string,
): ReturnType<ProcessSessionStore["cancel"]> {
  const store = new ProcessSessionStore(join(paths.root, "process-sessions"));
  return store.cancel(workId, sessionId);
}

export function listHarnessSessions(paths: V3DataPaths, workId: string) {
  return new ProcessSessionStore(join(paths.root, "process-sessions")).load(workId);
}

export function assertPromptWritten(path: string): boolean {
  return existsSync(path);
}
