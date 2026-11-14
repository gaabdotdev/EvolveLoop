/**
 * Worker Node Runtime — subordinate executor; never elevates global authority.
 * Execution uses V3.5 SandboxManager (bubblewrap) when the contract requires OS sandbox.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExecutionContract } from "../types.js";
import { discoverCapabilities, sampleResources } from "../capability/inventory.js";
import { EXECUTION_CONTRACT_SCHEMA, FABRIC_PROTOCOL_VERSION } from "../types.js";
import { SandboxManager } from "../../sandbox/manager.js";
import { agentWorkspaceProfile } from "../../security/profiles.js";

export interface ProcessSupervisionRecord {
  task_id: string;
  pid?: number;
  pgid?: number;
  start_time: string;
  sandbox_id?: string;
  exit_code?: number | null;
  tree_state: "starting" | "running" | "exited" | "killed" | "unknown";
  correlation_ids: Record<string, string>;
}

export interface WorkerRuntimeOptions {
  worker_node_id: string;
  workRoot: string;
  slots: number;
  /**
   * When true (default), contracts with sandbox_profile require OS sandbox.
   * Lab-only escape hatch: allowHostFallback=true disables fail-closed (never for production).
   */
  requireOsSandbox?: boolean;
  allowHostFallback?: boolean;
  sandboxManager?: SandboxManager;
}

export class WorkerRuntime {
  private slotsFree: number;
  private processes = new Map<string, { child: ChildProcess; supervision: ProcessSupervisionRecord }>();
  private outbox: unknown[] = [];
  private readonly sandbox: SandboxManager;
  private readonly requireOsSandbox: boolean;
  private readonly allowHostFallback: boolean;

  constructor(private readonly opts: WorkerRuntimeOptions) {
    this.slotsFree = opts.slots;
    this.requireOsSandbox = opts.requireOsSandbox !== false;
    this.allowHostFallback = opts.allowHostFallback === true;
    this.sandbox = opts.sandboxManager ?? new SandboxManager();
    mkdirSync(opts.workRoot, { recursive: true });
    mkdirSync(join(opts.workRoot, "outbox"), { recursive: true });
    mkdirSync(join(opts.workRoot, "workspaces"), { recursive: true });
  }

  inventory() {
    const caps = discoverCapabilities({ slots: this.opts.slots });
    const resources = sampleResources(this.opts.slots);
    resources.slots_free = this.slotsFree;
    resources.slots_total = this.opts.slots;
    return { caps, resources };
  }

  validateContract(contract: ExecutionContract): { ok: true } | { ok: false; reason: string } {
    if (contract.schema_version !== EXECUTION_CONTRACT_SCHEMA) return { ok: false, reason: "schema" };
    if (contract.protocol_version !== FABRIC_PROTOCOL_VERSION) return { ok: false, reason: "protocol" };
    if (contract.worker_node_id !== this.opts.worker_node_id) return { ok: false, reason: "wrong_node" };
    if (Date.parse(contract.deadline_at) <= Date.now()) return { ok: false, reason: "deadline" };
    if (!contract.lease_id || contract.fencing_epoch < 1) return { ok: false, reason: "lease_fencing" };
    const hash = hashContract(contract);
    if (hash !== contract.contract_hash) return { ok: false, reason: "contract_hash_mismatch" };
    return { ok: true };
  }

  async execute(
    contract: ExecutionContract,
    opts?: { command?: string[]; env?: Record<string, string> },
  ): Promise<{ status: "completed" | "failed" | "rejected"; supervision: ProcessSupervisionRecord; stdout?: string }> {
    const v = this.validateContract(contract);
    if (!v.ok) {
      return {
        status: "rejected",
        supervision: {
          task_id: contract.task_id,
          start_time: new Date().toISOString(),
          tree_state: "unknown",
          correlation_ids: { reject: v.reason },
        },
      };
    }
    if (this.slotsFree < 1) {
      return {
        status: "rejected",
        supervision: {
          task_id: contract.task_id,
          start_time: new Date().toISOString(),
          tree_state: "unknown",
          correlation_ids: { reject: "no_slots" },
        },
      };
    }
    this.slotsFree -= 1;
    const ws = join(this.opts.workRoot, "workspaces", contract.task_id);
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, "contract.json"), JSON.stringify(contract, null, 2));

    const cmd =
      opts?.command ??
      [process.execPath, "-e", "console.log('worker-task-ok:'+process.env.EL_TASK_ID);"];
    const supervision: ProcessSupervisionRecord = {
      task_id: contract.task_id,
      start_time: new Date().toISOString(),
      tree_state: "starting",
      correlation_ids: {
        workflow_id: contract.workflow_id,
        lease_id: contract.lease_id,
        fencing_epoch: String(contract.fencing_epoch),
      },
    };

    const profileName = contract.sandbox_profile ?? "";
    const needsSandbox =
      !this.allowHostFallback &&
      (contract.required_capabilities.includes("bubblewrap") ||
        (this.requireOsSandbox && profileName !== "" && profileName !== "none"));

    if (needsSandbox && !this.allowHostFallback) {
      const profile = agentWorkspaceProfile(ws);
      // Node/V8 needs more than the default 512MiB address-space cap inside bwrap.
      profile.process.memory_bytes = Math.max(profile.process.memory_bytes ?? 0, 2048 * 1024 * 1024);
      profile.secrets.env_allowlist = [
        ...new Set([
          ...profile.secrets.env_allowlist,
          "PATH",
          "EL_TASK_ID",
          "EL_WORKER_NODE_ID",
          "HOME",
          "TMPDIR",
        ]),
      ];
      // Ensure the Node runtime binary tree is visible inside bubblewrap (not always under /usr).
      const nodeBin = cmd[0] && cmd[0].startsWith("/") ? cmd[0] : process.execPath;
      for (const p of [nodeBin, dirname(nodeBin), dirname(dirname(nodeBin))]) {
        if (p && existsSync(p) && !profile.filesystem.read_only_paths.includes(p)) {
          profile.filesystem.read_only_paths.push(p);
        }
      }
      const result = await this.sandbox.exec({
        argv: cmd[0]?.startsWith("/") ? cmd : [process.execPath, ...cmd.slice(1)],
        cwd: ws,
        env: {
          EL_TASK_ID: contract.task_id,
          EL_WORKER_NODE_ID: this.opts.worker_node_id,
          PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
          ...(opts?.env ?? {}),
        },
        profile,
      });
      supervision.sandbox_id = result.backend_id;
      supervision.pid = result.pid;
      supervision.pgid = result.pgid;
      supervision.exit_code = result.exit_code;
      supervision.tree_state = result.blocked ? "unknown" : "exited";
      // Note (AUD-SBX-02): SandboxManager.exec is awaited to completion; mid-flight
      // cancel requires a future async supervision handle. Host-path cancel works via this.processes.
      this.slotsFree += 1;
      if (result.blocked) {
        supervision.correlation_ids.reject = result.block_reason ?? "sandbox_blocked";
        this.outbox.push({
          type: "task.result",
          task_id: contract.task_id,
          lease_id: contract.lease_id,
          fencing_epoch: contract.fencing_epoch,
          exit_code: null,
          blocked: true,
          block_reason: result.block_reason,
          at: new Date().toISOString(),
        });
        mkdirSync(join(this.opts.workRoot, "outbox"), { recursive: true });
        writeFileSync(
          join(this.opts.workRoot, "outbox", `${contract.task_id}.json`),
          JSON.stringify(this.outbox.at(-1), null, 2),
        );
        return { status: "failed", supervision, stdout: result.stderr || result.stdout };
      }
      const stdout = `${result.stdout}${result.stderr}`;
      this.outbox.push({
        type: "task.result",
        task_id: contract.task_id,
        lease_id: contract.lease_id,
        fencing_epoch: contract.fencing_epoch,
        exit_code: result.exit_code,
        sandbox_backend: result.backend_id,
        at: new Date().toISOString(),
      });
      mkdirSync(join(this.opts.workRoot, "outbox"), { recursive: true });
      writeFileSync(
        join(this.opts.workRoot, "outbox", `${contract.task_id}.json`),
        JSON.stringify(this.outbox.at(-1), null, 2),
      );
      return {
        status: result.exit_code === 0 ? "completed" : "failed",
        supervision,
        stdout,
      };
    }

    // Host path only for explicit sandbox_profile=none lab contracts.
    // Never inherit the full process environment (AUD-SBX-01).
    const scrubbedEnv: Record<string, string> = {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: ws,
      TMPDIR: "/tmp",
      EL_TASK_ID: contract.task_id,
      EL_WORKER_NODE_ID: this.opts.worker_node_id,
      ...(opts?.env ?? {}),
    };
    const child = spawn(cmd[0], cmd.slice(1), {
      cwd: ws,
      env: scrubbedEnv,
      detached: true,
    });
    supervision.pid = child.pid;
    try {
      supervision.pgid = child.pid ? process.getpgid?.(child.pid) : undefined;
    } catch {
      /* optional */
    }
    supervision.tree_state = "running";
    this.processes.set(contract.task_id, { child, supervision });

    const stdoutChunks: Buffer[] = [];
    child.stdout?.on("data", (c) => stdoutChunks.push(c));
    child.stderr?.on("data", (c) => stdoutChunks.push(c));

    const exitCode: number | null = await new Promise((resolve) => {
      child.on("exit", (code) => resolve(code));
    });
    supervision.exit_code = exitCode;
    supervision.tree_state = "exited";
    this.processes.delete(contract.task_id);
    this.slotsFree += 1;

    const stdout = Buffer.concat(stdoutChunks).toString("utf8");
    this.outbox.push({
      type: "task.result",
      task_id: contract.task_id,
      lease_id: contract.lease_id,
      fencing_epoch: contract.fencing_epoch,
      exit_code: exitCode,
      at: new Date().toISOString(),
    });
    mkdirSync(join(this.opts.workRoot, "outbox"), { recursive: true });
    writeFileSync(join(this.opts.workRoot, "outbox", `${contract.task_id}.json`), JSON.stringify(this.outbox.at(-1), null, 2));

    return {
      status: exitCode === 0 ? "completed" : "failed",
      supervision,
      stdout,
    };
  }

  cancel(taskId: string, force = false): boolean {
    const rec = this.processes.get(taskId);
    if (!rec) return false;
    try {
      if (rec.supervision.pid) {
        process.kill(-rec.supervision.pid, force ? "SIGKILL" : "SIGTERM");
      } else {
        rec.child.kill(force ? "SIGKILL" : "SIGTERM");
      }
      rec.supervision.tree_state = "killed";
      return true;
    } catch {
      return false;
    }
  }

  drainOutbox(): unknown[] {
    const items = [...this.outbox];
    this.outbox = [];
    return items;
  }
}

export function hashContract(contract: ExecutionContract): string {
  const { contract_hash: _h, ...rest } = contract;
  return createHash("sha256").update(stableStringify(rest)).digest("hex");
}

export function buildContract(
  partial: Omit<ExecutionContract, "kind" | "schema_version" | "protocol_version" | "contract_hash" | "issued_at" | "contract_id"> & {
    contract_id?: string;
  },
): ExecutionContract {
  const base: ExecutionContract = {
    kind: "ExecutionContract",
    schema_version: EXECUTION_CONTRACT_SCHEMA,
    protocol_version: FABRIC_PROTOCOL_VERSION,
    contract_id: partial.contract_id ?? `ec_${randomUUID()}`,
    contract_hash: "",
    workflow_id: partial.workflow_id,
    task_id: partial.task_id,
    goal_id: partial.goal_id,
    inputs: partial.inputs,
    dependency_refs: partial.dependency_refs,
    artifact_refs: partial.artifact_refs,
    required_capabilities: partial.required_capabilities,
    permissions: partial.permissions,
    budget: partial.budget,
    deadline_at: partial.deadline_at,
    sandbox_profile: partial.sandbox_profile,
    network_policy: partial.network_policy,
    worker_node_id: partial.worker_node_id,
    lease_id: partial.lease_id,
    fencing_epoch: partial.fencing_epoch,
    evidence_requirements: partial.evidence_requirements,
    retry_policy: partial.retry_policy,
    cancel_policy: partial.cancel_policy,
    issued_at: new Date().toISOString(),
  };
  base.contract_hash = hashContract(base);
  return base;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = sortValue(o[k]);
    return out;
  }
  return v;
}

// optional getpgid typing
declare global {
  namespace NodeJS {
    interface Process {
      getpgid?(pid: number): number;
    }
  }
}
