/**
 * V3.5 CLI command handlers — service, runtime, sandbox, harness, workspace, approvals.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { V3DataPaths } from "../v3/paths.js";
import { CoordinatorDaemon } from "../v3/coordinator/daemon.js";
import { ipcCall, ipcSocketPath, ensureIpcToken } from "../v3/coordinator/ipc.js";
import { SandboxManager } from "../v3/sandbox/manager.js";
import { listBuiltinProfiles, agentWorkspaceProfile } from "../v3/security/profiles.js";
import { runtimeDoctor } from "../v3/runtime/doctor.js";
import {
  inspectHarness,
  listHarnesses,
  listHarnessSessions,
} from "../v3/harness/runtime.js";
import { isAdapterId } from "../v3/adapters/catalog.js";
import { ApprovalStore } from "../v3/approvals/store.js";
import { IntegrationCoordinator } from "../v3/workspace/integration.js";
import { WorktreeManager } from "../v3/worktrees/index.js";

function print(obj: unknown) {
  console.log(JSON.stringify(obj, null, 2));
}

function systemdUnitPath(): string {
  const home = process.env.HOME ?? "/tmp";
  return join(home, ".config", "systemd", "user", "evolveloop-coordinator.service");
}

export async function handleV35Command(
  args: Record<string, string>,
  paths: V3DataPaths,
): Promise<boolean> {
  const group = args.group;
  const command = args.command;

  if (group === "service") {
    if (command === "install") {
      const unitDir = join(process.env.HOME ?? "/tmp", ".config", "systemd", "user");
      mkdirSync(unitDir, { recursive: true });
      const evolveJs = resolve(
        fileURLToPath(new URL(".", import.meta.url)),
        "evolve.js",
      );
      const unit = `[Unit]
Description=EvolveLoop V3.5 Coordinator Daemon
After=default.target

[Service]
Type=simple
ExecStart=${process.execPath} ${evolveJs} service foreground --data-dir ${paths.root}
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
`;
      const dest = systemdUnitPath();
      writeFileSync(dest, unit, "utf-8");
      print({
        installed: dest,
        notes: [
          "OPERATOR: run systemctl --user daemon-reload && systemctl --user enable --now evolveloop-coordinator.service",
          "If systemd --user unavailable, use: evolve service start (foreground child) or service foreground",
        ],
      });
      return true;
    }

    if (command === "foreground") {
      const daemon = new CoordinatorDaemon(paths.root);
      print({ starting: true, data_dir: paths.root });
      await daemon.serve();
      return true;
    }

    if (command === "start") {
      // Spawn detached child running foreground serve
      const evolveJs = resolve(fileURLToPath(new URL(".", import.meta.url)), "evolve.js");
      const child = spawn(
        process.execPath,
        [evolveJs, "service", "foreground", "--data-dir", paths.root],
        {
          detached: true,
          stdio: "ignore",
          env: process.env,
        },
      );
      child.unref();
      // Wait briefly for socket
      const sock = ipcSocketPath(paths.root);
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 100));
        if (existsSync(sock)) break;
      }
      try {
        const status = await ipcCall(paths.root, "status");
        print({ started: true, pid: child.pid, status: status.result });
      } catch (err) {
        print({ started: true, pid: child.pid, warning: String(err), socket: sock });
      }
      return true;
    }

    if (command === "status") {
      try {
        const res = await ipcCall(paths.root, "status");
        print(res.result ?? res);
      } catch (err) {
        print({
          lifecycle: "STOPPED",
          error: String(err),
          socket: ipcSocketPath(paths.root),
        });
        process.exitCode = 2;
      }
      return true;
    }

    if (command === "stop") {
      try {
        print(await ipcCall(paths.root, "shutdown"));
      } catch (err) {
        print({ error: String(err) });
        process.exitCode = 1;
      }
      return true;
    }

    if (command === "restart") {
      try {
        await ipcCall(paths.root, "shutdown");
        await new Promise((r) => setTimeout(r, 500));
      } catch {
        /* already down */
      }
      args.command = "start";
      return handleV35Command(args, paths);
    }

    if (command === "logs") {
      const daemonPath = join(paths.coordinatorDir, "daemon.json");
      if (!existsSync(daemonPath)) {
        print({ logs: [], note: "no daemon.json yet" });
        return true;
      }
      const st = JSON.parse(readFileSync(daemonPath, "utf-8"));
      print({ notes: st.notes ?? [], heartbeat_at: st.heartbeat_at, lifecycle: st.lifecycle });
      return true;
    }
  }

  if (group === "runtime") {
    if (command === "status") {
      try {
        print(await ipcCall(paths.root, "status").then((r) => r.result));
      } catch {
        print({ lifecycle: "STOPPED", data_dir: paths.root });
        process.exitCode = 2;
      }
      return true;
    }
    if (command === "doctor") {
      print(await runtimeDoctor(paths.root));
      return true;
    }
    if (command === "recover") {
      const daemon = new CoordinatorDaemon(paths.root);
      // One-shot reconcile without full serve
      try {
        const durable = await daemon.start();
        const recon = daemon.reconcileProcesses();
        await daemon.stop("recover_oneshot");
        print({ recovered: true, durable, recon });
      } catch (err) {
        // If leader exists, ask running daemon via IPC
        try {
          print({ via_ipc: true, status: (await ipcCall(paths.root, "status")).result });
        } catch {
          print({ error: String(err) });
          process.exitCode = 1;
        }
      }
      return true;
    }
  }

  if (group === "sandbox") {
    if (command === "status") {
      print(new SandboxManager().status());
      return true;
    }
    if (command === "profiles") {
      print({ profiles: listBuiltinProfiles() });
      return true;
    }
  }

  if (group === "harness") {
    if (command === "list") {
      print({ adapters: listHarnesses().map((a) => ({
        adapter_id: a.adapter_id,
        execution_bridge: a.execution_bridge,
        certification: a.certification,
      })) });
      return true;
    }
    if (command === "inspect") {
      const id = args.adapter ?? args.id;
      if (!id || !isAdapterId(id)) {
        console.error("Required: --adapter <cursor|claude-code|codex|antigravity>");
        process.exit(1);
      }
      print(inspectHarness(id));
      return true;
    }
    if (command === "sessions") {
      const workId = args.run ?? args["work-id"];
      if (!workId) {
        console.error("Required: --run <work_id>");
        process.exit(1);
      }
      print({ sessions: listHarnessSessions(paths, workId) });
      return true;
    }
    if (command === "matrix") {
      return false; // fall through to existing handler
    }
  }

  if (group === "workspace") {
    const integ = new IntegrationCoordinator(paths.workspacesDir);
    if (command === "list") {
      const workId = args.run ?? args["work-id"];
      const repoRoot = args.primary ? resolve(args.primary) : process.cwd();
      const wt = new WorktreeManager(paths, repoRoot);
      print({
        worktrees: workId ? wt.list(workId) : [],
        note: "workspace list uses worktree manager + integration records",
      });
      return true;
    }
    if (command === "inspect") {
      const id = args.workspace_id ?? args.id;
      if (!id) {
        console.error("Required: --id <workspace_id>");
        process.exit(1);
      }
      print(integ.get(id) ?? { error: "not_found" });
      return true;
    }
    if (command === "diff") {
      const id = args.workspace_id ?? args.id;
      const rec = id ? integ.get(id) : undefined;
      if (!rec) {
        console.error("Required: known --id <workspace_id>");
        process.exit(1);
      }
      print({ diff: integ.diff(rec.workspace_path, rec.base_commit) });
      return true;
    }
    if (command === "integrate") {
      const id = args.workspace_id ?? args.id;
      if (!id || !args.primary) {
        console.error("Required: --id <workspace_id> --primary <repo>");
        process.exit(1);
      }
      print(
        integ.integrate({
          workspace_id: id,
          primary_repo: resolve(args.primary),
          test_argv: args["test-cmd"] ? args["test-cmd"].split(" ") : undefined,
        }),
      );
      return true;
    }
    if (command === "rollback") {
      const id = args.workspace_id ?? args.id;
      if (!id || !args.primary) {
        console.error("Required: --id <workspace_id> --primary <repo>");
        process.exit(1);
      }
      print(integ.rollback(id, resolve(args.primary)));
      return true;
    }
  }

  if (group === "approvals") {
    const store = new ApprovalStore(paths.approvalsDir);
    ensureIpcToken(paths.root);
    if (command === "list") {
      try {
        const via = await ipcCall(paths.root, "approvals.list", {
          work_id: args.run ?? args["work-id"],
          state: args.state,
        });
        if (via.ok) {
          print({ approvals: via.result });
          return true;
        }
      } catch {
        /* local fallback */
      }
      print({
        approvals: store.list({
          work_id: args.run ?? args["work-id"],
          state: args.state as never,
        }),
      });
      return true;
    }
    if (command === "inspect") {
      const id = args.approval_id ?? args.id;
      if (!id) {
        console.error("Required: --id <approval_id>");
        process.exit(1);
      }
      print(store.get(id) ?? { error: "not_found" });
      return true;
    }
    if (command === "approve") {
      const id = args.approval_id ?? args.id;
      if (!id) {
        console.error("Required: --id <approval_id>");
        process.exit(1);
      }
      try {
        const via = await ipcCall(paths.root, "approvals.approve", {
          approval_id: id,
          actor: args.actor ?? "cli",
          note: args.note,
        });
        if (via.ok) {
          print(via.result);
          return true;
        }
      } catch {
        /* local */
      }
      print(store.approve(id, args.actor ?? "cli", args.note));
      return true;
    }
    if (command === "reject") {
      const id = args.approval_id ?? args.id;
      if (!id) {
        console.error("Required: --id <approval_id>");
        process.exit(1);
      }
      try {
        const via = await ipcCall(paths.root, "approvals.reject", {
          approval_id: id,
          actor: args.actor ?? "cli",
          note: args.note,
        });
        if (via.ok) {
          print(via.result);
          return true;
        }
      } catch {
        /* local */
      }
      print(store.reject(id, args.actor ?? "cli", args.note));
      return true;
    }
  }

  // agents inspect extension
  if (group === "agents" && command === "inspect") {
    const id = args.agent_id ?? args.id;
    const workId = args.run ?? args["work-id"];
    if (!id || !workId) {
      console.error("Required: --id <agent_id> --run <work_id>");
      process.exit(1);
    }
    const { AgentRegistryStore } = await import("../v3/agent-registry/store.js");
    const reg = new AgentRegistryStore(paths.agentsDir);
    const file = reg.load(workId);
    const agent = file.agents.find((a) => a.agent_id === id);
    print(agent ?? { error: "not_found" });
    return true;
  }

  void agentWorkspaceProfile;
  return false;
}

export const V35_USAGE_GROUPS = {
  service: ["install", "start", "stop", "restart", "status", "logs", "foreground"],
  runtime: ["status", "doctor", "recover"],
  sandbox: ["status", "profiles"],
  harness: ["list", "inspect", "sessions", "matrix"],
  workspace: ["list", "inspect", "diff", "integrate", "rollback"],
  approvals: ["list", "inspect", "approve", "reject"],
};
