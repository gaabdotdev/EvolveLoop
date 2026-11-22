/**
 * M9 — Paste multilinha (bracketed / blob) sem submit prematuro.
 * M10 — Histórico ↑/↓ (últimos 20) + navegação.
 */
import { describe, it, expect } from "vitest";
import {
  applyMultilineInput,
  createMultilineInputState,
  PASTE_START,
  PASTE_END,
} from "../../src/cli/tui/multiline-input-logic.js";
import {
  pushInputHistory,
  INPUT_HISTORY_CAP,
} from "../../src/cli/tui/input-history.js";

describe("M9 — paste multilinha sem submit prematuro", () => {
  it("bracketed paste 30 linhas: buffer completo e zero submit até Enter", () => {
    const lines = Array.from({ length: 30 }, (_, i) => `linha-${i + 1}`);
    const body = lines.join("\n");
    let state = createMultilineInputState();
    let submits = 0;
    let lastSubmit: string | undefined;

    const feed = (input: string, key: Record<string, boolean> = {}) => {
      const r = applyMultilineInput(state, input, key, []);
      state = r.state;
      if (r.effect.type === "submit") {
        submits += 1;
        lastSubmit = r.effect.value;
      }
      return r;
    };

    // Chunk único: markers + 30 linhas (simula paste atômico do terminal).
    feed(`${PASTE_START}${body}${PASTE_END}`);
    expect(state.pasting).toBe(false);
    expect(state.value).toBe(body);
    expect(state.value.split("\n")).toHaveLength(30);
    expect(submits).toBe(0);

    // Enter explícito fora do paste → único submit com conteúdo completo.
    feed("", { return: true });
    expect(submits).toBe(1);
    expect(lastSubmit).toBe(body);
    expect(state.value).toBe("");
  });

  it("bracketed paste em chunks: Enter durante paste vira newline, não submit", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `chunk-${i + 1}`);
    let state = createMultilineInputState();
    let submits = 0;

    const feed = (input: string, key: Record<string, boolean> = {}) => {
      const r = applyMultilineInput(state, input, key, []);
      state = r.state;
      if (r.effect.type === "submit") submits += 1;
    };

    feed(PASTE_START);
    expect(state.pasting).toBe(true);

    for (let i = 0; i < lines.length; i++) {
      feed(lines[i]!);
      if (i < lines.length - 1) {
        // Terminal reescreve CR como key.return durante paste.
        feed("", { return: true });
      }
    }
    expect(submits).toBe(0);
    expect(state.pasting).toBe(true);

    feed(PASTE_END);
    expect(state.pasting).toBe(false);
    expect(state.value.split("\n")).toHaveLength(20);
    expect(state.value).toBe(lines.join("\n"));
    expect(submits).toBe(0);

    feed("", { return: true });
    expect(submits).toBe(1);
  });

  it("blob multilinha sem markers (15–50) entra inteiro sem submit", () => {
    const n = 42;
    const blob = Array.from({ length: n }, (_, i) => `blob-${i}`).join("\n");
    let state = createMultilineInputState();
    const r = applyMultilineInput(state, blob, {}, []);
    state = r.state;

    expect(r.effect.type).toBe("none");
    expect(state.value.split("\n")).toHaveLength(n);
    expect(state.value).toBe(blob);

    const submit = applyMultilineInput(state, "", { return: true }, []);
    expect(submit.effect).toEqual({ type: "submit", value: blob });
  });

  it("Shift+Enter e Alt+Enter inserem newline sem submit", () => {
    let state = createMultilineInputState("a");
    let r = applyMultilineInput(state, "", { return: true, shift: true }, []);
    expect(r.effect.type).toBe("none");
    expect(r.state.value).toBe("a\n");

    r = applyMultilineInput(r.state, "", { return: true, meta: true }, []);
    expect(r.effect.type).toBe("none");
    expect(r.state.value).toBe("a\n\n");
  });
});

describe("M10 — histórico ↑/↓ (últimos 20)", () => {
  it("ring buffer persiste no máximo 20 prompts (newest last)", () => {
    let hist: string[] = [];
    for (let i = 0; i < 25; i++) {
      hist = pushInputHistory(hist, `prompt-${i}`);
    }
    expect(INPUT_HISTORY_CAP).toBe(20);
    expect(hist).toHaveLength(20);
    expect(hist[0]).toBe("prompt-5");
    expect(hist[19]).toBe("prompt-24");
  });

  it("↑ navega para prompts anteriores; ↓ restaura draft", () => {
    const history = ["alpha", "bravo", "charlie"];
    let state = createMultilineInputState("draft-atual");
    let submits = 0;

    const feed = (input: string, key: Record<string, boolean> = {}) => {
      const r = applyMultilineInput(state, input, key, history);
      state = r.state;
      if (r.effect.type === "submit") submits += 1;
    };

    feed("", { upArrow: true });
    expect(state.value).toBe("charlie");
    expect(state.histIdx).toBe(2);

    feed("", { upArrow: true });
    expect(state.value).toBe("bravo");
    expect(state.histIdx).toBe(1);

    feed("", { upArrow: true });
    expect(state.value).toBe("alpha");
    expect(state.histIdx).toBe(0);

    // Já no mais antigo — ↑ não muda.
    feed("", { upArrow: true });
    expect(state.value).toBe("alpha");
    expect(state.histIdx).toBe(0);

    feed("", { downArrow: true });
    expect(state.value).toBe("bravo");

    feed("", { downArrow: true });
    expect(state.value).toBe("charlie");

    // Passar do mais recente restaura o draft pré-história.
    feed("", { downArrow: true });
    expect(state.histIdx).toBeNull();
    expect(state.value).toBe("draft-atual");
    expect(submits).toBe(0);
  });

  it("submit após navegar histórico não dispara submit nas setas", () => {
    const history = pushInputHistory(
      pushInputHistory([], "um"),
      "dois",
    );
    let state = createMultilineInputState("");
    let submits: string[] = [];

    const feed = (input: string, key: Record<string, boolean> = {}) => {
      const r = applyMultilineInput(state, input, key, history);
      state = r.state;
      if (r.effect.type === "submit") submits.push(r.effect.value);
    };

    feed("", { upArrow: true });
    expect(state.value).toBe("dois");
    feed("", { upArrow: true });
    expect(state.value).toBe("um");
    expect(submits).toEqual([]);

    feed("", { return: true });
    expect(submits).toEqual(["um"]);
    expect(state.value).toBe("");
  });
});
