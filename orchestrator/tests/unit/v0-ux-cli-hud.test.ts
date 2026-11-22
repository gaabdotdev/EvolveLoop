/**
 * V0 UX CLI HUD — M1 banner · M2 agents tree · M3 footer honesty.
 */
import { describe, it, expect } from "vitest";
import {
  colorEnabled,
  renderBanner,
  renderBannerCompact,
  renderBannerWide,
  EVOLVELOOP_UX_VERSION,
  buildFooterTelemetry,
  renderFooter,
  formatTokDisplay,
  renderActiveAgentsTree,
  renderHudZones,
  type BannerMeta,
  type FooterTelemetry,
  type ActiveAgentView,
  type WorkspaceSessionSnapshot,
} from "../../src/v3/evolve-shell/index.js";

function baseMeta(over: Partial<BannerMeta> = {}): BannerMeta {
  return {
    mso_state: "INIT",
    daemon: "OFF",
    workspace_display: "~/projetos/evolveloop",
    contract: "v1",
    meta_progress: "UNAVAILABLE",
    tokens_mso: "UNAVAILABLE",
    tokens_workers: "UNAVAILABLE",
    sandbox: "ON",
    providers: "UNAVAILABLE",
    ...over,
  };
}

function emptySession(over: Partial<WorkspaceSessionSnapshot> = {}): WorkspaceSessionSnapshot {
  return {
    workspace: "/home/gaab/projetos/evolveloop",
    initialized: false,
    state_db_path: "/home/gaab/projetos/evolveloop/.evolveloop/state.db",
    state_db_exists: false,
    contracts_count: 0,
    message_pt: "workspace novo",
    ...over,
  };
}

describe("M1 — Banner Núcleo+Órbita", () => {
  it("wide (≥80): 8 lines, progressive metadata (sem UNAVAILABLE)", () => {
    const out = renderBanner(baseMeta(), { columns: 100, color: false, isTTY: true });
    const lines = out.split("\n");
    expect(lines).toHaveLength(8);
    expect(lines[0]).toContain("EvolveLoop v" + EVOLVELOOP_UX_VERSION);
    expect(out).toContain("Estado: Pronto");
    expect(out).toContain("Sandbox: bwrap ON");
    expect(out).not.toContain("UNAVAILABLE");
    expect(out).not.toContain("Daemon: UNAVAILABLE");
    expect(out).not.toContain("Tokens: MSO UNAVAILABLE");
    for (const line of lines) {
      const left = line.slice(0, 18);
      expect(left.length).toBe(18);
    }
    expect(lines.some((l) => l.includes("████"))).toBe(true);
  });

  it("wide: tokens/contract só quando há valores reais", () => {
    const out = renderBanner(
      baseMeta({
        contract: "v2",
        meta_progress: "1/3",
        tokens_mso: "4.2k",
        tokens_workers: "1.1k",
        providers: "Ollama",
        daemon: "ON (attached)",
      }),
      { columns: 100, color: false, isTTY: true },
    );
    expect(out).toContain("Providers: Ollama");
    expect(out).toContain("Contract: v2 · Meta: 1/3");
    expect(out).toContain("Tokens: MSO 4.2k │ Workers 1.1k");
    expect(out).toContain("Daemon: ON (attached)");
    expect(out).not.toContain("UNAVAILABLE");
  });

  it("narrow (<80): compact 2-line header", () => {
    const out = renderBanner(baseMeta(), { columns: 70, color: false, isTTY: true });
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^◉ EvolveLoop v/);
    expect(lines[0]).toContain("Estado: Pronto");
    expect(lines[0]).toContain("bwrap ON");
    expect(lines[1]).toBe("~/projetos/evolveloop");
    expect(out).not.toContain("████");
    expect(out).not.toContain("UNAVAILABLE");
  });

  it("NO_COLOR / !TTY: no ANSI escape sequences", () => {
    const coloredOff = renderBannerWide(baseMeta(), false);
    expect(coloredOff).not.toMatch(/\u001b\[/);

    const viaNoColor = renderBanner(baseMeta(), {
      columns: 100,
      env: { NO_COLOR: "1" },
      isTTY: true,
    });
    expect(viaNoColor).not.toMatch(/\u001b\[/);
    expect(colorEnabled({ env: { NO_COLOR: "1" }, isTTY: true })).toBe(false);
    expect(colorEnabled({ env: {}, isTTY: false })).toBe(false);

    const compact = renderBannerCompact(baseMeta(), false);
    expect(compact).not.toMatch(/\u001b\[/);
  });
});

describe("M3 — Footer telemetria honesta", () => {
  it("idle (pre-execução): IDLE · 0 tasks e — (sem spam UNAVAILABLE); modelo ainda UNAVAILABLE no data", () => {
    const tel = buildFooterTelemetry(emptySession(), { home: "/home/gaab" });
    expect(tel.sandbox).toBe("UNAVAILABLE");
    expect(tel.mso_model).toBe("UNAVAILABLE");
    expect(tel.ctx.provenance).toBe("UNAVAILABLE");
    expect(tel.tok_mso.provenance).toBe("UNAVAILABLE");
    expect(tel.tok_workers.provenance).toBe("UNAVAILABLE");
    expect(tel.git_branch).toBe("UNAVAILABLE");
    expect(tel.workspace_display).toBe("~/projetos/evolveloop");
    expect(tel.idle).toBe(true);

    const text = renderFooter(tel, { color: false });
    const lines = text.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^\[IDLE\] · 0 tasks · Sandbox: —$/);
    expect(lines[1]).toContain("ctx —");
    expect(lines[1]).toContain("tok —");
    expect(lines[1]).toContain("Workers: —");
    expect(text).not.toContain("UNAVAILABLE");
    expect(lines[1]).not.toMatch(/tok 0(?!\d)/);
    expect(lines[1]).not.toContain("Workers: 0");
    expect(lines[2]).toContain("Ctrl+P Pause");
  });

  it("executing + absent worker metric → UNAVAILABLE (honest, not silent 0)", () => {
    const tel = buildFooterTelemetry(emptySession(), {
      home: "/home/gaab",
      executing: true,
      mso_state: "DELEGATING",
      tasks: [{ name: "agy" }],
      sandbox: "ON",
      mso_model: "auto:smart",
      ctx: { value: 10, provenance: "reported" },
      tok_mso: { value: 100, provenance: "reported" },
    });
    expect(tel.idle).toBe(false);
    const text = renderFooter(tel, { color: false });
    expect(text).toContain("[DELEGATING]");
    expect(text).toContain("Workers: UNAVAILABLE");
    expect(text).not.toContain("Workers: 0");
  });

  it("reported metrics show value + provenance; UNAVAILABLE stays red when colored", () => {
    const tel: FooterTelemetry = {
      mso_state: "DELEGATING",
      tasks: [{ name: "agy" }, { name: "test-runner" }],
      sandbox: "ON",
      mso_model: "auto:smart",
      ctx: { value: 26.9, provenance: "reported" },
      tok_mso: { value: 4200, provenance: "reported" },
      tok_workers: { value: 18400, provenance: "reported" },
      workspace_display: "~/projetos/evolveloop",
      git_branch: "chore/v0-consolidation",
      shortcuts: "Ctrl+P Pause · Ctrl+C Stop",
    };
    const plain = renderFooter(tel, { color: false });
    expect(plain.split("\n")[0]).toBe(
      "[DELEGATING] · 2 tasks (agy, test-runner) · Sandbox: bwrap ON",
    );
    expect(plain).toContain("Modelo: auto:smart");
    expect(plain).toContain("ctx 26.9%");
    expect(plain).toContain("tok 4.2k (reported)");
    expect(plain).toContain("Workers: 18.4k (reported)");
    expect(formatTokDisplay(6100)).toBe("6.1k");

    const colored = renderFooter(
      { ...tel, tok_workers: { provenance: "UNAVAILABLE" } },
      { color: true },
    );
    expect(colored).toMatch(/\u001b\[31mUNAVAILABLE\u001b\[0m/);
    expect(colored).toContain("Workers:");
  });
});

describe("M2 — Árvore de agentes + zonas", () => {
  it("renders tree with └/├ and +N queued beyond maxVisible", () => {
    const agents: ActiveAgentView[] = [
      {
        id: "agy",
        model: "auto:smart",
        task: "T3: Evidence Validator",
        elapsed_sec: 42,
        tokens: 6100,
        token_honesty: "reported",
      },
      {
        id: "sub:test-runner",
        task: "T3.1: unit-suite",
        elapsed_sec: 11,
        tokens: 0,
        token_honesty: "local",
      },
      { id: "w3", task: "T4: merge", elapsed_sec: 5, token_honesty: "UNAVAILABLE" },
      { id: "w4", task: "T5: docs", elapsed_sec: 3, tokens: 100, token_honesty: "estimated" },
      { id: "w5", task: "T6: lint", elapsed_sec: 1, tokens: 50, token_honesty: "reported" },
      { id: "w6", task: "T7: queued-a", elapsed_sec: 0, tokens: 1, token_honesty: "reported" },
      { id: "w7", task: "T8: queued-b", elapsed_sec: 0, tokens: 1, token_honesty: "reported" },
    ];
    const tree = renderActiveAgentsTree(agents, { maxVisible: 5 });
    const lines = tree.split("\n");
    expect(lines[0]).toMatch(/^├─ agy \(auto:smart\)/);
    expect(lines[0]).toContain("00:42");
    expect(lines[0]).toContain("6.1k tok (reported)");
    expect(lines[1]).toContain("0 tok (local)");
    expect(lines[2]).toContain("tok UNAVAILABLE");
    expect(lines[lines.length - 1]).toBe("+ 2 queued");
    expect(lines.length).toBe(6); // 5 agents + queued line
  });

  it("empty agents → empty middle zone; hud zones compose stream + footer", () => {
    expect(renderActiveAgentsTree([])).toBe("");
    const block = renderHudZones({
      streamLines: ["olá MSO"],
      agents: [
        {
          id: "agy",
          model: "auto:smart",
          task: "T1: plan",
          elapsed: "00:01",
          tokens: 10,
          token_honesty: "reported",
        },
      ],
      footer: "[INIT] · 1 tasks (agy) · Sandbox: bwrap ON",
    });
    expect(block).toContain("olá MSO");
    expect(block).toMatch(/[├└]─ agy/);
    expect(block).toContain("[INIT]");
  });
});
