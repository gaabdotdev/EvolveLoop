/**
 * REMED-M6 — Full integration / regression harness (cheap, reproducible).
 *
 * Covers the maximum barato of the journey with local fixtures:
 * StateDb · ProcessSession · pause/resume/cancel · Handles · delivery provenance ·
 * history · workspace isolation · CLI restart · compat (Node/tmux/spaces/narrow/NO_COLOR).
 *
 * LIMITATION (honest): full interactive Ink TTY journey (Home→Grill→Plan→kick→Delivery)
 * is NOT executed here. See INK_TTY_LIVE_LIMITATION and docs/v4/V4.3/remediation/gate-report.md.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

import { StateDb, defaultStateDbPath } from "../../src/v3/state-db/store.js";
import { registerOwnedProcessSession } from "../../src/v3/lifecycle/run-controls.js";
import { ProcessSessionStore } from "../../src/v3/adapters/drivers/process-sessions.js";
import {
  identifyProcess,
  isProcessLive,
  isProcessStopped,
  sleepMs,
} from "../../src/v3/sandbox/process-supervisor.js";
import {
  clearJourneyPauseOnCancel,
  getJourneyPause,
  pauseJourneyTask,
  resumeJourneyTask,
} from "../../src/cli/tui/journey-pause.js";
import { taskControlMessage } from "../../src/cli/tui/task-controls.js";
import {
  attachAgentHandle,
  closeAgentViewer,
  isAgentHandlesEnabled,
  writeWorkspaceAgentHandles,
} from "../../src/v3/agent-handles/index.js";
import type { AgentRecord } from "../../src/v3/agent-registry/types.js";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { defaultWorkspaceV3DataDir } from "../../src/v3/agent-handles/list-view.js";
import {
  deriveDeliveryFromWorkspace,
  validateDelivery,
} from "../../src/cli/tui/delivery-verify.js";
import { deriveDeliveryStatus } from "../../src/cli/tui/delivery-status.js";
import {
  buildTaskHistoryView,
  handleHistorySurface,
} from "../../src/cli/tui/task-history.js";
import { confirmWorkspaceUse } from "../../src/cli/workspace-product-surface.js";
import { resolveLayoutMode, NARROW_COLUMNS } from "../../src/cli/tui/layout-narrow.js";
import { colorEnabled } from "../../src/v3/evolve-shell/colors.js";
import { formatJourneyHelp } from "../../src/cli/help-usage.js";
import { runIntentFlow } from "../../src/v3/intake/intent-flow.js";
import type { GoalContract } from "../../src/v3/goal-contract/types.js";

const PKG = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { engines?: { node?: string } };

function agentStub(
  partial: Pick<AgentRecord, "agent_id" | "work_id"> & Partial<AgentRecord>,
): AgentRecord {
  const t = "2026-11-22T00:00:00.000Z";
  return {
    role: "worker",
    child_agent_ids: [],
    state: "ACTIVE",
    last_heartbeat_at: t,
    last_activity_at: t,
    budget_consumed: {},
    permissions: {},
    created_at: t,
    updated_at: t,
    ...partial,
  };
}

const POSIX_PROC = existsSync("/proc/self/stat");
const HAS_TMUX = spawnSync("which", ["tmux"], { encoding: "utf-8" }).status === 0;
const HAS_SCRIPT =
  spawnSync("which", ["script"], { encoding: "utf-8" }).status === 0;
const HAS_ZELLIJ =
  spawnSync("which", ["zellij"], { encoding: "utf-8" }).status === 0;

const ORCH_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const EVOLVE_JS = join(ORCH_ROOT, "dist/cli/evolve.js");

/** Explicit — do not pretend Ink interactive E2E was run. */
export const INK_TTY_LIVE_LIMITATION =
  "LIMITATION: interactive Ink TTY journey (Home→Grill→Plan→kick→Delivery) not executed in REMED-M6; harness covers APIs, StateDb, ProcessSession, cheap PTY --help via util-linux script.";

function parseSemverParts(v: string): [number, number, number] {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return [0, 0, 0];
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function nodeMeetsMin(
  current: string,
  minMajor: number,
  minMinor: number,
  minPatch = 0,
): boolean {
  const [maj, min, patch] = parseSemverParts(current);
  if (maj > minMajor) return true;
  if (maj < minMajor) return false;
  if (min > minMinor) return true;
  if (min < minMinor) return false;
  return patch >= minPatch;
}

function spawnFixture(): ChildProcess {
  const child = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 250)"],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  return child;
}

function forceKillSafe(pid: number | undefined, starttime?: string): void {
  if (pid == null) return;
  if (starttime) {
    if (!sameProcess({ pid, pgid: pid, starttime, cmdline: "" })) return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* gone */
    }
  }
}

function minimalContract(id: string): GoalContract {
  const ts = new Date().toISOString();
  return {
    kind: "GoalContract",
    goal_contract_id: id,
    version: 1,
    created_at: ts,
    updated_at: ts,
    objective: "remed-m6 fixture",
    scope: [],
    out_of_scope: [],
    functional_requirements: [],
    non_functional_requirements: [],
    constraints: [],
    dependencies: [],
    risks: [],
    criteria: [
      {
        id: "c1",
        description: "ok",
        mandatory: true,
        verification: [{ id: "v1", kind: "command", description: "x" }],
        evidence_required: ["e"],
        state: "NOT_STARTED",
        evidence_ids: [],
        updated_at: ts,
      },
    ],
  };
}

describe("REMED-M6 LIMITATION declaration (honest)", () => {
  it("documents Ink TTY live as LIMITATION — never claims full interactive E2E", () => {
    expect(INK_TTY_LIVE_LIMITATION).toMatch(/LIMITATION/);
    expect(INK_TTY_LIVE_LIMITATION).toMatch(/Ink TTY/);
    expect(INK_TTY_LIVE_LIMITATION).not.toMatch(/PASS.*Ink interactive/i);
  });
});

describe("REMED-M6 compat (Node / tmux / spaces / narrow / NO_COLOR / backend-off)", () => {
  it("Node current meets package engines >=22.5.0", () => {
    expect(PKG.engines?.node).toMatch(/>=\s*22\.5/);
    expect(nodeMeetsMin(process.versions.node, 22, 5)).toBe(true);
  });

  it("tmux ON path is detectable on this host (or LIMITATION recorded)", () => {
    if (HAS_TMUX) {
      const v = spawnSync("tmux", ["-V"], { encoding: "utf-8" });
      expect(v.status).toBe(0);
      expect(v.stdout + v.stderr).toMatch(/tmux/i);
    } else {
      // Host without tmux — still a valid LIMITATION, not a silent pass claim.
      expect(HAS_TMUX).toBe(false);
    }
  });

  it("Handles OFF (backend-off) path: disabled preference → attach soft-fails without inventing session", () => {
    const ws = mkdtempSync(join(tmpdir(), "remed-m6-hoff-"));
    try {
      writeWorkspaceAgentHandles(ws, false);
      expect(isAgentHandlesEnabled({ workspace: ws })).toBe(false);
      const r = attachAgentHandle(agentStub({ agent_id: "ghost-m6", work_id: "w-ghost" }), {
        deps: { workspace: ws, handlesEnabled: false, hasBinary: () => true },
      });
      expect(r.ok).toBe(false);
      expect(r.backend).toBe("none");
      expect(r.killed_agent).toBe(false);
      expect(r.session_cancelled).toBe(false);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("path with spaces: confirmWorkspaceUse + StateDb path", () => {
    const root = mkdtempSync(join(tmpdir(), "remed-m6-space-"));
    const spaced = join(root, "ws with space");
    mkdirSync(spaced, { recursive: true });
    try {
      const r = confirmWorkspaceUse(spaced, { record: false });
      expect(r.ok).toBe(true);
      expect(r.path).toContain("ws with space");
      expect(r.state_db_path).toContain("ws with space");
      const db = new StateDb(defaultStateDbPath(spaced));
      try {
        db.saveGoalContract(minimalContract("gc-space"), { validated: true });
        expect(db.loadLatestGoalContract("gc-space")?.goal_contract_id).toBe(
          "gc-space",
        );
      } finally {
        db.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("narrow layout + NO_COLOR", () => {
    const narrow = resolveLayoutMode(NARROW_COLUMNS - 1);
    expect(narrow.narrow).toBe(true);
    expect(narrow.degradation_notice).toMatch(/estreito/i);
    expect(colorEnabled({ env: { NO_COLOR: "1" }, isTTY: true })).toBe(false);
    expect(colorEnabled({ env: {}, isTTY: true })).toBe(true);
  });

  it("Zellij absence recorded (not claimed OK)", () => {
    // Never declare Zellij functional solely because which finds a binary.
    if (!HAS_ZELLIJ) {
      expect(HAS_ZELLIJ).toBe(false);
    }
  });
});

describe("REMED-M6 cheap PTY harness (util-linux script — not Ink journey)", () => {
  it.skipIf(!HAS_SCRIPT || !existsSync(EVOLVE_JS))(
    "PTY --help exits 0 and uses product Session copy (not drift Sessão)",
    () => {
      const outFile = join(tmpdir(), `remed-m6-pty-${Date.now()}.txt`);
      const r = spawnSync(
        "script",
        ["-q", "-c", `${process.execPath} ${EVOLVE_JS} --help`, outFile],
        { encoding: "utf-8", cwd: ORCH_ROOT, env: { ...process.env, NO_COLOR: "1" } },
      );
      expect(r.status).toBe(0);
      const body = readFileSync(outFile, "utf-8");
      expect(body).toMatch(/Task\/Session/);
      expect(body).toMatch(/evolve/);
      // Product copy is Session (EN token in PT help) — flag regression if Sessão sneaks into product axis.
      expect(body).not.toMatch(/Task\/Sessão/);
      try {
        rmSync(outFile, { force: true });
      } catch {
        /* ignore */
      }
    },
  );

  it.skipIf(!HAS_SCRIPT || !existsSync(EVOLVE_JS))(
    "PTY narrow+NO_COLOR --help still readable",
    () => {
      const outFile = join(tmpdir(), `remed-m6-pty-n-${Date.now()}.txt`);
      const r = spawnSync(
        "script",
        [
          "-q",
          "-c",
          `env NO_COLOR=1 COLUMNS=40 ${process.execPath} ${EVOLVE_JS} --help`,
          outFile,
        ],
        { encoding: "utf-8", cwd: ORCH_ROOT },
      );
      expect(r.status).toBe(0);
      const body = readFileSync(outFile, "utf-8");
      expect(body).toMatch(/Task/);
      expect(body).not.toMatch(/\u001b\[/);
      try {
        rmSync(outFile, { force: true });
      } catch {
        /* ignore */
      }
    },
  );
});

describe("REMED-M6 integration: TUI pause = persisted + CLI restart", () => {
  let ws: string;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), "remed-m6-pause-"));
  });
  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
  });

  it("pauseJourneyTask persists; reopen via getJourneyPause matches; resume clears", () => {
    const p = pauseJourneyTask(ws, "tui");
    expect(p.paused).toBe(true);
    expect(p.axis).toBe("journey_task");
    // Simulate CLI restart: new read of StateDb only
    const again = getJourneyPause(ws);
    expect(again.paused).toBe(true);
    expect(again.paused_at).toBe(p.paused_at);
    expect(again.workspace).toBe(resolve(ws));
    const r = resumeJourneyTask(ws, "cli");
    expect(r.paused).toBe(false);
    expect(getJourneyPause(ws).paused).toBe(false);
  });

  it("journey help product axis uses Task/Session", () => {
    const help = formatJourneyHelp();
    expect(help).toMatch(/Task\/Session/);
    expect(help).not.toMatch(/Task\/Sessão/);
  });
});

describe.skipIf(!POSIX_PROC)(
  "REMED-M6 integration: ProcessSession lifecycle + Handles + cancel",
  () => {
    let ws: string;
    let child: ChildProcess | undefined;
    let starttime: string | undefined;
    let workId: string;
    let sessionId: string;

    beforeEach(() => {
      ws = mkdtempSync(join(tmpdir(), "remed-m6-life-"));
      workId = `work-m6-${Date.now()}`;
      sessionId = `sess-m6-${Date.now()}`;
      child = undefined;
      starttime = undefined;
    });

    afterEach(() => {
      try {
        if (child?.pid) forceKillSafe(child.pid, starttime);
      } finally {
        rmSync(ws, { recursive: true, force: true });
      }
    });

    it("owned session: pauseJourneyTask stops OS + persists; resume; closeViewer≠kill; cancel dead", () => {
      child = spawnFixture();
      expect(child.pid).toBeTruthy();
      sleepMs(40);
      const id = identifyProcess(child.pid!);
      expect(id).toBeTruthy();
      starttime = id!.starttime;

      const rec = registerOwnedProcessSession({
        workspace: ws,
        work_id: workId,
        task_id: "task-m6",
        session_id: sessionId,
        adapter_id: "cursor",
        agent_id: "agent-m6",
        pid: child.pid!,
        command: [process.execPath, "-e", "fixture"],
      });
      expect(rec.status).toBe("running");
      starttime = rec.starttime ?? starttime;

      const store = new ProcessSessionStore(
        resolveV3DataPaths(defaultWorkspaceV3DataDir(ws)).processSessionsDir,
      );
      expect(store.load(workId)[0]?.status).toBe("running");

      // Single path: TUI pause persists AND applies SIGSTOP via pauseOwnedRuns
      const jp = pauseJourneyTask(ws, "tui");
      expect(jp.paused).toBe(true);
      expect(jp.axis).toBe("journey_task");
      expect(jp.run_control?.ok).toBe(true);
      expect(jp.os_pause_applied).toBe(true);
      sleepMs(40);
      expect(isProcessStopped(id!)).toBe(true);
      expect(
        store.load(workId).find((s) => s.session_id === sessionId)?.status,
      ).toBe("paused");
      // CLI restart simulation: re-read StateDb
      expect(getJourneyPause(ws).paused).toBe(true);
      expect(getJourneyPause(ws).paused_at).toBe(jp.paused_at);

      const resumed = resumeJourneyTask(ws, "cli");
      expect(resumed.paused).toBe(false);
      expect(resumed.run_control?.ok).toBe(true);
      sleepMs(40);
      expect(isProcessLive(id!)).toBe(true);
      expect(isProcessStopped(id!)).toBe(false);

      // Handles OFF: closeViewer must not kill
      writeWorkspaceAgentHandles(ws, false);
      const closed = closeAgentViewer("agent-m6");
      expect(closed.killed_agent).toBe(false);
      expect(closed.session_cancelled).toBe(false);
      expect(isProcessLive(id!)).toBe(true);

      // Cancel is destructive
      expect(taskControlMessage("cancel").destructive).toBe(true);
      const cancelled = clearJourneyPauseOnCancel(ws, "tui");
      expect(cancelled.run_control?.ok).toBe(true);
      sleepMs(50);
      expect(isProcessLive(id!)).toBe(false);
      child = undefined;
    });
  },
);

describe("REMED-M6 integration: delivery provenance + history + isolation", () => {
  let wsA: string;
  let wsB: string;

  beforeEach(() => {
    wsA = mkdtempSync(join(tmpdir(), "remed-m6-a-"));
    wsB = mkdtempSync(join(tmpdir(), "remed-m6-b-"));
  });
  afterEach(() => {
    rmSync(wsA, { recursive: true, force: true });
    rmSync(wsB, { recursive: true, force: true });
  });

  it("local_execution exit 0 → PASS; external attestation alone ≠ PASS; absent → UNVERIFIED", () => {
    const local = validateDelivery(wsA, {
      run: "true",
      work_id: "w-m6",
      goal_contract_id: "gc-m6",
      goal_contract_version: 1,
      task_id: "t-m6",
    });
    expect(local.status).toBe("PASS");
    expect(local.verification?.provenance).toBe("local_execution");

    // ATTESTED must not become PASS
    const attested = deriveDeliveryStatus({
      kick_started: true,
      verification: {
        command: "attested-externally",
        exit_code: 0,
        provenance: "external_attestation",
      },
    });
    expect(attested).toBe("ATTESTED");
    expect(attested).not.toBe("PASS");

    const empty = deriveDeliveryFromWorkspace(wsB, { kick_started: true });
    expect(empty.status).toBe("UNVERIFIED");
  });

  it("workspace isolation: StateDb A ≠ B; history scoped", () => {
    const outA = runIntentFlow({
      workspace: wsA,
      intent: "Marcador isolamento A remed-m6",
      answers: ["ok", "ok", "ok", "ok"],
      goal_contract_id: "gc-iso-a",
    });
    expect(outA).toBeTruthy();

    const dbA = new StateDb(defaultStateDbPath(wsA));
    const dbB = new StateDb(defaultStateDbPath(wsB));
    try {
      expect(dbA.loadLatestGoalContract("gc-iso-a")).toBeTruthy();
      expect(dbB.loadLatestGoalContract("gc-iso-a")).toBeUndefined();
      pauseJourneyTask(wsA, "cli");
      expect(getJourneyPause(wsA).paused).toBe(true);
      expect(getJourneyPause(wsB).paused).toBe(false);
    } finally {
      dbA.close();
      dbB.close();
    }

    const histA = buildTaskHistoryView(wsA);
    expect(histA.entries.length).toBeGreaterThan(0);
    const histB = buildTaskHistoryView(wsB);
    expect(histB.entries.length).toBe(0);

    const handled = handleHistorySurface(
      { group: "history", command: "list", workspace: wsA },
      { argv: ["node", "evolve.js", "history", "list", "--workspace", wsA] },
    );
    expect(handled.handled).toBe(true);
    expect(handled.exitCode).toBe(0);
  });
});

describe("REMED-M6 StateDb real lifecycle (M1 contract still holds)", () => {
  it("init → upsert → query → close on disk", () => {
    const ws = mkdtempSync(join(tmpdir(), "remed-m6-db-"));
    const path = defaultStateDbPath(ws);
    try {
      const db = new StateDb(path);
      db.saveGoalContract(minimalContract("gc-m6-db"), { validated: true });
      expect(db.loadLatestGoalContract("gc-m6-db")?.objective).toBe(
        "remed-m6 fixture",
      );
      db.close();
      expect(existsSync(path)).toBe(true);
      const again = new StateDb(path);
      expect(again.loadLatestGoalContract("gc-m6-db")?.goal_contract_id).toBe(
        "gc-m6-db",
      );
      again.close();
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });
});
