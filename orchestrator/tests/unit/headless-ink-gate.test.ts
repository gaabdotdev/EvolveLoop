/**
 * M6 — headless / !TTY: Ink TUI must not mount when stdout/stdin are not TTYs,
 * when input is injected, or when classic REPL is forced.
 * Prova mínima documentada: shouldUseInkTui → false (fallback classic REPL).
 */
import { afterEach, describe, expect, it } from "vitest";
import { shouldUseInkTui } from "../../src/cli/tui/index.js";

function stubIsTTY(
  stream: NodeJS.WriteStream | NodeJS.ReadStream,
  value: boolean,
): () => void {
  const prev = Object.getOwnPropertyDescriptor(stream, "isTTY");
  Object.defineProperty(stream, "isTTY", {
    configurable: true,
    enumerable: true,
    get: () => value,
  });
  return () => {
    if (prev) Object.defineProperty(stream, "isTTY", prev);
    else delete (stream as { isTTY?: boolean }).isTTY;
  };
}

describe("M6 — headless Ink gate (!process.stdout.isTTY)", () => {
  const restores: Array<() => void> = [];

  afterEach(() => {
    while (restores.length) restores.pop()!();
    delete process.env.EVOLVELOOP_FORCE_CLASSIC_REPL;
    delete process.env.EVOLVELOOP_FORCE_INK;
  });

  it("refuses Ink when stdout is not a TTY", () => {
    restores.push(stubIsTTY(process.stdout, false));
    restores.push(stubIsTTY(process.stdin, true));
    expect(shouldUseInkTui({})).toBe(false);
  });

  it("refuses Ink when stdin is not a TTY", () => {
    restores.push(stubIsTTY(process.stdout, true));
    restores.push(stubIsTTY(process.stdin, false));
    expect(shouldUseInkTui({})).toBe(false);
  });

  it("refuses Ink with injected inputLines (headless/scripted)", () => {
    expect(shouldUseInkTui({ inputLines: ["status", "sair"] })).toBe(false);
  });

  it("refuses Ink when disable_raw_mode is set", () => {
    expect(shouldUseInkTui({ disable_raw_mode: true })).toBe(false);
  });

  it("refuses Ink when EVOLVELOOP_FORCE_CLASSIC_REPL=1 (even if TTY)", () => {
    restores.push(stubIsTTY(process.stdout, true));
    restores.push(stubIsTTY(process.stdin, true));
    process.env.EVOLVELOOP_FORCE_CLASSIC_REPL = "1";
    expect(shouldUseInkTui({})).toBe(false);
  });

  it("refuses Ink when EVOLVELOOP_FORCE_INK=0 (even if TTY)", () => {
    restores.push(stubIsTTY(process.stdout, true));
    restores.push(stubIsTTY(process.stdin, true));
    process.env.EVOLVELOOP_FORCE_INK = "0";
    expect(shouldUseInkTui({})).toBe(false);
  });
});
