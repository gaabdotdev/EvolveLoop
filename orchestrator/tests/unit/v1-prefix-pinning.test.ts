/**
 * V1-TOK-08 — Prefix Pinning: byte-identical pinned prefix for KV-cache reuse.
 */

import { describe, it, expect } from "vitest";
import {
  PIN_BOUNDARY,
  buildPinnedPrefix,
  buildPromptWithPinnedPrefix,
  splitAtPinBoundary,
} from "../../src/v3/token-economy/index.js";

const BASE = {
  systemRules: "No unrestricted read_file.\nTelegraphic EN only.",
  goalContract: "GOAL: ship token economy V1\nACCEPT: vitest green",
  repoSymbolMap: "src/a.ts|1|10|function|foo\nsrc/b.ts|2|5|class|Bar",
};

describe("V1-TOK-08 prefix pinning", () => {
  it("two builds with same inputs → identical prefix string", () => {
    const a = buildPinnedPrefix(BASE);
    const b = buildPinnedPrefix({ ...BASE });
    expect(a).toBe(b);
    expect(a).toContain("[System Rules]");
    expect(a).toContain("[Goal Contract]");
    expect(a).toContain("[Repo Symbol Map]");
    expect(a.endsWith(PIN_BOUNDARY)).toBe(true);

    const p1 = buildPromptWithPinnedPrefix(BASE, "turn=1\nworker_goal=fix tests");
    const p2 = buildPromptWithPinnedPrefix(BASE, "turn=1\nworker_goal=fix tests");
    expect(p1.prefix).toBe(p2.prefix);
    expect(p1.prompt).toBe(p2.prompt);
  });

  it("changing turn goal changes only after pin boundary", () => {
    const first = buildPromptWithPinnedPrefix(BASE, "worker_goal=task-A");
    const second = buildPromptWithPinnedPrefix(BASE, "worker_goal=task-B");

    expect(first.prefix).toBe(second.prefix);
    expect(first.prompt.slice(0, first.pinBoundaryIndex + PIN_BOUNDARY.length)).toBe(
      second.prompt.slice(0, second.pinBoundaryIndex + PIN_BOUNDARY.length),
    );

    const split1 = splitAtPinBoundary(first.prompt);
    const split2 = splitAtPinBoundary(second.prompt);
    expect(split1.prefix).toBe(split2.prefix);
    expect(split1.afterPin).not.toBe(split2.afterPin);
    expect(split1.afterPin).toContain("task-A");
    expect(split2.afterPin).toContain("task-B");
  });

  it("normalizes CRLF / trailing spaces so pin stays byte-stable", () => {
    const messy = buildPinnedPrefix({
      systemRules: "rule-a  \r\nrule-b\r",
      goalContract: "GOAL: x  ",
      repoSymbolMap: "a.ts|1|foo\r\n",
    });
    const clean = buildPinnedPrefix({
      systemRules: "rule-a\nrule-b",
      goalContract: "GOAL: x",
      repoSymbolMap: "a.ts|1|foo",
    });
    expect(messy).toBe(clean);
  });

  it("changing Goal Contract changes the pinned prefix itself", () => {
    const a = buildPinnedPrefix(BASE);
    const b = buildPinnedPrefix({ ...BASE, goalContract: "GOAL: different" });
    expect(a).not.toBe(b);
    expect(a.split(PIN_BOUNDARY)[0]).not.toBe(b.split(PIN_BOUNDARY)[0]);
  });
});
