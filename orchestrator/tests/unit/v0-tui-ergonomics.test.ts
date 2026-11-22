/**
 * TUI ergonomics — banner/footer idle sem UNAVAILABLE, input history,
 * slash commands, activity window, goal contract sem eco.
 */
import { describe, it, expect } from "vitest";
import {
  renderBanner,
  buildFooterTelemetry,
  type BannerMeta,
  type WorkspaceSessionSnapshot,
} from "../../src/v3/evolve-shell/index.js";
import { renderCompactFooter } from "../../src/cli/tui/footer-compact.js";
import { pushInputHistory } from "../../src/cli/tui/input-history.js";
import { parseSlashCommand, SLASH_COMMANDS } from "../../src/cli/tui/slash-commands.js";
import {
  ACTIVITY_WINDOW_MAX,
  createActivityWindow,
  isSilentTooLong,
  pushActivityEvent,
  silenceMs,
  SILENCE_WARN_MS,
} from "../../src/cli/tui/activity-window.js";
import {
  buildGoalDisplay,
  formatGoalDisplayLines,
  shortObjectiveTitle,
} from "../../src/cli/tui/goal-display.js";
import { stripCrudeMarkdown } from "../../src/cli/tui/markdown-lite.js";

function idleBannerMeta(over: Partial<BannerMeta> = {}): BannerMeta {
  return {
    mso_state: "INIT",
    daemon: "UNAVAILABLE",
    workspace_display: "~/ws",
    contract: "—",
    meta_progress: "UNAVAILABLE",
    tokens_mso: "UNAVAILABLE",
    tokens_workers: "UNAVAILABLE",
    sandbox: "ON",
    providers: "Ollama",
    ...over,
  };
}

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

describe("TUI banner + footer idle — zero UNAVAILABLE", () => {
  it("banner ocioso não imprime UNAVAILABLE", () => {
    const out = renderBanner(idleBannerMeta(), {
      columns: 100,
      color: false,
      isTTY: true,
    });
    expect(out).toContain("EvolveLoop v");
    expect(out).toContain("Providers: Ollama");
    expect(out).toContain("Sandbox: bwrap ON");
    expect(out).toContain("Estado: Pronto");
    expect(out).not.toContain("UNAVAILABLE");
    expect(out).not.toContain("Daemon:");
    expect(out).not.toContain("Tokens:");
  });

  it("rodapé compacto idle: 1 linha sem UNAVAILABLE", () => {
    const tel = buildFooterTelemetry(emptySession(), {
      home: "/tmp",
      idle: true,
      sandbox: "ON",
    });
    const compact = renderCompactFooter(tel, { providers_ready: "Ollama" });
    expect(compact.mode).toBe("idle");
    expect(compact.lines).toHaveLength(1);
    expect(compact.lines[0]).toContain("~/ws");
    expect(compact.lines[0]).toContain("Ollama");
    expect(compact.lines[0]).toContain("bwrap ON");
    expect(compact.lines[0]).toContain("/config");
    expect(compact.lines.join("\n")).not.toContain("UNAVAILABLE");
  });

  it("rodapé compacto executing: 2 linhas só com métricas reais", () => {
    const tel = buildFooterTelemetry(emptySession(), {
      home: "/tmp",
      executing: true,
      mso_state: "DELEGATING",
      sandbox: "ON",
      tok_mso: { value: 1200, provenance: "reported" },
      tasks: [{ name: "worker-1" }],
    });
    const compact = renderCompactFooter(tel);
    expect(compact.mode).toBe("executing");
    expect(compact.lines).toHaveLength(2);
    expect(compact.lines[0]).toContain("[DELEGATING]");
    expect(compact.lines[0]).toContain("tok MSO 1.2k");
    expect(compact.lines[0]).not.toContain("UNAVAILABLE");
    expect(compact.lines[1]).toContain("Ctrl+P");
  });
});

describe("input history ↑/↓ helpers", () => {
  it("mantém no máximo 20 prompts sem duplicar o topo", () => {
    let hist: string[] = [];
    for (let i = 0; i < 25; i++) {
      hist = pushInputHistory(hist, `cmd-${i}`);
    }
    expect(hist).toHaveLength(20);
    expect(hist[0]).toBe("cmd-5");
    expect(hist[19]).toBe("cmd-24");
    hist = pushInputHistory(hist, "cmd-24");
    expect(hist[19]).toBe("cmd-24");
    expect(hist.filter((x) => x === "cmd-24")).toHaveLength(1);
  });
});

describe("slash commands", () => {
  it("parseia /config /diff /status /clear", () => {
    expect(parseSlashCommand("/config")).toEqual({
      kind: "slash",
      command: "config",
      args: "",
    });
    expect(parseSlashCommand("/diff")).toEqual({
      kind: "slash",
      command: "diff",
      args: "",
    });
    expect(parseSlashCommand("/status")).toEqual({
      kind: "slash",
      command: "status",
      args: "",
    });
    expect(parseSlashCommand("/clear")).toEqual({
      kind: "slash",
      command: "clear",
      args: "",
    });
    expect(SLASH_COMMANDS.map((c) => c.id)).toEqual([
      "config",
      "diff",
      "status",
      "clear",
    ]);
  });

  it("partial /c sugere config e clear", () => {
    const p = parseSlashCommand("/c");
    expect(p.kind).toBe("partial");
    if (p.kind === "partial") {
      expect(p.matches.map((m) => m.id).sort()).toEqual(["clear", "config"]);
    }
  });

  it("texto normal não é slash", () => {
    expect(parseSlashCommand("criar healthcheck")).toEqual({ kind: "none" });
  });
});

describe("activity window + silêncio >30s", () => {
  it("mantém no máximo 5 eventos (janela deslizante)", () => {
    let state = createActivityWindow(1_000, "INIT");
    for (let i = 0; i < 8; i++) {
      state = pushActivityEvent(state, `evento-${i}`, 1_000 + i * 10);
    }
    expect(state.events).toHaveLength(ACTIVITY_WINDOW_MAX);
    expect(state.events[0]!.text).toBe("evento-3");
    expect(state.events[4]!.text).toBe("evento-7");
  });

  it("após >30s sem sinal → aviso de silêncio", () => {
    let state = createActivityWindow(0, "WAITING_AGENTS");
    state = pushActivityEvent(state, "MSO → WAITING_AGENTS", 100);
    expect(isSilentTooLong(state, 100 + SILENCE_WARN_MS)).toBe(false);
    expect(isSilentTooLong(state, 100 + SILENCE_WARN_MS + 1)).toBe(true);
    expect(silenceMs(state, 100 + 45_000)).toBe(45_000);
  });
});

describe("Goal Contract sem eco Objetivo/Escopo", () => {
  it("título curto em Objetivo; escopo sem repetir o prompt", () => {
    const prompt =
      "Adicionar um endpoint HTTP /health que responda 200 OK com body ok e testes unitários.";
    const display = buildGoalDisplay({
      objective: prompt,
      scope: [prompt, "endpoint /health", "testes unitários"],
      criteria: "npm test verde",
      risks: "sem auth",
      version: "v1",
    });
    expect(display.objective_title).toBe(shortObjectiveTitle(prompt));
    expect(display.objective_title.length).toBeLessThanOrEqual(72);
    expect(display.scope_items).not.toContain(prompt);
    expect(display.scope_items).toEqual(["endpoint /health", "testes unitários"]);
    const lines = formatGoalDisplayLines(display);
    expect(lines[0]).toMatch(/^Objetivo:/);
    expect(lines[1]).toMatch(/^Escopo:/);
    expect(lines[1]).not.toContain(prompt);
    // Objetivo title must not appear again as the sole Escopo content
    expect(lines[1]).not.toBe(`Escopo: ${display.objective_title}`);
  });

  it("quando scope == objective, Escopo fica —", () => {
    const prompt = "Ship auth JWT";
    const display = buildGoalDisplay({
      objective: prompt,
      scope: [prompt],
      criteria: "tests",
    });
    expect(display.scope_items).toEqual([]);
    expect(formatGoalDisplayLines(display)[1]).toBe("Escopo: —");
  });
});

describe("markdown lite", () => {
  it("remove # / ## crus", () => {
    expect(stripCrudeMarkdown("# Título\n## Sub\ncorpo")).toBe(
      "Título\nSub\ncorpo",
    );
  });
});
