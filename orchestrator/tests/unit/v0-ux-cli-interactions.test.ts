/**
 * V0 UX CLI interactions — M4–M8 acceptance (spec §5 / §7 / §8).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildFooterTelemetry,
  renderFooter,
  renderBanner,
  colorEnabled,
  LOCAL_ZERO_TOK_TAG,
  withLocalZeroTokTag,
  renderWorkspaceScanLine,
  formatGrillMeQuestionUx,
  renderGoalContractCard,
  renderCapabilityGatePrompt,
  renderProviderFallbackLine,
  parseCapabilityGateChoice,
  createShellEventBus,
  attachKeybindings,
  MSG_INTERRUPT_GRACEFUL,
  MSG_INTERRUPT_FORCED,
  MSG_PAUSE,
  MSG_DETACH_OK,
  MSG_DETACH_OFF_WARN,
  formatDaemonBannerLabel,
  runEvolveShell,
  type BannerMeta,
  type WorkspaceSessionSnapshot,
  type DaemonAttachInfo,
} from "../../src/v3/evolve-shell/index.js";
import { applyTrivialBypass, matchTrivialIntent } from "../../src/v3/grill-me/trivial-bypass.js";
import { StateDb, defaultStateDbPath } from "../../src/v3/state-db/index.js";

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

describe("M8.1 — footer UNAVAILABLE when metric absent (never tok 0 without provenance)", () => {
  it("buildFooterTelemetry + renderFooter never invent silent tok 0", () => {
    const tel = buildFooterTelemetry(emptySession(), { home: "/home/gaab" });
    expect(tel.tok_mso.provenance).toBe("UNAVAILABLE");
    expect(tel.tok_workers.provenance).toBe("UNAVAILABLE");
    const text = renderFooter(tel, { color: false });
    expect(text).toContain("tok UNAVAILABLE");
    expect(text).toContain("Workers: UNAVAILABLE");
    expect(text).not.toMatch(/tok 0(?!\d)/);
    expect(text).not.toContain("Workers: 0");
  });
});

describe("M8.2 — tag [local · 0 tok] on local routing", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-ux-local-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("exact tag constant and helper", () => {
    expect(LOCAL_ZERO_TOK_TAG).toBe("[local · 0 tok]");
    expect(withLocalZeroTokTag("Status ok")).toBe(`Status ok ${LOCAL_ZERO_TOK_TAG}`);
    expect(withLocalZeroTokTag(`já ${LOCAL_ZERO_TOK_TAG}`)).toContain(LOCAL_ZERO_TOK_TAG);
  });

  it("trivial bypass status / quais tarefas / quanto gastou / help carry tag", () => {
    expect(matchTrivialIntent("status")?.kind).toBe("status");
    expect(matchTrivialIntent("quais tarefas")?.kind).toBe("progress");
    expect(matchTrivialIntent("quanto gastou")?.kind).toBe("status");
    expect(matchTrivialIntent("help")?.kind).toBe("ops_help");

    const db = new StateDb(defaultStateDbPath(tmp));
    try {
      for (const intent of ["status", "quais tarefas", "quanto gastou?", "ajuda", "pausar"]) {
        const out = applyTrivialBypass(intent, db);
        expect(out).toBeTruthy();
        expect(out!.message_pt).toContain(LOCAL_ZERO_TOK_TAG);
        expect(out!.tokens_used).toBe(0);
      }
    } finally {
      db.close();
    }
  });

  it("shell status path tags local zero tok", async () => {
    const result = await runEvolveShell({
      workspace: tmp,
      inputLines: ["status", "sair"],
      disable_raw_mode: true,
      daemon_attach: {
        active: false,
        attached: false,
        clients: null,
        sock_path: path.join(tmp, ".evolveloop", "runtime.sock"),
        inbox_sync: "unavailable",
      },
    });
    expect(result.lines.some((l) => l.includes(LOCAL_ZERO_TOK_TAG))).toBe(true);
  });
});

describe("M8.3 — banner compact columns=70 / wide=120; NO_COLOR without ANSI", () => {
  it("columns 70 compact; 120 wide; NO_COLOR strips ANSI", () => {
    const compact = renderBanner(baseMeta({ daemon: "ON (attached · 2 clientes)" }), {
      columns: 70,
      color: false,
      isTTY: true,
    });
    expect(compact.split("\n")).toHaveLength(2);
    expect(compact).toMatch(/^◉ EvolveLoop/);
    expect(compact).not.toContain("████");

    const wide = renderBanner(baseMeta({ daemon: "ON (attached · 2 clientes)" }), {
      columns: 120,
      color: false,
      isTTY: true,
    });
    expect(wide.split("\n")).toHaveLength(8);
    expect(wide).toContain("Daemon: ON (attached · 2 clientes)");
    expect(wide).toContain("████");

    const noColor = renderBanner(baseMeta(), {
      columns: 120,
      env: { NO_COLOR: "1" },
      isTTY: true,
    });
    expect(noColor).not.toMatch(/\u001b\[/);
    expect(colorEnabled({ env: { NO_COLOR: "1" }, isTTY: true })).toBe(false);

    const scanPlain = renderWorkspaceScanLine({ animated: false });
    expect(scanPlain).toBe("Lendo workspace (git, stack, símbolos)...");
    expect(scanPlain).not.toContain("⠋");
    const scanAnim = renderWorkspaceScanLine({ animated: true });
    expect(scanAnim.startsWith("⠋ ")).toBe(true);
  });

  it("Grill-Me UX labels + Goal Contract card", () => {
    const q = formatGrillMeQuestionUx(
      { prompt_pt: "Qual estratégia?", default_answer: "JWT local" },
      2,
      4,
    );
    expect(q).toContain("[Grill-Me 2/4]");
    expect(q).toContain("Padrão recomendado: JWT local (pressione Enter para aceitar)");

    const card = renderGoalContractCard({
      objective: "Ship auth",
      scope: "API",
      criteria: "tests green",
      risks: "sem OAuth",
      version: "v1",
    });
    const lines = card.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/^Objetivo:/);
    expect(lines[4]).toBe("Versão: v1");
  });
});

describe("M8.4 — capability gate A/N/C + fallback line", () => {
  it("renderCapabilityGatePrompt + parse A/N/C", () => {
    const block = renderCapabilityGatePrompt(
      {
        agent: "agy",
        action: "filesystem.delete",
        reason: "destructive outside allowlist",
      },
      { color: false },
    );
    expect(block).toContain("BLOCKED · Capability Gate");
    expect(block).toContain("Agente: agy");
    expect(block).toContain("Ação: filesystem.delete");
    expect(block).toContain("Motivo: destructive outside allowlist");
    expect(block).toContain("[A]provar uma vez · [N]egar e instruir alternativa · [C]ancelar tarefa");
    expect(parseCapabilityGateChoice("A")).toBe("approve");
    expect(parseCapabilityGateChoice("n")).toBe("deny");
    expect(parseCapabilityGateChoice("cancelar")).toBe("cancel");
  });

  it("renderProviderFallbackLine matches spec format", () => {
    const line = renderProviderFallbackLine({
      provider: "FreeLLMAPI",
      code: 429,
      cooldown_s: 60,
      fallback_to: "cursor-agent",
      attempts: 0,
    });
    expect(line).toBe(
      "⚠ Infra: FreeLLMAPI 429 (cooldown 60s) → fallback para cursor-agent (checkpoint preservado · 0/3 tentativas consumidas)",
    );
  });

  it("EventBus stub surfaces BLOCKED and PROVIDER_FAULT in shell", async () => {
    const bus = createShellEventBus();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-ux-bus-"));
    try {
      const result = await runEvolveShell({
        workspace: tmp,
        inputLines: ["sair"],
        disable_raw_mode: true,
        event_bus: bus,
        seed_events: [
          {
            type: "BLOCKED",
            agent: "worker-1",
            action: "secrets.read",
            reason: "taint",
          },
          {
            type: "PROVIDER_FAULT",
            provider: "FreeLLMAPI",
            code: 429,
            cooldown_s: 60,
            fallback_to: "cursor-agent",
            attempts: 1,
          },
        ],
        daemon_attach: {
          active: false,
          attached: false,
          clients: null,
          sock_path: path.join(tmp, ".evolveloop", "runtime.sock"),
          inbox_sync: "unavailable",
        },
      });
      expect(result.lines.some((l) => l.includes("BLOCKED · Capability Gate"))).toBe(true);
      expect(
        result.lines.some((l) =>
          l.includes("⚠ Infra: FreeLLMAPI 429") && l.includes("1/3 tentativas"),
        ),
      ).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("§8.2 — 3 eventos rápidos durante input: buffer + flush sem contaminar a linha", async () => {
    const bus = createShellEventBus();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-ux-bus-lock-"));
    let sawPendingDuringInput = 0;
    let emittedBurst = false;
    try {
      const result = await runEvolveShell({
        workspace: tmp,
        inputLines: ["status", "sair"],
        disable_raw_mode: true,
        event_bus: bus,
        daemon_attach: {
          active: false,
          attached: false,
          clients: null,
          sock_path: path.join(tmp, ".evolveloop", "runtime.sock"),
          inbox_sync: "unavailable",
        },
        on_awaiting_input: () => {
          if (emittedBurst) return;
          emittedBurst = true;
          // Simulate 3 parallel tasks emitting while user is still typing.
          bus.emit({
            type: "PROVIDER_FAULT",
            provider: "FreeLLMAPI",
            code: 429,
            cooldown_s: 30,
            fallback_to: "cursor-agent",
            attempts: 0,
          });
          bus.emit({
            type: "PROVIDER_FAULT",
            provider: "OpenRouter",
            code: 503,
            cooldown_s: 10,
            fallback_to: "local-ollama",
            attempts: 1,
          });
          bus.emit({
            type: "BLOCKED",
            agent: "worker-parallel",
            action: "net.egress",
            reason: "dlp hold",
          });
          sawPendingDuringInput = bus.pendingCount();
        },
      });

      expect(sawPendingDuringInput).toBe(3);
      expect(bus.pendingCount()).toBe(0);
      expect(result.exit_code).toBe(0);
      expect(result.lines.some((l) => l.includes("Até breve"))).toBe(true);

      const infra429 = result.lines.filter((l) => l.includes("⚠ Infra: FreeLLMAPI 429"));
      const infra503 = result.lines.filter((l) => l.includes("⚠ Infra: OpenRouter 503"));
      const blocked = result.lines.filter((l) => l.includes("BLOCKED · Capability Gate"));
      expect(infra429).toHaveLength(1);
      expect(infra503).toHaveLength(1);
      expect(blocked).toHaveLength(1);

      // Input line must not be contaminated into event payloads.
      for (const line of [...infra429, ...infra503, ...blocked]) {
        expect(line).not.toMatch(/\bstatus\b/i);
        expect(line).not.toMatch(/\bsair\b/i);
      }

      // Flush order: events appear before status panel from the submitted command.
      const firstEventIdx = result.lines.findIndex(
        (l) =>
          l.includes("⚠ Infra: FreeLLMAPI 429") ||
          l.includes("BLOCKED · Capability Gate"),
      );
      const statusIdx = result.lines.findIndex((l) => l.includes(LOCAL_ZERO_TOK_TAG));
      expect(firstEventIdx).toBeGreaterThanOrEqual(0);
      expect(statusIdx).toBeGreaterThan(firstEventIdx);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("M8.5 — keybindings pause + double Ctrl+C + detach", () => {
  it("emit pause / interrupt / interrupt_forced / detach", () => {
    const seen: string[] = [];
    const ctrl = attachKeybindings({ isTTY: false } as NodeJS.ReadStream, {
      onPause: () => seen.push("pause"),
      onResume: () => seen.push("resume"),
      onInterrupt: () => seen.push("interrupt"),
      onInterruptForced: () => seen.push("forced"),
      onDetach: () => seen.push("detach"),
    });
    expect(ctrl.raw_mode_active).toBe(false);
    ctrl.emit("pause");
    ctrl.emit("interrupt");
    ctrl.emit("interrupt_forced");
    ctrl.emit("detach");
    expect(seen).toEqual(["pause", "interrupt", "forced", "detach"]);
    ctrl.dispose();
  });

  it("shell wires messages for pause, graceful, forced, detach ON", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-ux-keys-"));
    try {
      const daemonOn: DaemonAttachInfo = {
        active: true,
        attached: true,
        clients: 2,
        sock_path: path.join(tmp, ".evolveloop", "runtime.sock"),
        inbox_sync: "enabled",
      };
      expect(formatDaemonBannerLabel(daemonOn)).toBe("ON (attached · 2 clientes)");

      const result = await runEvolveShell({
        workspace: tmp,
        inputLines: [],
        disable_raw_mode: true,
        daemon_attach: daemonOn,
        on_ready: (ctrl) => {
          ctrl.emit("pause");
          ctrl.emit("interrupt");
          ctrl.emit("interrupt_forced");
        },
      });
      expect(result.daemon_label).toBe("ON (attached · 2 clientes)");
      expect(result.lines).toContain(MSG_PAUSE);
      expect(result.lines).toContain(MSG_INTERRUPT_GRACEFUL);
      expect(result.lines).toContain(MSG_INTERRUPT_FORCED);
      expect(result.interrupt_forced).toBe(true);

      const detachRun = await runEvolveShell({
        workspace: tmp,
        inputLines: [],
        disable_raw_mode: true,
        daemon_attach: daemonOn,
        on_ready: (ctrl) => ctrl.emit("detach"),
      });
      expect(detachRun.lines).toContain(MSG_DETACH_OK);
      expect(detachRun.detached).toBe(true);

      const offRun = await runEvolveShell({
        workspace: tmp,
        inputLines: [],
        disable_raw_mode: true,
        daemon_attach: {
          active: false,
          attached: false,
          clients: null,
          sock_path: daemonOn.sock_path,
          inbox_sync: "unavailable",
        },
        on_ready: (ctrl) => ctrl.emit("detach"),
      });
      expect(offRun.lines).toContain(MSG_DETACH_OFF_WARN);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
