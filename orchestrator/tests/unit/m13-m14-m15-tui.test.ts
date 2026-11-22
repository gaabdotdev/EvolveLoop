/**
 * MSO M13 + M14 + M15 — execução viva / slash / card final (prova automatizada).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import {
  ACTIVITY_WINDOW_MAX,
  createActivityWindow,
  formatElapsed,
  isSilentTooLong,
  pushActivityEvent,
  ringTerminalBell,
  SILENCE_WARN_MS,
} from "../../src/cli/tui/activity-window.js";
import { parseSlashCommand, SLASH_COMMANDS } from "../../src/cli/tui/slash-commands.js";
import {
  formatSlashStatus,
  gitDiffStatForSlash,
  runSlashHandler,
} from "../../src/cli/tui/slash-handlers.js";
import {
  buildDeliveryCardView,
  DELIVERY_SHORTCUTS,
} from "../../src/cli/tui/delivery-card-view.js";
import { writeFreellmKeySecure } from "../../src/v3/evolve-shell/provider-readiness.js";
import { spawnSync } from "node:child_process";

describe("M13 — execução viva", () => {
  it("formatElapsed → cronômetro [MM:SS]", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(1_000)).toBe("00:01");
    expect(formatElapsed(61_000)).toBe("01:01");
    expect(formatElapsed(125_999)).toBe("02:05");
    expect(formatElapsed(-50)).toBe("00:00");
  });

  it("janela deslizante mantém ≤5 eventos reais", () => {
    let state = createActivityWindow(0, "INIT");
    for (let i = 0; i < 9; i++) {
      state = pushActivityEvent(state, `real-event-${i}`, i * 100);
    }
    expect(state.events).toHaveLength(ACTIVITY_WINDOW_MAX);
    expect(ACTIVITY_WINDOW_MAX).toBe(5);
    expect(state.events.map((e) => e.text)).toEqual([
      "real-event-4",
      "real-event-5",
      "real-event-6",
      "real-event-7",
      "real-event-8",
    ]);
    // blank lines do not inflate the window
    state = pushActivityEvent(state, "   ", 9_000);
    expect(state.events).toHaveLength(5);
  });

  it("silence >30s → aviso (isSilentTooLong)", () => {
    let state = createActivityWindow(0, "WAITING");
    state = pushActivityEvent(state, "sinal", 1_000);
    expect(SILENCE_WARN_MS).toBe(30_000);
    expect(isSilentTooLong(state, 1_000 + 30_000)).toBe(false);
    expect(isSilentTooLong(state, 1_000 + 30_001)).toBe(true);
  });

  it("bell \\x07 ao concluir ou pausar (TTY)", () => {
    const chunks: string[] = [];
    const fake = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
        cb();
      },
    }) as NodeJS.WriteStream;
    Object.defineProperty(fake, "isTTY", { value: true });

    ringTerminalBell(fake); // complete
    ringTerminalBell(fake); // pause
    expect(chunks.join("")).toBe("\x07\x07");

    const nonTtyChunks: string[] = [];
    const nonTty = new Writable({
      write(chunk, _enc, cb) {
        nonTtyChunks.push(String(chunk));
        cb();
      },
    }) as NodeJS.WriteStream;
    Object.defineProperty(nonTty, "isTTY", { value: false });
    ringTerminalBell(nonTty);
    expect(nonTtyChunks).toEqual([]);
  });
});

describe("M14 — slash commands operacionais", () => {
  let home: string;
  let repo: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "m14-home-"));
    repo = mkdtempSync(join(tmpdir(), "m14-repo-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf-8" });
    writeFileSync(join(repo, "a.txt"), "hello\n");
    spawnSync("git", ["add", "a.txt"], { cwd: repo, encoding: "utf-8" });
    spawnSync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "init"],
      { cwd: repo, encoding: "utf-8" },
    );
    writeFileSync(join(repo, "a.txt"), "hello\nworld\n");
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  it("parseia slash session + jornada", () => {
    expect(SLASH_COMMANDS.map((c) => c.id)).toEqual([
      "plan",
      "approvals",
      "agents",
      "pause",
      "cancel",
      "delivery",
      "history",
      "status",
      "diff",
      "config",
      "clear",
    ]);
    for (const id of [
      "config",
      "diff",
      "status",
      "clear",
      "plan",
      "approvals",
      "agents",
      "pause",
      "cancel",
      "delivery",
      "history",
    ] as const) {
      expect(parseSlashCommand(`/${id}`)).toEqual({
        kind: "slash",
        command: id,
        args: "",
      });
    }
  });

  it("/config grava key com mode 0600 (stat)", () => {
    const secrets = join(home, ".config", "evolveloop", "secrets.env");
    mkdirSync(join(home, ".config", "evolveloop"), { recursive: true });
    const written = writeFreellmKeySecure("sk-test-m14-key-never-log", secrets);
    expect(written.path).toBe(secrets);
    expect(existsSync(secrets)).toBe(true);
    const mode = statSync(secrets).mode & 0o777;
    expect(mode).toBe(0o600);
    const raw = readFileSync(secrets, "utf-8");
    expect(raw).toContain("FREELLMAPI_API_KEY=sk-test-m14-key-never-log");
    // handler opens provider setup path
    expect(runSlashHandler("config").command).toBe("config");
    expect(runSlashHandler("config").message).toMatch(/0600/);
  });

  it("/diff funcional (git diff --stat)", () => {
    const body = gitDiffStatForSlash(repo);
    expect(body).toMatch(/a\.txt/);
    const result = runSlashHandler("diff", { workspace: repo });
    expect(result.command).toBe("diff");
    expect(result.message).toContain("Diff");
    expect(result.message).toContain("a.txt");
  });

  it("/status funcional (campos sessão/contrato/tokens)", () => {
    const body = formatSlashStatus({
      mso_state: "WAITING_AGENTS",
      session_id: "sess-1",
      contract_version: 2,
      provider: "Ollama",
      tokens_mso: "1200",
      tokens_workers: "340",
    });
    expect(body).toContain("Status");
    expect(body).toContain("Session: WAITING_AGENTS (sess-1)");
    expect(body).toContain("Plan: v2");
    expect(body).toContain("Provider: Ollama");
    expect(body).toContain("Tokens: Orchestrator 1200 · Agents 340");
    expect(runSlashHandler("status", { status: { mso_state: "INIT" } }).command).toBe(
      "status",
    );
  });

  it("/clear funcional (mensagem + ação clear)", () => {
    const result = runSlashHandler("clear");
    expect(result.command).toBe("clear");
    expect(result.message).toBe("Histórico visual limpo.");
    // simulate UI clear
    let history = ["a", "b"];
    if (result.command === "clear") history = [];
    expect(history).toEqual([]);
  });
});

describe("M15 — card de entrega final", () => {
  it("asserções de campos: status, diff --stat, prova, tokens, atalhos", () => {
    const view = buildDeliveryCardView({
      status: "PASS",
      diff_stat: " file.ts | 3 +++\n 1 file changed, 3 insertions(+)",
      verification: {
        command: "npx vitest run tests/unit/m13-m14-m15-tui.test.ts",
        exit_code: 0,
      },
      tokens_mso: 1500,
      tokens_workers: 420,
    });

    expect(view.title).toBe("Delivery · Entrega aceita");
    expect(view.status).toBe("PASS");
    expect(view.diff_stat).toContain("file.ts");
    expect(view.diff_stat).toContain("1 file changed");
    expect(view.verification_line).toBe(
      "Verificação: npx vitest run tests/unit/m13-m14-m15-tui.test.ts (exit 0)",
    );
    expect(view.tokens_line).toBe(
      "Tokens: Orchestrator 1500 (reported) · Agents 420 (reported)",
    );
    expect(view.shortcuts).toBe(DELIVERY_SHORTCUTS);
    expect(view.shortcuts).toContain("[Enter]");
    expect(view.shortcuts).toContain("[D]");
    expect(view.shortcuts).toContain("[Q]");
    expect(view.lines.join("\n")).toContain("Arquivos alterados");
  });

  it("tokens zero/ausentes → — (só reais)", () => {
    const view = buildDeliveryCardView({
      status: "BLOCKED",
      diff_stat: "(sem alterações)",
      tokens_mso: 0,
    });
    expect(view.tokens_line).toBe(
      "Tokens: Orchestrator — (indisponível) · Agents — (indisponível)",
    );
    expect(view.verification_line).toContain("Verificação: —");
    expect(view.status).toBe("BLOCKED");
  });
});
