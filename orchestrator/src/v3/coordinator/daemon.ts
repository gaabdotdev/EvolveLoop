/**
 * Persistent Runtime Coordinator daemon — independent of CLI/TUI process.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CoordinatorService } from "./service.js";
import { ServiceLifecycle, type ServiceLifecycleState } from "./lifecycle.js";
import { LeaderLock } from "./leader-lock.js";
import { CoordinatorIpcServer, type IpcRequest } from "./ipc.js";
import { resolveV3DataPaths, type V3DataPaths } from "../paths.js";
import { ProcessSessionStore } from "../adapters/drivers/process-sessions.js";
import { listOrphans, type SupervisedProcessIdentity } from "../sandbox/process-supervisor.js";
import { ApprovalStore } from "../approvals/store.js";
import { ApprovalBroker } from "../approvals/broker.js";
import { SandboxManager } from "../sandbox/manager.js";
import { agentWorkspaceProfile } from "../security/profiles.js";
import type { CapabilityAction } from "../security/types.js";
import { applyDaemonApprovalActorWrite } from "../../v4/api/daemon-approvals.js";

export interface DaemonDurableState {
  kind: "CoordinatorDaemonState";
  lifecycle: ServiceLifecycleState;
  generation: number;
  fencing_token?: string;
  heartbeat_at?: string;
  socket_path?: string;
  notes: string[];
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

export class CoordinatorDaemon {
  readonly paths: V3DataPaths;
  readonly service: CoordinatorService;
  readonly lifecycle = new ServiceLifecycle();
  readonly approvals: ApprovalStore;
  /** Production ApprovalBroker — wired for IPC gate (ISSUE-SEC-C01). */
  readonly broker: ApprovalBroker;
  readonly sandbox: SandboxManager;
  private leader: LeaderLock;
  private ipc: CoordinatorIpcServer | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconcileTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private readonly durablePath: string;

  constructor(dataDir: string) {
    this.paths = resolveV3DataPaths(dataDir);
    this.service = new CoordinatorService(this.paths);
    this.approvals = new ApprovalStore(this.paths.approvalsDir);
    this.broker = new ApprovalBroker(this.approvals);
    this.sandbox = new SandboxManager(undefined, this.broker);
    this.leader = new LeaderLock(join(this.paths.coordinatorDir, "leader.lock"));
    this.durablePath = join(this.paths.coordinatorDir, "daemon.json");
  }

  loadDurable(): DaemonDurableState {
    if (!existsSync(this.durablePath)) {
      return {
        kind: "CoordinatorDaemonState",
        lifecycle: "STOPPED",
        generation: 0,
        notes: [],
      };
    }
    return JSON.parse(readFileSync(this.durablePath, "utf-8")) as DaemonDurableState;
  }

  private saveDurable(extra?: Partial<DaemonDurableState>): void {
    const prev = this.loadDurable();
    const next: DaemonDurableState = {
      ...prev,
      kind: "CoordinatorDaemonState",
      lifecycle: this.lifecycle.getState(),
      generation: this.lifecycle.getGeneration(),
      heartbeat_at: new Date().toISOString(),
      notes: (extra?.notes ?? prev.notes).slice(-50),
      fencing_token: extra?.fencing_token ?? prev.fencing_token,
      socket_path: extra?.socket_path ?? prev.socket_path,
      ...extra,
    };
    // Ensure lifecycle/generation always from live FSM after spread
    next.lifecycle = this.lifecycle.getState();
    next.generation = this.lifecycle.getGeneration();
    atomicWrite(this.durablePath, JSON.stringify(next, null, 2));
  }

  private async handleIpc(req: IpcRequest): Promise<unknown> {
    switch (req.method) {
      case "ping":
        return { pong: true, lifecycle: this.lifecycle.getState(), pid: process.pid };
      case "status":
        return this.status();
      case "tick": {
        const workId = String(req.params?.work_id ?? "");
        if (!workId) throw new Error("work_id_required");
        return this.service.tick(workId);
      }
      case "approvals.list":
        return this.approvals.list({
          work_id: req.params?.work_id ? String(req.params.work_id) : undefined,
          state: req.params?.state as never,
        });
      case "approvals.approve": {
        const id = String(req.params?.approval_id ?? "");
        const note = req.params?.note ? String(req.params.note) : undefined;
        return applyDaemonApprovalActorWrite("approve", req.params, (actor) =>
          this.approvals.approve(id, actor, note),
        );
      }
      case "approvals.reject": {
        const id = String(req.params?.approval_id ?? "");
        const note = req.params?.note ? String(req.params.note) : undefined;
        return applyDaemonApprovalActorWrite("reject", req.params, (actor) =>
          this.approvals.reject(id, actor, note),
        );
      }
      case "approvals.gate": {
        // Production gate: sensitive ops must pass ApprovalBroker (SEC-C01).
        const workId = String(req.params?.work_id ?? "");
        const action = String(req.params?.action ?? "") as CapabilityAction;
        const resource = String(req.params?.resource ?? "");
        const justification = String(req.params?.justification ?? "ipc_gate");
        const approvalId = req.params?.approval_id ? String(req.params.approval_id) : undefined;
        if (!workId || !action || !resource) throw new Error("work_id_action_resource_required");
        const profile = agentWorkspaceProfile(this.paths.root);
        return this.sandbox.gateAction(profile, action, {
          work_id: workId,
          resource,
          justification,
          approval_id: approvalId,
          task_id: req.params?.task_id ? String(req.params.task_id) : undefined,
          agent_id: req.params?.agent_id ? String(req.params.agent_id) : undefined,
        });
      }
      case "shutdown":
        setImmediate(() => {
          void this.stop("ipc_shutdown");
        });
        return { shutting_down: true };
      default:
        throw new Error(`unknown_method:${req.method}`);
    }
  }

  status(): Record<string, unknown> {
    const durable = this.loadDurable();
    const coord = this.service.loadState();
    return {
      lifecycle: this.lifecycle.getState(),
      generation: this.lifecycle.getGeneration(),
      fencing_token: durable.fencing_token,
      heartbeat_at: durable.heartbeat_at,
      socket_path: durable.socket_path,
      coordinator: {
        process_state: coord.process_state,
        pid: coord.pid,
        works: coord.works.length,
      },
      pid: process.pid,
    };
  }

  async start(): Promise<DaemonDurableState> {
    const disk = this.loadDurable();
    const recovering =
      disk.lifecycle === "RUNNING" ||
      disk.lifecycle === "DEGRADED" ||
      disk.lifecycle === "STARTING" ||
      disk.lifecycle === "RECOVERING";

    if (recovering) {
      this.lifecycle.restore(disk.lifecycle === "RECOVERING" ? "RUNNING" : disk.lifecycle);
    } else {
      this.lifecycle.transition("STARTING");
    }

    const lock = this.leader.tryAcquire(this.lifecycle.getGeneration() || 1);
    if (!lock) {
      if (this.lifecycle.getState() === "STARTING") {
        this.lifecycle.transition("CRASHED", "leader_exists");
      } else if (this.lifecycle.canTransition("CRASHED")) {
        this.lifecycle.transition("CRASHED", "leader_exists");
      }
      this.saveDurable({ notes: [...disk.notes, "duplicate_coordinator_blocked"] });
      throw new Error("LEADER_EXISTS");
    }

    this.service.start();
    this.ipc = new CoordinatorIpcServer(this.paths.root, (req) => this.handleIpc(req), {
      epochProvider: () => this.lifecycle.getGeneration(),
    });
    const socket_path = await this.ipc.start();
    this.reconcileProcesses();

    if (this.lifecycle.getState() === "RECOVERING") {
      this.lifecycle.transition("RUNNING", "recovered");
    } else if (this.lifecycle.getState() === "STARTING") {
      this.lifecycle.transition("RUNNING");
    }

    this.saveDurable({
      fencing_token: lock.fencing_token,
      socket_path,
      notes: [...disk.notes, `started gen=${this.lifecycle.getGeneration()}`],
    });

    this.heartbeatTimer = setInterval(() => {
      this.saveDurable({});
    }, 2000);
    if (typeof this.heartbeatTimer.unref === "function") this.heartbeatTimer.unref();

    this.reconcileTimer = setInterval(() => {
      try {
        this.reconcileProcesses();
        if (this.lifecycle.getState() === "DEGRADED" && this.lifecycle.canTransition("RUNNING")) {
          this.lifecycle.transition("RUNNING", "reconcile_ok");
        }
      } catch {
        if (this.lifecycle.getState() === "RUNNING" && this.lifecycle.canTransition("DEGRADED")) {
          this.lifecycle.transition("DEGRADED", "reconcile_error");
          this.saveDurable({});
        }
      }
    }, 5000);
    if (typeof this.reconcileTimer.unref === "function") this.reconcileTimer.unref();

    return this.loadDurable();
  }

  reconcileProcesses(): { live: number; gone: number; reused: number } {
    const sessionsDir = this.paths.processSessionsDir;
    mkdirSync(sessionsDir, { recursive: true });
    const store = new ProcessSessionStore(sessionsDir);
    const works = this.service.loadState().works;
    let live = 0;
    let gone = 0;
    let reused = 0;
    for (const w of works) {
      const sessions = store.load(w.work_id);
      const owned: SupervisedProcessIdentity[] = [];
      for (const s of sessions) {
        if (s.status === "running" && s.pid != null && s.starttime) {
          owned.push({
            pid: s.pid,
            pgid: s.pgid ?? s.pid,
            starttime: s.starttime,
            cmdline: (s.command ?? []).join(" "),
          });
        }
      }
      const result = listOrphans(owned);
      live += result.live.length;
      gone += result.gone.length;
      reused += result.reused.length;
      for (const g of [...result.gone, ...result.reused]) {
        const rec = sessions.find((s) => s.pid === g.pid && s.starttime === g.starttime);
        if (rec && rec.status === "running") {
          rec.status = "exited";
          rec.ended_at = new Date().toISOString();
          store.upsert(rec);
        }
      }
      store.reconcile(w.work_id);
    }
    return { live, gone, reused };
  }

  async stop(reason = "stop"): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.lifecycle.canTransition("STOPPING")) {
      this.lifecycle.transition("STOPPING", reason);
    }
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    if (this.ipc) await this.ipc.stop();
    this.service.stop(reason);
    this.leader.release();
    if (this.lifecycle.canTransition("STOPPED")) {
      this.lifecycle.transition("STOPPED", reason);
    }
    this.saveDurable({ notes: [...this.loadDurable().notes, `stopped:${reason}`] });
    this.stopping = false;
  }

  /** Foreground serve — keeps process alive until signal. */
  async serve(): Promise<void> {
    await this.start();
    await new Promise<void>((resolve) => {
      const onSignal = () => {
        void this.stop("signal").then(() => resolve());
      };
      process.once("SIGINT", onSignal);
      process.once("SIGTERM", onSignal);
    });
  }
}
