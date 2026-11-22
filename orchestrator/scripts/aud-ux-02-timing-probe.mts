/**
 * AUD-UX-02 timing probe — silent scan + Grill-Me answers → Goal Contract lines.
 * Synthetic workspace only; not live interactive evolve wall-clock.
 */
import { performance } from "node:perf_hooks";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { silentScan } from "../src/v3/workspace-scan/silent-scan.js";
import {
  buildGrillMeQuestions,
  resolveAnswers,
  buildGrillMeResultFromAnswers,
  summarizeContractLines,
} from "../src/v3/grill-me/session.js";

const root = mkdtempSync(join(tmpdir(), "aud-ux-02-"));
mkdirSync(join(root, "src"), { recursive: true });
writeFileSync(join(root, "README.md"), "# Demo\n");
writeFileSync(join(root, "package.json"), JSON.stringify({ name: "demo", version: "0.0.1" }));
writeFileSync(join(root, "src", "index.ts"), "console.log(1);\n");

const intent = "Add a healthcheck endpoint with tests";
const t0 = performance.now();
const scan = silentScan(root);
const t1 = performance.now();
const questions = buildGrillMeQuestions(intent, scan);
const answers = resolveAnswers(
  questions,
  Object.fromEntries(questions.map((q) => [q.id, q.default_answer ?? "ok"])),
);
const result = buildGrillMeResultFromAnswers(intent, scan, questions, answers);
const lines = summarizeContractLines({
  goal_contract_id: "gc-aud-ux-02",
  objective: result.objective,
  scope: result.accepted_scope,
  out_of_scope: result.rejected_scope,
  acceptance: result.acceptance_criteria[0]?.description ?? "—",
  db_path: join(root, ".evolveloop", "state.db"),
});
const t2 = performance.now();

const out = {
  gate: "AUD-UX-02-timing-probe",
  scan_ms: Number((t1 - t0).toFixed(3)),
  grill_contract_ms: Number((t2 - t1).toFixed(3)),
  total_ms: Number((t2 - t0).toFixed(3)),
  under_2min: t2 - t0 < 120_000,
  question_count: questions.length,
  question_count_in_3_to_5: questions.length >= 3 && questions.length <= 5,
  contract_summary_lines: lines.length,
  readiness_for_planning: result.readiness_for_planning,
  honesty:
    "synthetic workspace + default answers; not live interactive evolve wall-clock with human",
};

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
rmSync(root, { recursive: true, force: true });
