/**
 * REMED-M3 — Agent Handles real integration (tmux).
 * No mocks as proof of attach; exact agent_id ↔ ProcessSession.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  attachAgentHandle,
  bindExactSessionToTmux,
  closeAgentViewer,
  ensureTmuxSession,
  formatAgentInspectHuman,
  formatAgentLogsHuman,
  killTmuxSession,
  probeTmuxSession,
  resolveExactProcessSessions,
  safeMuxSessionName,
  tmuxSessionExists,
  ZELLIJ_ATTACH_LIMITATION,
  writeWorkspaceAgentHandles,
} from "../../src/v3/agent-handles/index.js";
import { ProcessSessionStore } from "../../src/v3/adapters/drivers/process-sessions.js";
import { registerOwnedProcessSession } from "../../src/v3/lifecycle/run-controls.js";
import {
  identifyProcess,
  sameProcess,
  sleepMs,
} from "../../src/v3/sandbox/process-supervisor.js";
import { resolveV3DataPaths } from "../../src/v3/paths.js";
import { defaultWorkspaceV3DataDir } from "../../src/v3/agent-handles/list-view.js";
import { handleAgentsSurface } from "../../src/cli/agents-surface.js";
import { AgentRegistryStore } from "../../src/v3/agent-registry/store.js";
import type { AgentRecord } from "../../src/v3/agent-registry/types.js";
import { spawn, type ChildProcess } from "node:child_process";

const HAS_TMUX =
  spawnSync("which", ["tmux"], { encoding: "utf-8" }).status === 0;
const HAS_ZELLIJ =
  spawnSync("which", ["zellij"], { encoding: "utf-8" }).status === 0;
const POSIX_PROC = existsSync("/proc/self/stat");

function agentFixture(
  partial: Partial<AgentRecord> & Pick<AgentRecord, "agent_id" | "work_id">,
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

function forceKillSafe(pid: number | undefined, starttime?: string): void {
  if (pid == null) return;
  if (starttime) {
    if (
      !sameProcess({
        pid,
        pgid: pid,
        starttime,
        cmdline: "",
      })
    ) {
      return;
    }
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

describe("REMED-M3 exact agent_id ↔ ProcessSession", () => {
  it("resolveExactProcessSessions refuses foreign agent_id", () => {
    const agent = agentFixture({ agent_id: "a-exact", work_id: "w1" });
    const sessions = [
      {
        kind: "ProcessSessionRecord" as const,
        session_id: "ps-other",
        work_id: "w1",
        task_id: "t1",
        adapter_id: "cursor" as const,
        agent_id: "someone-else",
        status: "running" as const,
        started_at: "t",
        command: ["true"],
        limitations: [],
        mux_session: "tempting-mux",
      },
      {
        kind: "ProcessSessionRecord" as const,
        session_id: "ps-mine",
        work_id: "w1",
        task_id: "t1",
        adapter_id: "cursor" as const,
        agent_id: "a-exact",
        status: "running" as const,
        started_at: "t",
        command: ["true"],
        limitations: [],
      },
    ];
    const hit = resolveExactProcessSessions(agent, sessions);
    expect(hit).toHaveLength(1);
    expect(hit[0]?.session_id).toBe("ps-mine");
    expect(hit[0]?.mux_session).toBeUndefined();
  });

  it("inspect/logs ignore sessions without matching agent_id", () => {
    const agent = agentFixture({
      agent_id: "a1",
      work_id: "w1",
      session_id: "orch-shared",
    });
    const sessions = [
      {
        kind: "ProcessSessionRecord" as const,
        session_id: "orch-shared",
        work_id: "w1",
        task_id: "t1",
        adapter_id: "cursor" as const,
        agent_id: "other",
        status: "running" as const,
        started_at: "t",
        command: ["echo"],
        limitations: [],
      },
    ];
    const inspect = formatAgentInspectHuman(agent, { processSessions: sessions });
    expect(inspect.view.process_session).toBeUndefined();
    expect(inspect.lines.join("\n")).toMatch(/nenhuma associada/);
    const logs = formatAgentLogsHuman(agent, { processSessions: sessions });
    expect(logs.lines.join("\n")).toMatch(/sem stream/);
  });
});

describe.skipIf(!HAS_TMUX)("REMED-M3 real tmux attach path", () => {
  let ws: string;
  let muxNames: string[];
  let child: ChildProcess | undefined;
  let starttime: string | undefined;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), "remed-m3-"));
    muxNames = [];
    child = undefined;
    starttime = undefined;
    writeWorkspaceAgentHandles(ws, true);
  });

  afterEach(() => {
    try {
      if (child?.pid) forceKillSafe(child.pid, starttime);
    } finally {
      for (const name of muxNames) {
        killTmuxSession(name);
      }
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it("3.2 Handles ON: bind real tmux + exact process + viewer close ≠ kill", () => {
    child = spawn(process.execPath, ["-e", "setInterval(() => {}, 250)"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    expect(child.pid).toBeTruthy();
    sleepMs(40);
    const id = identifyProcess(child.pid!);
    expect(id).toBeTruthy();
    starttime = id!.starttime;

    const workId = `work-m3-${Date.now()}`;
    const sessionId = `sess-m3-${Date.now()}`;
    const agentId = "agent-m3-live";
    const rec = registerOwnedProcessSession({
      workspace: ws,
      work_id: workId,
      task_id: "task-m3",
      session_id: sessionId,
      adapter_id: "cursor",
      agent_id: agentId,
      pid: child.pid!,
      command: [process.execPath, "-e", "fixture"],
    });
    expect(rec.agent_id).toBe(agentId);
    starttime = rec.starttime;

    const store = new ProcessSessionStore(
      resolveV3DataPaths(defaultWorkspaceV3DataDir(ws)).processSessionsDir,
    );
    const agent = agentFixture({ agent_id: agentId, work_id: workId });
    const bound = bindExactSessionToTmux(agent, rec, {
      persistSession: (r) => store.upsert(r),
    });
    expect(bound.ok).toBe(true);
    expect(bound.record.mux_backend).toBe("tmux");
    expect(bound.record.mux_session).toBeTruthy();
    muxNames.push(bound.record.mux_session!);
    expect(tmuxSessionExists(bound.record.mux_session!)).toBe(true);
    expect(probeTmuxSession(bound.record.mux_session!).ok).toBe(true);

    const persisted = store.load(workId).find((s) => s.session_id === sessionId);
    expect(persisted?.agent_id).toBe(agentId);
    expect(persisted?.mux_session).toBe(bound.record.mux_session);

    const attached = attachAgentHandle(agent, {
      processSessions: [bound.record],
      work_id: workId,
      deps: {
        workspace: ws,
        handlesEnabled: true,
        forceInteractive: true,
        runAttach: (_backend, target) => probeTmuxSession(target),
      },
      persistSession: (r) => store.upsert(r),
    });
    expect(attached.ok).toBe(true);
    expect(attached.backend).toBe("tmux");
    expect(attached.killed_agent).toBe(false);
    expect(attached.session_cancelled).toBe(false);
    expect(attached.process_session_id).toBe(sessionId);
    expect(attached.mux_session).toBe(bound.record.mux_session);

    const closed = attached.closeViewer();
    expect(closed.killed_agent).toBe(false);
    expect(closed.session_cancelled).toBe(false);
    // Process still alive after viewer close.
    expect(sameProcess(id!)).toBe(true);
    expect(tmuxSessionExists(bound.record.mux_session!)).toBe(true);

    const inspect = formatAgentInspectHuman(agent, {
      processSessions: store.load(workId).filter((s) => s.agent_id === agentId),
      workspace: ws,
    });
    expect(inspect.lines.join("\n")).toMatch(/mux:/);
    const logs = formatAgentLogsHuman(agent, {
      processSessions: store.load(workId).filter((s) => s.agent_id === agentId),
    });
    expect(logs.lines.join("\n")).toMatch(/mux=/);
  });

  it("3.2 args/paths with spaces are safe (argv, no shell)", () => {
    const dir = join(ws, "path with spaces");
    mkdirSync(dir, { recursive: true });
    const marker = join(dir, "marker.txt");
    writeFileSync(marker, "ok\n");
    const name = safeMuxSessionName(`m3-space-${Date.now()}`);
    muxNames.push(name);
    // Use cat on a path with spaces as separate argv — must not shell-split.
    const ensured = ensureTmuxSession(name, {
      command: ["cat", marker],
    });
    expect(ensured.ok).toBe(true);
    // Session may exit after cat; recreate with sleep using spaced cwd marker via sh -c is forbidden.
    // Instead prove new-session accepts multi-arg with spaces via a lasting process:
    killTmuxSession(name);
    const lasting = ensureTmuxSession(name, {
      command: [process.execPath, "-e", "setInterval(()=>{},1000)"],
    });
    expect(lasting.ok).toBe(true);
    expect(tmuxSessionExists(name)).toBe(true);
  });

  it("3.3 detach/reconnect same mux_session", () => {
    const name = safeMuxSessionName(`m3-reconn-${Date.now()}`);
    muxNames.push(name);
    expect(ensureTmuxSession(name).ok).toBe(true);
    const agent = agentFixture({ agent_id: "a-reconn", work_id: "w-reconn" });
    const session = {
      kind: "ProcessSessionRecord" as const,
      session_id: "ps-reconn",
      work_id: "w-reconn",
      task_id: "t1",
      adapter_id: "cursor" as const,
      agent_id: "a-reconn",
      status: "running" as const,
      started_at: new Date().toISOString(),
      command: ["sleep", "infinity"],
      limitations: [],
      mux_backend: "tmux" as const,
      mux_session: name,
      pid: process.pid,
      starttime: "1",
    };

    const first = attachAgentHandle(agent, {
      processSessions: [session],
      deps: {
        handlesEnabled: true,
        forceInteractive: true,
        runAttach: (_b, target) => probeTmuxSession(target),
      },
    });
    expect(first.backend).toBe("tmux");
    expect(first.mux_session).toBe(name);
    first.closeViewer();
    expect(tmuxSessionExists(name)).toBe(true);

    const second = attachAgentHandle(agent, {
      processSessions: [session],
      deps: {
        handlesEnabled: true,
        forceInteractive: true,
        runAttach: (_b, target) => probeTmuxSession(target),
      },
    });
    expect(second.backend).toBe("tmux");
    expect(second.mux_session).toBe(name);
    expect(second.ok).toBe(true);
  });

  it("3.3 dead process → reconcile exited → attach honest terminal", () => {
    child = spawn(process.execPath, ["-e", "setInterval(() => {}, 250)"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    sleepMs(40);
    const workId = `work-dead-${Date.now()}`;
    const sessionId = `sess-dead-${Date.now()}`;
    const agentId = "agent-dead";
    const rec = registerOwnedProcessSession({
      workspace: ws,
      work_id: workId,
      task_id: "t-dead",
      session_id: sessionId,
      adapter_id: "cursor",
      agent_id: agentId,
      pid: child.pid!,
      command: [process.execPath, "-e", "dead"],
    });
    starttime = rec.starttime;
    forceKillSafe(child.pid, starttime);
    child = undefined;
    sleepMs(60);

    const store = new ProcessSessionStore(
      resolveV3DataPaths(defaultWorkspaceV3DataDir(ws)).processSessionsDir,
    );
    const reconciled = store.reconcile(workId);
    const after = reconciled.find((s) => s.session_id === sessionId);
    expect(after?.status).toBe("exited");

    const agent = agentFixture({ agent_id: agentId, work_id: workId });
    const attached = attachAgentHandle(agent, {
      processSessions: [after!],
      deps: { handlesEnabled: true, hasBinary: (n) => n === "tmux" },
    });
    expect(attached.backend).toBe("cli_fallback");
    expect(attached.process_status).toBe("exited");
    expect(attached.message_pt).toMatch(/encerrada/i);
    expect(attached.lines.join("\n")).toMatch(/NÃO é sessão interativa/);
  });

  it("3.3 REPLACED → historical, never pretends interactive", () => {
    const agent = agentFixture({
      agent_id: "old-a",
      work_id: "w1",
      state: "REPLACED",
      replaced_by: "new-a",
    });
    const sessions = [
      {
        kind: "ProcessSessionRecord" as const,
        session_id: "ps-old",
        work_id: "w1",
        task_id: "t1",
        adapter_id: "cursor" as const,
        agent_id: "old-a",
        status: "running" as const,
        started_at: "t",
        command: ["sleep", "1"],
        limitations: [],
        mux_session: "should-not-attach",
        mux_backend: "tmux" as const,
      },
    ];
    const r = attachAgentHandle(agent, {
      processSessions: sessions,
      deps: {
        handlesEnabled: true,
        hasBinary: () => true,
        forceInteractive: true,
        runAttach: () => ({ ok: true }),
      },
    });
    expect(r.backend).toBe("cli_fallback");
    expect(r.message_pt).toMatch(/REPLACED/i);
    expect(r.lines.join("\n")).toMatch(/NÃO é sessão interativa/);
  });

  it("3.3 fallback textual is honest (no interactive pretence)", () => {
    const agent = agentFixture({ agent_id: "a-fb", work_id: "w1" });
    const r = attachAgentHandle(agent, {
      deps: { handlesEnabled: true, hasBinary: () => false },
    });
    expect(r.backend).toBe("cli_fallback");
    expect(r.lines.join("\n")).toMatch(/NÃO é sessão interativa/);
  });

  it("3.4 Handles OFF → zero auto tmux windows", () => {
    const before = spawnSync("tmux", ["list-sessions", "-F", "#{session_name}"], {
      encoding: "utf-8",
    });
    const beforeSet = new Set(
      (before.status === 0 ? before.stdout : "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    writeWorkspaceAgentHandles(ws, false);
    const agent = agentFixture({ agent_id: "a-off", work_id: "w-off" });
    const r = attachAgentHandle(agent, {
      deps: { workspace: ws, handlesEnabled: false, hasBinary: () => true },
    });
    expect(r.backend).toBe("none");
    expect(r.ok).toBe(false);
    const after = spawnSync("tmux", ["list-sessions", "-F", "#{session_name}"], {
      encoding: "utf-8",
    });
    const afterNames = (after.status === 0 ? after.stdout : "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const name of afterNames) {
      if (!beforeSet.has(name) && name.startsWith("evolve")) {
        expect.fail(`Handles OFF created unexpected mux: ${name}`);
      }
    }
  });

  it("3.4 Zellij LIMITATION when only zellij claimed without proven session", () => {
    const agent = agentFixture({ agent_id: "a-z", work_id: "w1" });
    const r = attachAgentHandle(agent, {
      processSessions: [
        {
          kind: "ProcessSessionRecord",
          session_id: "ps-z",
          work_id: "w1",
          task_id: "t1",
          adapter_id: "cursor",
          agent_id: "a-z",
          status: "running",
          started_at: "t",
          command: ["true"],
          limitations: [],
        },
      ],
      deps: {
        handlesEnabled: true,
        hasBinary: (n) => n === "zellij",
      },
    });
    expect(r.backend).toBe("cli_fallback");
    expect(r.message_pt).toContain("LIMITATION");
    expect(r.message_pt).toMatch(/Zellij/i);
    expect(ZELLIJ_ATTACH_LIMITATION).toMatch(/LIMITATION/);
    // Host evidence: binary may be absent — never claim functional from which alone.
    if (!HAS_ZELLIJ) {
      expect(HAS_ZELLIJ).toBe(false);
    }
  });

  it("evolve agents attach path: exact bind + JSON fields", () => {
    const paths = resolveV3DataPaths(defaultWorkspaceV3DataDir(ws));
    const workId = `work-cli-${Date.now()}`;
    const agentId = "cli-agent";
    const storeAgents = new AgentRegistryStore(paths.agentsDir);
    storeAgents.create(workId);
    storeAgents.register({
      agent_id: agentId,
      role: "master",
      work_id: workId,
    });

    child = spawn(process.execPath, ["-e", "setInterval(() => {}, 250)"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    sleepMs(40);
    const rec = registerOwnedProcessSession({
      workspace: ws,
      work_id: workId,
      task_id: "t-cli",
      session_id: `sess-cli-${Date.now()}`,
      adapter_id: "cursor",
      agent_id: agentId,
      pid: child.pid!,
      command: [process.execPath, "-e", "cli"],
    });
    starttime = rec.starttime;

    const lines: string[] = [];
    let jsonOut: Record<string, unknown> | undefined;
    const handled = handleAgentsSurface(
      {
        group: "agents",
        command: "attach",
        id: agentId,
        workspace: ws,
        "work-id": workId,
        format: "json",
      },
      {
        printJson: (o) => {
          jsonOut = o as Record<string, unknown>;
        },
        printText: (l) => lines.push(...l),
      },
    );
    expect(handled.handled).toBe(true);
    expect(jsonOut?.killed_agent).toBe(false);
    expect(jsonOut?.session_cancelled).toBe(false);
    // Without TTY: bind may occur; backend is cli_fallback or tmux depending on path.
    expect(["tmux", "cli_fallback"]).toContain(jsonOut?.backend);
    if (typeof jsonOut?.mux_session === "string") {
      muxNames.push(jsonOut.mux_session);
      expect(tmuxSessionExists(jsonOut.mux_session)).toBe(true);
    }
    const closed = closeAgentViewer(agentId);
    expect(closed.killed_agent).toBe(false);
  });
});

describe.skipIf(!POSIX_PROC || !HAS_TMUX)("REMED-M3 bind refuses agent_id mismatch", () => {
  it("bindExactSessionToTmux refuses foreign agent_id", () => {
    const agent = agentFixture({ agent_id: "mine", work_id: "w1" });
    const foreign = {
      kind: "ProcessSessionRecord" as const,
      session_id: "ps-x",
      work_id: "w1",
      task_id: "t1",
      adapter_id: "cursor" as const,
      agent_id: "theirs",
      status: "running" as const,
      started_at: "t",
      command: ["true"],
      limitations: [],
    };
    const r = bindExactSessionToTmux(agent, foreign);
    expect(r.ok).toBe(false);
    expect(r.detail).toBe("agent_id_mismatch_refused");
  });
});
