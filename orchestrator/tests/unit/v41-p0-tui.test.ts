/**
 * V4.1 P0 — TUI Experience: Delivery honest, Plan/Agents labels, home resume, narrow.
 */
import { describe, it, expect } from "vitest";
import {
  deriveDeliveryStatus,
  deliveryStatusTitle,
} from "../../src/cli/tui/delivery-status.js";
import {
  buildDeliveryCardView,
  formatDeliveryTokens,
} from "../../src/cli/tui/delivery-card-view.js";
import {
  buildPlanDisplay,
  buildPlanCardView,
} from "../../src/cli/tui/plan-display.js";
import { buildHomeResumeView } from "../../src/cli/tui/home-resume.js";
import { resolveLayoutMode, NARROW_COLUMNS } from "../../src/cli/tui/layout-narrow.js";
import { renderCompactFooter } from "../../src/cli/tui/footer-compact.js";
import { formatSlashStatus } from "../../src/cli/tui/slash-handlers.js";
import {
  buildFooterTelemetry,
  type WorkspaceSessionSnapshot,
} from "../../src/v3/evolve-shell/index.js";
import { buildStatusPanel, renderStatusPanelPt } from "../../src/v3/evolve-shell/status-panel.js";

function emptySession(
  over: Partial<WorkspaceSessionSnapshot> = {},
): WorkspaceSessionSnapshot {
  return {
    workspace: "/tmp/ws-v41",
    initialized: false,
    state_db_path: "/tmp/ws-v41/.evolveloop/state.db",
    state_db_exists: false,
    contracts_count: 0,
    message_pt: "workspace novo",
    ...over,
  };
}

describe("P0-5 Delivery — never false PASS", () => {
  it("kick started without verification → UNVERIFIED (not PASS)", () => {
    expect(
      deriveDeliveryStatus({
        kick_started: true,
        mso_state: "VALIDATING",
        adapter_status: "ok",
      }),
    ).toBe("UNVERIFIED");
  });

  it("PASS only with verification exit 0", () => {
    expect(
      deriveDeliveryStatus({
        kick_started: true,
        mso_state: "VALIDATING",
        verification: { command: "npm test", exit_code: 0 },
      }),
    ).toBe("PASS");
  });

  it("TRUE-FULL-PASS without verification → UNVERIFIED", () => {
    expect(
      deriveDeliveryStatus({
        kick_started: true,
        mso_state: "TRUE-FULL-PASS",
      }),
    ).toBe("UNVERIFIED");
  });

  it("BLOCKED / fail paths", () => {
    expect(
      deriveDeliveryStatus({
        kick_started: true,
        mso_state: "BLOCKED",
      }),
    ).toBe("BLOCKED");
    expect(
      deriveDeliveryStatus({
        kick_started: false,
      }),
    ).toBe("BLOCKED");
    expect(
      deriveDeliveryStatus({
        kick_started: true,
        adapter_status: "error",
      }),
    ).toBe("FAILED");
    expect(
      deriveDeliveryStatus({
        kick_started: true,
        verification: { command: "npm test", exit_code: 1 },
      }),
    ).toBe("FAILED");
  });

  it("card separates process finished vs objective validated", () => {
    const view = buildDeliveryCardView({
      status: "UNVERIFIED",
      diff_stat: "(sem alterações)",
    });
    expect(view.title).toContain(deliveryStatusTitle("UNVERIFIED"));
    expect(view.process_outcome_line).toBe("Processo: terminou");
    expect(view.objective_validated_line).toBe("Objetivo: não validado");
    expect(view.verification_line).toContain("não validado");
    expect(view.tokens_line).toContain("Agents");
    expect(view.tokens_line).not.toContain("Workers");
    expect(view.shortcuts).toContain("Nova Task");
  });

  it("PASS card uses Entrega aceita + Agents", () => {
    const view = buildDeliveryCardView({
      status: "PASS",
      diff_stat: "a.ts | 1 +",
      verification: { command: "npm test", exit_code: 0 },
      tokens_mso: 10,
      tokens_workers: 20,
    });
    expect(view.status_label).toBe("Entrega aceita");
    expect(view.objective_validated_line).toBe("Objetivo: validado");
    expect(formatDeliveryTokens(10, 20)).toBe(
      "Tokens: Orchestrator 10 (reported) · Agents 20 (reported)",
    );
  });
});

describe("P0-3 Plan labels + sections", () => {
  it("Plan card includes objetivo, critérios, etapas, agents, riscos, approval", () => {
    const plan = buildPlanDisplay({
      objective: "Adicionar healthcheck HTTP com testes",
      scope: ["endpoint /health", "testes"],
      criteria: "npm test verde",
      risks: "sem auth",
      agents: ["adapter.local"],
      approval_needed: true,
    });
    const view = buildPlanCardView(plan);
    expect(view.title).toBe("Plan");
    const labels = view.sections.map((s) => s.label);
    expect(labels).toContain("Objetivo");
    expect(labels).toContain("Critérios");
    expect(labels).toContain("Etapas");
    expect(labels).toContain("Agents");
    expect(labels).toContain("Riscos / permissões");
    expect(labels).toContain("Autónomo vs Approval");
    expect(view.lines[0]).toBe("Plan");
    expect(view.lines.join("\n")).toContain("Approval");
  });
});

describe("P0-1 Home resume smoke", () => {
  it("empty workspace → awaiting entry + CTA iniciar", () => {
    const view = buildHomeResumeView(emptySession(), { home: "/tmp" });
    expect(view.workspace_display).toContain("ws-v41");
    expect(view.tasks).toHaveLength(0);
    expect(view.lines.join("\n")).toContain("Aguardando entrada");
    expect(view.cta_primary).toMatch(/Task/i);
  });

  it("blocked session → needs intervention Task", () => {
    const view = buildHomeResumeView(
      emptySession({
        initialized: true,
        contracts_count: 1,
        latest_contract: {
          goal_contract_id: "gc-1",
          version: 1,
          objective: "Ship auth JWT securely",
          payload: {},
          validated: true,
          created_at: "t",
          updated_at: "t",
          mso_confirmed: true,
        },
        latest_mso_session: {
          session_id: "sess-1",
          workspace_id: "/tmp/ws-v41",
          state: "BLOCKED",
          fencing_token: 1,
          created_at: "t",
          updated_at: "t",
        },
      }),
      { home: "/tmp" },
    );
    expect(view.tasks.length).toBeGreaterThan(0);
    expect(view.tasks.some((t) => t.kind === "needs_intervention")).toBe(true);
    expect(view.cta_primary).toMatch(/intervenção/i);
  });
});

describe("P0-4 L1 labels Task/Session/Agents", () => {
  it("footer executing uses Agents not Workers", () => {
    const tel = buildFooterTelemetry(emptySession(), {
      home: "/tmp",
      executing: true,
      mso_state: "DELEGATING",
      sandbox: "ON",
      tok_mso: { value: 1200, provenance: "reported" },
      tok_workers: { value: 400, provenance: "reported" },
      tasks: [{ name: "impl" }],
    });
    const compact = renderCompactFooter(tel, {
      task_label: "Task: Ship auth",
    });
    expect(compact.mode).toBe("executing");
    const text = compact.lines.join("\n");
    expect(text).toContain("Task: Ship auth");
    expect(text).toContain("Session:");
    expect(text).toMatch(/Agents/);
    expect(text).not.toContain("Workers");
  });

  it("/status uses Task/Session/Agents", () => {
    const body = formatSlashStatus({
      mso_state: "WAITING_AGENTS",
      session_id: "sess-1",
      contract_version: 2,
      provider: "Ollama",
      tokens_mso: "1200",
      tokens_workers: "340",
      task_label: "Healthcheck",
    });
    expect(body).toContain("Task: Healthcheck");
    expect(body).toContain("Session: WAITING_AGENTS");
    expect(body).toContain("Agents 340");
    expect(body).not.toContain("Workers");
  });

  it("status panel labels Task not work_id as Tarefa", () => {
    const panel = buildStatusPanel(
      emptySession({
        initialized: true,
        latest_contract: {
          goal_contract_id: "gc-1",
          version: 1,
          objective: "Adicionar healthcheck",
          payload: {},
          validated: true,
          created_at: "t",
          updated_at: "t",
          work_id: "work-secret-id",
          mso_confirmed: true,
        },
        latest_mso_session: {
          session_id: "sess-9",
          workspace_id: "/tmp/ws-v41",
          state: "DELEGATING",
          fencing_token: 1,
          work_id: "work-secret-id",
          created_at: "t",
          updated_at: "t",
        },
      }),
    );
    const text = renderStatusPanelPt(panel);
    expect(text).toContain("Task:");
    expect(text).toContain("Session:");
    expect(text).toContain("Work (interno): work-secret-id");
    expect(text).not.toMatch(/│ Tarefa: work-secret-id/);
    expect(text).not.toContain("│ Meta:");
  });
});

describe("P0-6 narrow terminal", () => {
  it("degrades under NARROW_COLUMNS with notice", () => {
    const wide = resolveLayoutMode(100);
    expect(wide.narrow).toBe(false);
    expect(wide.degradation_notice).toBeNull();
    const narrow = resolveLayoutMode(NARROW_COLUMNS - 1);
    expect(narrow.narrow).toBe(true);
    expect(narrow.stack).toBe(true);
    expect(narrow.degradation_notice).toMatch(/estreito/i);
  });
});
