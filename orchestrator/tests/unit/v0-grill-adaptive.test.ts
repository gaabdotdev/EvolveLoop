/**
 * Fase 3 — Grill-Me adaptativo: prompt detalhado → review card; zero "Bloco 3".
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assessIntentDetail,
  isDetailedIntent,
  scrubInternalJargon,
  buildGrillMeQuestions,
  resolveAnswers,
  buildGrillMeResultFromAnswers,
} from "../../src/v3/grill-me/index.js";
import { silentScan } from "../../src/v3/workspace-scan/index.js";
import { renderGoalContractCard } from "../../src/v3/evolve-shell/grill-ux.js";

describe("Grill-Me adaptativo", () => {
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

  it("intenção vaga → vague_questions (2–3)", () => {
    const a = assessIntentDetail("melhorar o CLI");
    expect(a.mode).toBe("vague_questions");
    expect(a.max_questions).toBeLessThanOrEqual(3);
    expect(isDetailedIntent("melhorar o CLI")).toBe(false);
  });

  it("intenção detalhada com escopo + critérios → detailed_review (salta Qs sequenciais)", () => {
    const intent = [
      "Refatorar a camada de CLI interativa para Ink.",
      "Escopo: TUI com banner, footer IDLE e input multilinha.",
      "Critério de aceite: npm test verde e evolve --help fora do repo.",
      "Fora de escopo: alterar Evidence Validator ou Token Ledger.",
      "- Suportar bracketed paste",
      "- Auto-cura de stale lock",
    ].join("\n");
    const a = assessIntentDetail(intent);
    expect(a.mode).toBe("detailed_review");
    expect(isDetailedIntent(intent)).toBe(true);
    expect(a.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("defaults e card nunca mencionam Bloco 3 / adapters E2E", () => {
    const scan = silentScan(tmp);
    const qs = buildGrillMeQuestions("Adicionar healthcheck HTTP", scan);
    for (const q of qs) {
      expect(q.default_answer).not.toMatch(/Bloco\s*3/i);
      expect(q.default_answer).not.toMatch(/adapters?\s+E2E/i);
      expect(scrubInternalJargon(q.default_answer)).not.toMatch(/Bloco\s*3/i);
    }
    const answers = resolveAnswers(qs, qs.map(() => "ok"));
    const grill = buildGrillMeResultFromAnswers("Adicionar healthcheck HTTP", scan, qs, answers);
    const card = renderGoalContractCard({
      objective: grill.objective ?? "Adicionar healthcheck HTTP",
      scope: grill.accepted_scope.join("; "),
      criteria: grill.acceptance_criteria[0]?.description ?? "",
      risks: grill.rejected_scope.join("; "),
    });
    expect(card).not.toMatch(/Bloco\s*3/i);
    expect(card).not.toMatch(/adapters?\s+E2E/i);
  });
});
