/**
 * Fase 1 — rodapé IDLE sem spam de UNAVAILABLE.
 */
import { describe, it, expect } from "vitest";
import {
  buildFooterTelemetry,
  renderFooter,
  isFooterIdle,
  type FooterTelemetry,
  type WorkspaceSessionSnapshot,
} from "../../src/v3/evolve-shell/index.js";

function emptySession(): WorkspaceSessionSnapshot {
  return {
    workspace: "/tmp/ws",
    initialized: false,
    state_db_path: "/tmp/ws/.evolveloop/state.db",
    state_db_exists: false,
    contracts_count: 0,
    message_pt: "workspace novo",
  };
}

describe("footer IDLE render", () => {
  it("modo IDLE: [IDLE] · 0 tasks e — nos campos sem consumo", () => {
    const tel = buildFooterTelemetry(emptySession(), { home: "/tmp", idle: true });
    expect(isFooterIdle(tel)).toBe(true);
    const text = renderFooter(tel, { color: false });
    expect(text).toMatch(/^\[IDLE\] · 0 tasks/);
    expect(text).toContain("Modelo: —");
    expect(text).toContain("ctx —");
    expect(text).toContain("tok —");
    expect(text).toContain("Agents: —");
    expect(text).not.toContain("UNAVAILABLE");
  });

  it("durante execução: UNAVAILABLE real permanece", () => {
    const tel: FooterTelemetry = {
      mso_state: "DELEGATING",
      tasks: [{ name: "worker-1" }],
      sandbox: "ON",
      mso_model: "auto",
      ctx: { value: 12, provenance: "reported" },
      tok_mso: { value: 500, provenance: "reported" },
      tok_workers: { provenance: "UNAVAILABLE" },
      workspace_display: "~/ws",
      git_branch: "main",
      shortcuts: "Ctrl+C Stop",
      idle: false,
    };
    expect(isFooterIdle(tel)).toBe(false);
    const text = renderFooter(tel, { color: false });
    expect(text).toContain("[DELEGATING]");
    expect(text).toContain("Agents: UNAVAILABLE");
    expect(text).not.toContain("Agents: —");
  });
});
