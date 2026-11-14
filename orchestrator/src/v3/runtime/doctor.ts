/**
 * evolve runtime doctor — capability checks with PASS|WARNING|FAIL|BLOCKED|UNAVAILABLE.
 */

import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { SandboxManager } from "../sandbox/manager.js";
import { which } from "../sandbox/which.js";
import { harnessDoctor, inspectHarness } from "../harness/runtime.js";
import { ipcSocketPath, ipcCall, ensureIpcToken } from "../coordinator/ipc.js";
import { resolveV3DataPaths } from "../paths.js";
import { agentWorkspaceProfile } from "../security/profiles.js";
import { probeAllHarnessClis } from "../adapters/drivers/cli-probe.js";

export type DoctorStatus = "PASS" | "WARNING" | "FAIL" | "BLOCKED" | "UNAVAILABLE";

export interface DoctorCheck {
  id: string;
  status: DoctorStatus;
  detail: string;
  required: boolean;
}

async function checkSandboxLive(): Promise<DoctorCheck> {
  const bwrap = which("bwrap");
  if (!bwrap) {
    return {
      id: "sandbox_bubblewrap",
      status: "FAIL",
      detail: "bwrap not on PATH — required for Linux OS sandbox",
      required: true,
    };
  }
  const ws = mkdtempSync(join(tmpdir(), "el-doctor-sb-"));
  writeFileSync(join(ws, "ping.txt"), "pong");
  try {
    const res = await new SandboxManager().exec({
      argv: ["/bin/cat", join(ws, "ping.txt")],
      profile: agentWorkspaceProfile(ws),
      env: { PATH: "/bin:/usr/bin" },
    });
    if (res.blocked) {
      return {
        id: "sandbox_bubblewrap",
        status: "FAIL",
        detail: `blocked:${res.block_reason}`,
        required: true,
      };
    }
    if (res.exit_code !== 0 || !res.stdout.includes("pong")) {
      return {
        id: "sandbox_bubblewrap",
        status: "FAIL",
        detail: `exec_failed exit=${res.exit_code}`,
        required: true,
      };
    }
    return {
      id: "sandbox_bubblewrap",
      status: "PASS",
      detail: "live bwrap exec OK",
      required: true,
    };
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
}

export async function runtimeDoctor(dataDir: string): Promise<{
  kind: "RuntimeDoctorReport";
  checked_at: string;
  checks: DoctorCheck[];
  summary: { pass: number; fail: number; warning: number; blocked: number; unavailable: number };
  raw: Record<string, unknown>;
}> {
  const paths = resolveV3DataPaths(dataDir);
  const checks: DoctorCheck[] = [];

  checks.push({
    id: "platform_linux",
    status: process.platform === "linux" ? "PASS" : "UNAVAILABLE",
    detail: process.platform,
    required: true,
  });

  checks.push(await checkSandboxLive());

  checks.push({
    id: "prlimit",
    status: which("prlimit") ? "PASS" : "WARNING",
    detail: which("prlimit")
      ? "available for RLIMIT caps"
      : "absent — timeout/output only",
    required: false,
  });

  checks.push({
    id: "cgroup_v2",
    status: existsSync("/sys/fs/cgroup/cgroup.controllers") ? "PASS" : "WARNING",
    detail: "present for future controllers; not required for bubblewrap path",
    required: false,
  });

  const sock = ipcSocketPath(dataDir);
  const leader = join(paths.coordinatorDir, "leader.lock");
  if (existsSync(sock)) {
    try {
      ensureIpcToken(dataDir);
      const ping = await ipcCall(dataDir, "ping", {}, 2000);
      checks.push({
        id: "coordinator_ipc",
        status: ping.ok ? "PASS" : "FAIL",
        detail: ping.ok ? "ping ok" : String(ping.error),
        required: false,
      });
    } catch (err) {
      checks.push({
        id: "coordinator_ipc",
        status: "FAIL",
        detail: `socket exists but ipc failed: ${String(err)}`,
        required: false,
      });
    }
  } else {
    checks.push({
      id: "coordinator_ipc",
      status: "UNAVAILABLE",
      detail: "daemon not running (optional until service start)",
      required: false,
    });
  }

  checks.push({
    id: "leader_lock_file",
    status: existsSync(leader) ? "WARNING" : "PASS",
    detail: existsSync(leader)
      ? "leader.lock present — verify live owner"
      : "no leader.lock",
    required: false,
  });

  const probes = probeAllHarnessClis();
  for (const p of probes) {
    checks.push({
      id: `harness_cli_${p.cli_id}`,
      status: p.available ? "PASS" : "UNAVAILABLE",
      detail: p.available ? p.path ?? "on_path" : p.error ?? "missing",
      required: false,
    });
  }

  // Auth status without revealing secrets
  const claudeAuth = spawnSync("claude", ["auth", "status"], { encoding: "utf-8", timeout: 5000 });
  let claudeLoggedIn = false;
  try {
    const j = JSON.parse(claudeAuth.stdout || "{}") as { loggedIn?: boolean };
    claudeLoggedIn = j.loggedIn === true;
  } catch {
    claudeLoggedIn = false;
  }
  checks.push({
    id: "harness_claude_auth",
    status: claudeLoggedIn ? "PASS" : "BLOCKED",
    detail: claudeLoggedIn ? "logged_in" : "not_logged_in — run claude /login for Gate H real LLM",
    required: false,
  });

  // cursor-agent session auth (preferred) OR CURSOR_API_KEY — either enables Gate H
  const agentStatus = spawnSync("agent", ["status"], { encoding: "utf-8", timeout: 8000 });
  const agentLoggedIn =
    agentStatus.status === 0 &&
    /logged in as/i.test(agentStatus.stdout || agentStatus.stderr || "");
  const cursorApiKeySet = !!process.env.CURSOR_API_KEY;
  checks.push({
    id: "harness_cursor_agent_session",
    status: agentLoggedIn ? "PASS" : "BLOCKED",
    detail: agentLoggedIn
      ? "agent status reports logged-in session (email redacted)"
      : "agent session not logged in — run agent login",
    required: false,
  });
  checks.push({
    id: "harness_cursor_api_key",
    status: cursorApiKeySet ? "PASS" : agentLoggedIn ? "PASS" : "BLOCKED",
    detail: cursorApiKeySet
      ? "CURSOR_API_KEY set (value redacted)"
      : agentLoggedIn
        ? "CURSOR_API_KEY unset but session auth present — Gate H eligible via agent login"
        : "CURSOR_API_KEY unset and no agent session — agent real path blocked",
    required: false,
  });

  checks.push({
    id: "consent_flag",
    status: process.env.EVOLVELOOP_HARNESS_CONSENT === "true" ? "WARNING" : "PASS",
    detail:
      process.env.EVOLVELOOP_HARNESS_CONSENT === "true"
        ? "consent enabled in this process — keep scoped to validation"
        : "consent not set (dry-run default)",
    required: false,
  });

  // ISSUE-SEC-C02: never claim OS isolation PASS for live harness path
  const requireHarnessSandbox = process.env.EVOLVELOOP_REQUIRE_HARNESS_SANDBOX === "true";
  checks.push({
    id: "harness_os_sandbox",
    status: requireHarnessSandbox ? "PASS" : "WARNING",
    detail: requireHarnessSandbox
      ? "EVOLVELOOP_REQUIRE_HARNESS_SANDBOX=true — live harness spawn is blocked (fail-closed)"
      : "live harness CLI spawn is OUTSIDE bubblewrap (session auth/HOME); OS isolation PASS must not be claimed for this path",
    required: false,
  });

  // Probe live wiring — do not claim PASS from documentation alone (independent re-audit residual).
  try {
    const { CoordinatorDaemon } = await import("../coordinator/daemon.js");
    const probeDir = mkdtempSync(join(tmpdir(), "el-doctor-broker-"));
    const daemon = new CoordinatorDaemon(probeDir);
    const wired =
      !!daemon.broker && daemon.sandbox.status().approval_broker_wired === true;
    const gate = daemon.sandbox.gateAction(
      agentWorkspaceProfile(probeDir),
      "package.install",
      { work_id: "doctor", resource: "npm:probe", justification: "doctor_probe" },
    );
    const gateOk = gate.status === "pending_approval" || gate.status === "deny";
    rmSync(probeDir, { recursive: true, force: true });
    checks.push({
      id: "approval_broker_production",
      status: wired && gateOk ? "PASS" : "FAIL",
      detail: wired && gateOk
        ? `broker wired; gateAction=${gate.status}`
        : `broker_wired=${wired} gateAction=${gate.status}`,
      required: true,
    });
  } catch (err) {
    checks.push({
      id: "approval_broker_production",
      status: "FAIL",
      detail: `probe_failed:${String(err)}`,
      required: true,
    });
  }

  checks.push({
    id: "control_plane_dual_evolve",
    status: process.env.EVOLVELOOP_CONTROL_PLANE ? "PASS" : "WARNING",
    detail: process.env.EVOLVELOOP_CONTROL_PLANE
      ? `explicit plane=${process.env.EVOLVELOOP_CONTROL_PLANE}`
      : "dual surfaces exist: Cursor /evolve→run-engine vs product `evolve` CLI — set EVOLVELOOP_CONTROL_PLANE=v3_product_cli|execution_engine|cursor_pda",
    required: false,
  });

  if (process.env.EVOLVELOOP_ALLOW_HOST_FALLBACK === "true") {
    checks.push({
      id: "insecure_host_fallback",
      status: "FAIL",
      detail: "EVOLVELOOP_ALLOW_HOST_FALLBACK=true is forbidden for secure profiles",
      required: true,
    });
  }

  const gitOk = spawnSync("git", ["--version"], { encoding: "utf-8" });
  checks.push({
    id: "git",
    status: gitOk.status === 0 ? "PASS" : "FAIL",
    detail: (gitOk.stdout || gitOk.stderr || "").trim(),
    required: true,
  });

  checks.push({
    id: "approvals_dir",
    status: existsSync(paths.approvalsDir) ? "PASS" : "WARNING",
    detail: paths.approvalsDir,
    required: false,
  });

  // Orphan hint: process-sessions with running status
  let orphans = 0;
  if (existsSync(paths.processSessionsDir)) {
    try {
      const { readdirSync } = await import("node:fs");
      for (const f of readdirSync(paths.processSessionsDir)) {
        if (!f.endsWith(".json")) continue;
        const sessions = JSON.parse(
          readFileSync(join(paths.processSessionsDir, f), "utf-8"),
        ) as Array<{ status: string; pid?: number }>;
        for (const s of sessions) {
          if (s.status === "running" && s.pid != null && !existsSync(`/proc/${s.pid}`)) {
            orphans += 1;
          }
        }
      }
    } catch {
      /* */
    }
  }
  checks.push({
    id: "orphan_process_sessions",
    status: orphans === 0 ? "PASS" : "WARNING",
    detail: `stale_running_records=${orphans}`,
    required: false,
  });

  try {
    inspectHarness("claude-code");
    checks.push({
      id: "harness_contract_claude",
      status: "PASS",
      detail: "contract inspect OK",
      required: false,
    });
  } catch (err) {
    checks.push({
      id: "harness_contract_claude",
      status: "FAIL",
      detail: String(err),
      required: false,
    });
  }

  const summary = {
    pass: checks.filter((c) => c.status === "PASS").length,
    fail: checks.filter((c) => c.status === "FAIL").length,
    warning: checks.filter((c) => c.status === "WARNING").length,
    blocked: checks.filter((c) => c.status === "BLOCKED").length,
    unavailable: checks.filter((c) => c.status === "UNAVAILABLE").length,
  };

  return {
    kind: "RuntimeDoctorReport",
    checked_at: new Date().toISOString(),
    checks,
    summary,
    raw: {
      sandbox_status: new SandboxManager().status(),
      harness: harnessDoctor(),
      node: process.version,
      data_dir: paths.root,
      systemd_user_cli: which("systemctl") != null,
    },
  };
}
