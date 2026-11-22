/**
 * M11 — Grill-Me adaptativo:
 * (a) prompt detalhado → 1 card confirmação;
 * (b) prompt vago → ≤3 perguntas Select/MultiSelect;
 * (c) ausência de jargão interno vazado ao usuário.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assessIntentDetail,
  isDetailedIntent,
  grillInterviewBudget,
  deriveScopeFromIntent,
  scrubInternalJargon,
  containsLeakedInternalJargon,
  buildGrillMeQuestions,
  resolveAnswers,
  buildGrillMeResultFromAnswers,
  formatQuestionForUser,
  formatInterviewLabel,
} from "../../src/v3/grill-me/index.js";
import { silentScan } from "../../src/v3/workspace-scan/index.js";
import { renderGoalContractCard } from "../../src/v3/evolve-shell/grill-ux.js";
import {
  buildGoalDisplay,
  formatGoalDisplayLines,
} from "../../src/cli/tui/goal-display.js";

const DETAILED_INTENT = [
  "Refatorar a camada de CLI interativa para Ink.",
  "Escopo: TUI com banner, footer IDLE e input multilinha.",
  "Critério de aceite: npm test verde e evolve --help fora do repo.",
  "Fora de escopo: alterar Evidence Validator ou Token Ledger.",
  "- Suportar bracketed paste",
  "- Auto-cura de stale lock",
].join("\n");

const VAGUE_INTENT = "melhorar o CLI";

function collectUserFacingSurfaces(
  intent: string,
  qs: ReturnType<typeof buildGrillMeQuestions>,
  card: string,
): string[] {
  const surfaces: string[] = [
    formatInterviewLabel(1, qs.length || 1),
    card,
  ];
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i]!;
    surfaces.push(formatQuestionForUser(q, i + 1, qs.length));
    surfaces.push(q.prompt_pt);
    surfaces.push(q.default_answer);
    for (const c of q.choices ?? []) surfaces.push(c);
  }
  surfaces.push(intent);
  return surfaces;
}

describe("M11 Grill-Me adaptativo", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "v0-grill-adapt-"));
    await fs.writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "adapt-fixture", version: "0.0.1" }),
      "utf-8",
    );
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("(a) prompt detalhado → assessment detailed_review + 1 card confirmação (sem entrevista)", () => {
    const a = assessIntentDetail(DETAILED_INTENT);
    expect(a.mode).toBe("detailed_review");
    expect(isDetailedIntent(DETAILED_INTENT)).toBe(true);
    expect(a.max_questions).toBe(0);
    // UX interview budget: zero real questions → single review card
    expect(grillInterviewBudget(DETAILED_INTENT)).toBe(0);

    const scan = silentScan(tmp);
    // Internal defaults still materialize for the contract draft (≥2).
    const qs = buildGrillMeQuestions(DETAILED_INTENT, scan);
    expect(qs.length).toBeGreaterThanOrEqual(2);
    const answers = resolveAnswers(
      qs,
      qs.map(() => "ok"),
    );
    const grill = buildGrillMeResultFromAnswers(
      DETAILED_INTENT,
      scan,
      qs,
      answers,
    );
    const display = buildGoalDisplay({
      objective: grill.objective ?? DETAILED_INTENT,
      scope: grill.accepted_scope,
      criteria: grill.acceptance_criteria[0]?.description ?? "",
      risks: grill.rejected_scope.join("; "),
    });
    const cardLines = formatGoalDisplayLines(display);

    // Single confirmation card fields — not a sequence of interview prompts
    expect(cardLines).toHaveLength(5);
    expect(cardLines[0]).toMatch(/^Objetivo:/);
    expect(cardLines[1]).toMatch(/^Escopo:/);
    expect(cardLines.join("\n")).not.toMatch(/Pergunta\s+\d+\/\d+/i);
    expect(cardLines.join("\n")).not.toMatch(/Grill[- ]?Me/i);
    // Derived scope (not prompt echo)
    expect(display.scope_items.length).toBeGreaterThan(0);
    expect(display.scope_items.join(" ")).not.toBe(display.objective_title);
    expect(deriveScopeFromIntent(DETAILED_INTENT).length).toBeGreaterThan(0);
  });

  it("(b) prompt vago → ≤3 perguntas com choices Select/MultiSelect", () => {
    const a = assessIntentDetail(VAGUE_INTENT);
    expect(a.mode).toBe("vague_questions");
    expect(a.max_questions).toBeLessThanOrEqual(3);
    expect(isDetailedIntent(VAGUE_INTENT)).toBe(false);
    const budget = grillInterviewBudget(VAGUE_INTENT);
    expect(budget).toBeGreaterThanOrEqual(2);
    expect(budget).toBeLessThanOrEqual(3);

    const scan = silentScan(tmp);
    const qs = buildGrillMeQuestions(VAGUE_INTENT, scan);
    expect(qs.length).toBeGreaterThanOrEqual(2);
    expect(qs.length).toBeLessThanOrEqual(3);
    expect(qs.length).toBeLessThanOrEqual(budget);
    for (const q of qs) {
      expect(q.choices?.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(q.choices).toContain("Outro...");
    }
  });

  it("(c) superfície usuário sem jargão interno (Grill-Me / MSO / Bloco / skills)", () => {
    const scan = silentScan(tmp);
    for (const intent of [VAGUE_INTENT, "Adicionar healthcheck HTTP", DETAILED_INTENT]) {
      const qs = buildGrillMeQuestions(intent, scan);
      const answers = resolveAnswers(
        qs,
        qs.map(() => "ok"),
      );
      const grill = buildGrillMeResultFromAnswers(intent, scan, qs, answers);
      const card = renderGoalContractCard({
        objective: grill.objective ?? intent,
        scope: grill.accepted_scope,
        criteria: grill.acceptance_criteria[0]?.description ?? "",
        risks: grill.rejected_scope.join("; "),
      });
      for (const surface of collectUserFacingSurfaces(intent, qs, card)) {
        // Intent text may mention Evidence Validator as out-of-scope example —
        // only assert on generated UX (prompts/defaults/card/labels), not raw intent.
        if (surface === intent) continue;
        expect(containsLeakedInternalJargon(surface)).toBe(false);
        expect(scrubInternalJargon(surface)).not.toMatch(/Grill[- ]?Me/i);
        expect(surface).not.toMatch(/\bMSO\b/);
        expect(surface).not.toMatch(/Bloco\s*[0-9]+/i);
      }
    }
  });
});
