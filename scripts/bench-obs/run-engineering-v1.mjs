#!/usr/bin/env node
/**
 * Full engineering-v1 suite runner (conclusive battery, not smoke).
 * Usage:
 *   node scripts/bench-obs/run-engineering-v1.mjs [--repetitions 3] [--data-dir PATH] [--out PATH]
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
const repoRoot = resolve(import.meta.dirname, "../..");
const orchRoot = join(repoRoot, "orchestrator");

function parseArgs(argv) {
  const out = { repetitions: 3, dataDir: join(repoRoot, "docs/bench-obs/evidence/full-run-data"), out: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--repetitions") out.repetitions = parseInt(argv[++i], 10);
    else if (argv[i] === "--data-dir") out.dataDir = resolve(argv[++i]);
    else if (argv[i] === "--out") out.out = resolve(argv[++i]);
  }
  if (!out.out) out.out = join(repoRoot, "docs/bench-obs/evidence/engineering-v1-full-compare.json");
  return out;
}

function ensureBuilt() {
  execSync("npm run build", { cwd: orchRoot, stdio: "inherit" });
}

async function main() {
  const args = parseArgs(process.argv);
  ensureBuilt();
  const mp = await import(join(orchRoot, "dist/telemetry/measurement-plane/index.js"));

  mkdirSync(args.dataDir, { recursive: true });
  const paths = mp.resolveMeasurementPaths(args.dataDir);
  mp.migrateStoreToCurrent(paths);

  const suite = mp.loadSuite(join(repoRoot, "benchmarks/bench-obs/suites/engineering-v1.json"));
  const cases = suite.cases.map((id) => mp.loadCase(join(repoRoot, `benchmarks/bench-obs/cases/${id}.json`)));

  let commit = "unknown";
  try {
    commit = execSync("git rev-parse --short HEAD", { cwd: repoRoot }).toString().trim();
  } catch {
    /* ignore */
  }

  const experiment = mp.createExperiment(paths, {
    name: "engineering-v1-full-abc",
    description: "Full suite A/B/C with controlled repetitions (conclusive battery)",
    suite_id: suite.suite_id,
    strategies: ["A_single_agent", "B_evolveloop_no_delegation", "C_evolveloop_adaptive"],
    case_ids: suite.cases,
    repetitions: args.repetitions,
    evolveloop_commit: commit,
    branch: "feature/bench-obs-v1",
    provider_id: "mock",
    model_id: "mock-model",
  });

  const started = Date.now();
  const result = mp.runExperiment(experiment, suite, cases, {
    paths,
    repoRoot,
    priceTablePath: join(repoRoot, "benchmarks/bench-obs/pricing/prices.v1.json"),
    evolveloopCommit: commit,
  });
  const elapsed_ms = Date.now() - started;

  const overhead = mp.measureInstrumentationOverhead(5);
  const overheadPath = join(repoRoot, "docs/bench-obs/evidence/overhead-report.json");
  writeFileSync(overheadPath, JSON.stringify(overhead, null, 2));

  const summary = {
    kind: "EngineeringV1FullBattery",
    conclusive: true,
    smoke: false,
    experiment_id: result.experiment_id,
    evolveloop_commit: commit,
    repetitions: args.repetitions,
    case_count: suite.cases.length,
    result_count: result.results.length,
    elapsed_ms,
    comparison: result.comparison,
    validity_counts: countBy(result.results, (r) => r.validity),
    verified_by_strategy: Object.fromEntries(
      ["A_single_agent", "B_evolveloop_no_delegation", "C_evolveloop_adaptive"].map((s) => {
        const rows = result.results.filter((r) => r.strategy === s && r.validity === "valid");
        const verified = rows.filter((r) => r.true_full_pass).length;
        return [
          s,
          {
            valid: rows.length,
            verified,
            verified_completion_rate: rows.length ? verified / rows.length : null,
          },
        ];
      }),
    ),
    tokens_note: "No live provider usage in this battery — token/cost fields remain UNAVAILABLE unless PROVIDER_REPORTED.",
    overhead_report: overheadPath,
    tui_dashboard: "NOT_IMPLEMENTED",
  };

  writeFileSync(args.out, JSON.stringify({ summary, ...result }, null, 2));
  writeFileSync(
    join(repoRoot, "docs/bench-obs/evidence/engineering-v1-full-summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
}

function countBy(arr, fn) {
  const out = {};
  for (const x of arr) {
    const k = fn(x);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
