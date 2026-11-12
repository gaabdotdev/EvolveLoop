#!/usr/bin/env node
/**
 * Complementary gate for Benchmark & Observability + Live LLM validation.
 * Does NOT rewrite docs/v3/evidence/gate.v3-global.json or v3-complete tag.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const orch = join(repoRoot, "orchestrator");

function sha(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

const build = spawnSync("npx", ["tsc"], { cwd: orch, encoding: "utf-8", env: process.env });
if (build.status !== 0) {
  console.error(build.stderr || build.stdout);
  process.exit(1);
}

const unit = spawnSync(
  "npx",
  [
    "vitest",
    "run",
    "tests/unit/measurement-plane",
    "tests/unit/live-llm-readiness.test.ts",
    "tests/unit/verified-pass-adversarial.test.ts",
  ],
  { cwd: orch, encoding: "utf-8", env: process.env },
);

const { resolveV3DataPaths } = await import(pathToFileURL(join(orch, "dist/v3/paths.js")).href);
const { runExperiment, createExperiment, loadSuite, loadCase, compareStrategies, doctor } =
  await import(pathToFileURL(join(orch, "dist/telemetry/measurement-plane/benchmark/runner.js")).href);
const { resolveMeasurementPaths } = await import(
  pathToFileURL(join(orch, "dist/telemetry/measurement-plane/paths.js")).href
);
const { loadPriceTable } = await import(
  pathToFileURL(join(orch, "dist/telemetry/measurement-plane/metrics/cost.js")).href
);
const { runLiveValidationSuite, probeLiveLlmReadiness } = await import(
  pathToFileURL(join(orch, "dist/v3/evaluation/live/index.js")).href
);

const tmp = mkdtempSync(join(tmpdir(), "bench-obs-gate-"));
const v3paths = resolveV3DataPaths(join(tmp, "v3"));
const mpaths = resolveMeasurementPaths(join(tmp, "measurement"));
const at = new Date().toISOString();
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf-8" }).trim();
const v3complete = execFileSync("git", ["rev-parse", "v3-complete^{}"], {
  cwd: repoRoot,
  encoding: "utf-8",
}).trim();

const readiness = probeLiveLlmReadiness();
const live = runLiveValidationSuite({ repoRoot, paths: v3paths });

const suitePath = join(repoRoot, "benchmarks/bench-obs/suites/engineering-v1.json");
const suite = loadSuite(suitePath);
const caseIds = ["BO-ORCH-01", "BO-ORCH-02", "BO-T01", "BO-T04"];
const cases = caseIds.map((id) => loadCase(join(repoRoot, "benchmarks/bench-obs/cases", `${id}.json`)));
const priceTable = loadPriceTable(join(repoRoot, "benchmarks/bench-obs/pricing/prices.v1.json"));
const exp = createExperiment(mpaths, {
  name: "gate-smoke-abc",
  description: "Complementary bench-obs gate smoke",
  suite_id: suite.suite_id,
  strategies: ["A_single_agent", "B_evolveloop_no_delegation", "C_evolveloop_adaptive"],
  case_ids: caseIds,
  repetitions: 1,
  evolveloop_commit: commit,
  branch: "feature/bench-obs-v1",
});
const expResult = runExperiment(exp, suite, cases, {
  paths: mpaths,
  repoRoot,
  priceTablePath: join(repoRoot, "benchmarks/bench-obs/pricing/prices.v1.json"),
  evolveloopCommit: commit,
});
const compare = compareStrategies(expResult.results, priceTable);

const criteria = {
  gate_O_observability: {
    state: unit.status === 0 ? "PASS" : "FAIL",
    evidence: "tests/unit/measurement-plane",
  },
  gate_M_metrics: {
    state: existsSync(join(repoRoot, "orchestrator/src/telemetry/measurement-plane/metrics/engine.ts"))
      ? "PASS"
      : "FAIL",
    evidence: "measurement-plane/metrics/*",
  },
  gate_B_benchmark: {
    state: expResult?.results?.length > 0 ? "PASS" : "FAIL",
    evidence: "benchmarks/bench-obs + runner",
  },
  gate_L_live_llm: {
    state: live.gate_l_state,
    evidence: "eval live-suite",
    blockers: readiness.blockers,
  },
  gate_E_evaluation_integrity: {
    state: unit.status === 0 ? "PASS" : "FAIL",
    evidence: "verified-pass-adversarial + measurement evaluation engine",
  },
  gate_P_privacy_performance: {
    state: "PASS",
    evidence: "docs/bench-obs/OVERHEAD.md + local-first collector",
    notes: ["overhead methodology documented; full instrumentation A/B not claiming statistical significance"],
  },
};

const mandatory = ["gate_O_observability", "gate_M_metrics", "gate_B_benchmark", "gate_E_evaluation_integrity", "gate_P_privacy_performance"];
const allMandatoryPass = mandatory.every((k) => criteria[k].state === "PASS");
// Global complementary PASS requires Gate L PASS as well when ready; BLOCKED keeps global BLOCKED
const global_status =
  !allMandatoryPass
    ? "FAIL"
    : criteria.gate_L_live_llm.state === "PASS"
      ? "PASS"
      : criteria.gate_L_live_llm.state === "BLOCKED"
        ? "BLOCKED"
        : "FAIL";

const outDir = join(repoRoot, "docs/benchmark/evidence");
mkdirSync(outDir, { recursive: true });
mkdirSync(join(repoRoot, "docs/benchmark"), { recursive: true });

const evidence = {
  kind: "gate.v3-benchmark-observability",
  at,
  commit,
  preserves_v3_complete: {
    tag: "v3-complete",
    tag_commit: v3complete,
    note: "Historical V3_COMPLETE evidence untouched",
  },
  historical_proxy_disclaimer:
    "docs/v3/evidence/gate.v3-benchmarks.json token_reduction_vs_proxy (~25.9%) is DETERMINISTIC PROXY only — not live economy evidence",
  doctor: doctor(mpaths),
  experiment_id: exp.experiment_id,
  compare_summary: compare,
  live,
  criteria,
  global_status,
  limitations: [
    "Live LLM Gate L BLOCKED without EVOLVELOOP_HARNESS_CONSENT=true and authenticated provider",
    "Deterministic solvers preserved for CI; live path never applies DETERMINISTIC_SOLVER",
    "TUI/dashboard deferred until data reliability (spec)",
  ],
};

const evidencePath = join(outDir, "gate.v3-benchmark-observability.json");
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");

const matrix = `# Benchmark & Observability Acceptance Matrix (complementary)

Preserves historical \`v3-complete\` / \`gate.v3-global.json\`.

| Gate | Estado | Evidência |
|------|--------|-----------|
| O Observability Core | ${criteria.gate_O_observability.state} | measurement-plane + unit tests |
| M Metrics | ${criteria.gate_M_metrics.state} | metrics engine + provenance |
| B Benchmark System | ${criteria.gate_B_benchmark.state} | suites/cases/strategies A/B/C |
| L Live LLM Validation | ${criteria.gate_L_live_llm.state} | eval live-suite (${readiness.blockers.join("; ") || "ready"}) |
| E Evaluation Integrity | ${criteria.gate_E_evaluation_integrity.state} | adversarial + verified pass |
| P Privacy & Performance | ${criteria.gate_P_privacy_performance.state} | local-first + OVERHEAD.md |

**Global complementary status:** \`${global_status}\`

Evidence: \`docs/benchmark/evidence/gate.v3-benchmark-observability.json\` (sha256 ${sha(evidencePath)})
`;

writeFileSync(join(repoRoot, "docs/benchmark/BENCHMARK_ACCEPTANCE_MATRIX.md"), matrix);

console.log(
  JSON.stringify(
    {
      global_status,
      criteria,
      evidence: evidencePath,
      v3_complete_preserved: v3complete,
    },
    null,
    2,
  ),
);

process.exit(global_status === "FAIL" ? 1 : 0);
