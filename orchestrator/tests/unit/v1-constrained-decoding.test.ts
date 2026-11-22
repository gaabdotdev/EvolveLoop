/**
 * V1-TOK-16 — Constrained decoding request builder attaches grammar on layer 0.
 */

import { describe, it, expect } from "vitest";
import {
  buildConstrainedLocalRequest,
  attachGrammarIfLayer0,
} from "../../src/v3/model-providers/index.js";

describe("V1-TOK-16 constrained decoding", () => {
  const gbnf = {
    dialect: "gbnf" as const,
    source: 'root ::= "ok" | "fail"',
    name: "binary",
  };

  it("attaches grammar when layer is 0", () => {
    const body = buildConstrainedLocalRequest({
      prompt: "emit status",
      layer: 0,
      grammar: gbnf,
      model: "bonsai-64k:latest",
    });
    expect(body.layer).toBe(0);
    expect(body.constrained).toBe(true);
    expect(body.enforcement).toBe("request_plumbing_only");
    expect(body.grammar).toBe(gbnf.source);
    expect(body.options?.grammar).toBe(gbnf.source);
    expect(body.stream).toBe(false);
  });

  it("never claims live GBNF enforcement even when grammar is attached", () => {
    const body = buildConstrainedLocalRequest({
      prompt: "emit status",
      layer: 0,
      grammar: gbnf,
    });
    expect(body.constrained).toBe(true);
    expect(body.enforcement).toBe("request_plumbing_only");
  });

  it("does not attach grammar for layer 1/2", () => {
    const body1 = buildConstrainedLocalRequest({
      prompt: "x",
      layer: 1,
      grammar: gbnf,
    });
    expect(body1.constrained).toBe(false);
    expect(body1.grammar).toBeUndefined();

    const body2 = buildConstrainedLocalRequest({
      prompt: "x",
      layer: 2,
      grammar: gbnf,
    });
    expect(body2.constrained).toBe(false);
  });

  it("attachGrammarIfLayer0 is a no-op for non-zero layers", () => {
    const base = { prompt: "hi" };
    const l0 = attachGrammarIfLayer0(base, 0, gbnf);
    expect(l0.grammar?.source).toBe(gbnf.source);
    const l2 = attachGrammarIfLayer0(base, 2, gbnf);
    expect(l2.grammar).toBeUndefined();
    expect(l2.layer).toBe(2);
  });
});
