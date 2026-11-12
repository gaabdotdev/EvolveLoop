#!/usr/bin/env node
/**
 * Sequential live suite with per-case checkpoints (survives SIGTERM better than one giant JSON print).
 * Usage: EVOLVELOOP_HARNESS_CONSENT=true node scripts/v3/run-live-suite-sequential.mjs [--data-dir PATH]
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const orch = join(repoRoot, "orchestrator");

const args = process.argv.slice(2);
let dataDir = "/tmp/el-live-seq";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--data-dir" && args[i + 1]) dataDir = resolve(args[++i]);
}

if (process.env.EVOLVELOOP_HARNESS_CONSENT !== "true") {
  console.error("Refusing: set EVOLVELOOP_HARNESS_CONSENT=true for this process");
  process.exit(2);
}

const { resolveV3DataPaths } = await import(pathToFileURL(join(orch, "dist/v3/paths.js")).href);
const { probeLiveLlmReadiness, runLiveEngineeringCase } = await import(
  pathToFileURL(join(orch, "dist/v3/evaluation/live/index.js")).href
);

mkdirSync(dataDir, { recursive: true });
const paths = resolveV3DataPaths(dataDir);
const reportPath = join(dataDir, "live-suite-report.json");

console.error("[live-seq] probing readiness…");
const readiness = probeLiveLlmReadiness({ verifyCanStart: true });
writeFileSync(join(dataDir, "live-readiness.json"), JSON.stringify(readiness, null, 2));
console.error("[live-seq] readiness=", readiness.state, "harness=", readiness.selected_harness);

const cases = [
  {
    fixtureRel: "orchestrator/tests/fixtures/v3-eval/alpha-lib",
    taskId: "T01",
    strategy: "A_single_agent",
  },
  {
    fixtureRel: "orchestrator/tests/fixtures/v3-eval/beta-app",
    taskId: "T04",
    strategy: "B_evolveloop_no_delegation",
    injectRecovery: true,
  },
  {
    fixtureRel: "orchestrator/tests/fixtures/v3-eval/gamma-service",
    taskId: "T07",
    strategy: "C_evolveloop_adaptive",
  },
];

const results = [];
if (existsSync(reportPath)) {
  try {
    const prev = JSON.parse(readFileSync(reportPath, "utf-8"));
    if (Array.isArray(prev.results)) {
      // resume: keep completed task_ids
      for (const r of prev.results) {
        if (r?.task_id && r?.mode === "LIVE") results.push(r);
      }
      console.error(
        "[live-seq] resume with",
        results.map((r) => r.task_id).join(","),
      );
    }
  } catch {
    /* ignore */
  }
}

for (const c of cases) {
  if (results.some((r) => r.task_id === c.taskId && r.mode === "LIVE")) {
    console.error("[live-seq] skip completed", c.taskId);
    continue;
  }
  console.error("[live-seq] starting", c.taskId, c.strategy, "recovery=", !!c.injectRecovery);
  const t0 = Date.now();
  const result = runLiveEngineeringCase({
    ...c,
    repoRoot,
    paths,
    readiness,
  });
  console.error(
    "[live-seq] finished",
    c.taskId,
    "pass=",
    result.true_full_pass,
    "files=",
    result.files_changed.length,
    "review=",
    result.review.verdict,
    "ms=",
    Date.now() - t0,
  );
  results.push(result);
  const gate =
    readiness.state !== "READY"
      ? "BLOCKED"
      : results.every((r) => r.true_full_pass)
        ? "PASS"
        : "FAIL";
  const report = {
    kind: "LiveValidationSuiteReport",
    readiness,
    results,
    gate_l_state: gate,
    at: new Date().toISOString(),
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

const gate =
  readiness.state !== "READY"
    ? "BLOCKED"
    : results.length === cases.length && results.every((r) => r.true_full_pass)
      ? "PASS"
      : "FAIL";
const finalReport = {
  kind: "LiveValidationSuiteReport",
  readiness,
  results,
  gate_l_state: gate,
  at: new Date().toISOString(),
};
writeFileSync(reportPath, JSON.stringify(finalReport, null, 2));
console.log(JSON.stringify({ gate_l_state: gate, report: reportPath, n: results.length }, null, 2));
process.exit(gate === "FAIL" ? 1 : 0);
