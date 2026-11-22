/**
 * V4.3 P0-3 — Cheap E2E/resilience smoke (unit-level harness).
 * Live TTY Ink journeys are LIMITATION — see docs/v4/V4.3/tests/e2e-smoke.md.
 * Do not invent E2E passes for interactive TUI.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runIntentFlow } from "../../src/v3/intake/intent-flow.js";
import { ApprovalFacade } from "../../src/v3/approvals/facade.js";
import { ApprovalStore } from "../../src/v3/approvals/store.js";
import {
  pauseJourneyTask,
  resumeJourneyTask,
  getJourneyPause,
} from "../../src/cli/tui/journey-pause.js";
import {
  attachDeliveryVerification,
  deriveDeliveryFromWorkspace,
} from "../../src/cli/tui/delivery-verify.js";
import {
  attachAgentHandle,
  closeAgentViewer,
  isAgentHandlesEnabled,
  writeWorkspaceAgentHandles,
} from "../../src/v3/agent-handles/index.js";
import { DEFAULT_PROFILE } from "../../src/config/profile.js";
import { deriveDeliveryStatus } from "../../src/cli/tui/delivery-status.js";

describe("P0-3 E2E smoke (cheap / non-TTY)", () => {
  let ws: string;
  const prevEnv = process.env.EVOLVELOOP_AGENT_HANDLES;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), "v43-e2e-"));
    mkdirSync(join(ws, ".evolveloop"), { recursive: true });
    delete process.env.EVOLVELOOP_AGENT_HANDLES;
  });
  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
    if (prevEnv === undefined) delete process.env.EVOLVELOOP_AGENT_HANDLES;
    else process.env.EVOLVELOOP_AGENT_HANDLES = prevEnv;
  });

  it("simple task: intent → Goal Contract persisted", () => {
    const out = runIntentFlow({
      workspace: ws,
      intent: "Criar marcador smoke v43",
      answers: ["ok", "ok", "ok", "ok"],
      goal_contract_id: "gc-smoke-1",
    });
    expect(out).toBeTruthy();
    if ("kind" in out && out.kind === "goal_contract") {
      expect(out.contract.goal_contract_id).toBe("gc-smoke-1");
    } else if ("bypassed" in out) {
      // should not bypass NL intent
      expect(out.bypassed).toBeFalsy();
    }
  });

  it("approval: create + approve path", () => {
    const store = new ApprovalStore(join(ws, "approvals"));
    const facade = new ApprovalFacade(store);
    const apr = store.create({
      work_id: "w-smoke",
      operation: "shell.run",
      resource: "echo smoke",
      justification: "e2e smoke",
      impact: "sem efeito persistente",
      risk: "low",
    });
    expect(facade.listPending("w-smoke")).toHaveLength(1);
    facade.approve(apr.approval_id, "smoke");
    expect(facade.listPending("w-smoke")).toHaveLength(0);
  });

  it("simulated provider/adapter failure → Delivery FAILED/BLOCKED not PASS", () => {
    expect(
      deriveDeliveryStatus({
        kick_started: true,
        adapter_status: "error",
        message_pt: "provider down",
      }),
    ).toBe("FAILED");
    expect(
      deriveDeliveryStatus({
        kick_started: true,
        mso_state: "BLOCKED",
        message_pt: "Execução bloqueada",
      }),
    ).toBe("BLOCKED");
  });

  it("cancel/pause axis: pause → cancel-clear via resume idempotent", () => {
    pauseJourneyTask(ws, "tui");
    expect(getJourneyPause(ws).paused).toBe(true);
    resumeJourneyTask(ws, "cli");
    expect(getJourneyPause(ws).paused).toBe(false);
    resumeJourneyTask(ws, "cli");
    expect(getJourneyPause(ws).paused).toBe(false);
  });

  it("Handles OFF soft-fail; ON soft-fail without backends; viewer disconnect ≠ kill", () => {
    writeWorkspaceAgentHandles(ws, false);
    expect(isAgentHandlesEnabled({ workspace: ws, profile: DEFAULT_PROFILE })).toBe(
      false,
    );
    const agent = {
      agent_id: "smoke-a",
      role: "worker" as const,
      child_agent_ids: [] as string[],
      work_id: "w-smoke",
      state: "ACTIVE" as const,
      last_heartbeat_at: "t",
      last_activity_at: "t",
      budget_consumed: {},
      permissions: {},
      created_at: "t",
      updated_at: "t",
    };
    const off = attachAgentHandle(agent, {
      deps: { workspace: ws, handlesEnabled: false },
    });
    expect(off.ok).toBe(false);
    expect(off.killed_agent).toBe(false);

    writeFileSync(
      join(ws, ".evolveloop", "config.yaml"),
      "preferences:\n  agent_handles:\n    enabled: true\n",
    );
    const on = attachAgentHandle(agent, {
      deps: {
        workspace: ws,
        handlesEnabled: true,
        hasBinary: () => false,
      },
    });
    expect(on.backend).toBe("cli_fallback");
    expect(on.killed_agent).toBe(false);
    const closed = on.closeViewer();
    expect(closed.killed_agent).toBe(false);
    expect(closed.session_cancelled).toBe(false);
    expect(closeAgentViewer(agent.agent_id).killed_agent).toBe(false);
  });

  it("delivery evidence: approved vs failing tests", () => {
    attachDeliveryVerification(
      ws,
      { command: "npm test", exit_code: 0, provenance: "local_execution" },
      { work_id: "w-ok" },
    );
    expect(
      deriveDeliveryFromWorkspace(ws, { work_id: "w-ok", kick_started: true }).status,
    ).toBe("PASS");
    attachDeliveryVerification(
      ws,
      { command: "npm test", exit_code: 1, provenance: "local_execution" },
      { work_id: "w-bad" },
    );
    expect(
      deriveDeliveryFromWorkspace(ws, { work_id: "w-bad", kick_started: true }).status,
    ).toBe("FAILED");
  });
});
