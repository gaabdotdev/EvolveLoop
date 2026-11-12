import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { MeasurementEventStore } from "../event-store.js";
import { resolveMeasurementPaths } from "../paths.js";
import { buildRunMetricsReport } from "../metrics/engine.js";
import { getMetricsCatalog } from "../metrics/catalog.js";
import { reconstructExecution } from "../trace/builder.js";
import {
  compareStrategies,
  createExperiment,
  doctor,
  loadCase,
  loadExperiment,
  loadSuite,
  runBenchmarkCase,
  runExperiment,
  saveExperiment,
} from "../benchmark/runner.js";
import { STRATEGY_CATALOG } from "../benchmark/strategies.js";
import type { BenchmarkCaseManifest, StrategyId } from "../types.js";
import { evaluateRun } from "../evaluation/engine.js";
import { applyRetention } from "../retention.js";
import { migrateStoreToCurrent, readStoreMeta, repairRunJsonl } from "../migrations.js";
import { measureInstrumentationOverhead, writeOverheadReport } from "../overhead.js";
import { computeDelegationRoiMatrix } from "../metrics/delegation-roi.js";

export function handleTelemetryCommand(
  command: string,
  args: Record<string, string>,
): { code: number; payload: unknown } {
  if (!args["data-dir"]) return { code: 2, payload: { error: "Required: --data-dir <path>" } };
  const paths = resolveMeasurementPaths(args["data-dir"]);
  const store = new MeasurementEventStore(paths);

  if (command === "status") {
    return {
      code: 0,
      payload: {
        kind: "TelemetryStatus",
        ...doctor(paths),
        catalog: getMetricsCatalog().version,
        strategies: STRATEGY_CATALOG.map((s) => s.id),
      },
    };
  }

  if (command === "inspect" || command === "events" || command === "trace" || command === "agents" || command === "usage" || command === "export" || command === "metrics") {
    if (!args.run) return { code: 2, payload: { error: "Required: --run <run_id>" } };
    const events = store.load(args.run);
    if (!events.length) return { code: 1, payload: { error: "run_not_found", run_id: args.run } };
    const metrics = buildRunMetricsReport(events);
    const recon = reconstructExecution(events);

    if (command === "events") return { code: 0, payload: { run_id: args.run, events } };
    if (command === "trace") return { code: 0, payload: { run_id: args.run, ...recon } };
    if (command === "agents") return { code: 0, payload: { run_id: args.run, agent_tree: recon.agent_tree, hierarchy: metrics.hierarchy } };
    if (command === "usage") return { code: 0, payload: { run_id: args.run, usage: metrics.usage } };
    if (command === "metrics") return { code: 0, payload: { run_id: args.run, metrics } };
    if (command === "export") {
      const format = args.format ?? "jsonl";
      if (format !== "jsonl") return { code: 2, payload: { error: "Only --format jsonl supported" } };
      const out = args.out ? resolve(args.out) : join(paths.reportsDir, `${args.run}.export.jsonl`);
      writeFileSync(out, store.exportJsonl(args.run));
      return { code: 0, payload: { exported: out, events: events.length } };
    }
    return {
      code: 0,
      payload: {
        run_id: args.run,
        event_count: events.length,
        metrics,
        gaps: recon.gaps,
        first_events: events.slice(0, 5).map((e) => e.event_name),
      },
    };
  }

  return { code: 2, payload: { error: `Unknown telemetry command: ${command}` } };
}

export function handleBenchmarkCommand(
  command: string,
  args: Record<string, string>,
  repoRoot: string,
): { code: number; payload: unknown } {
  if (command === "doctor") {
    if (!args["data-dir"]) return { code: 2, payload: { error: "Required: --data-dir <path>" } };
    const paths = resolveMeasurementPaths(args["data-dir"]);
    return {
      code: 0,
      payload: {
        ...doctor(paths),
        store_meta: readStoreMeta(paths),
        tui_dashboard: "NOT_IMPLEMENTED",
      },
    };
  }

  if (command === "retain") {
    if (!args["data-dir"]) return { code: 2, payload: { error: "Required: --data-dir" } };
    const days = args.days ? parseInt(args.days, 10) : 30;
    if (!Number.isFinite(days) || days < 0) return { code: 2, payload: { error: "Invalid --days" } };
    const paths = resolveMeasurementPaths(args["data-dir"]);
    const result = applyRetention(paths, {
      retention_days: days,
      dry_run: args["dry-run"] === "true",
      prune_workspaces: args["prune-workspaces"] !== "false",
    });
    return { code: 0, payload: result };
  }

  if (command === "migrate") {
    if (!args["data-dir"]) return { code: 2, payload: { error: "Required: --data-dir" } };
    const paths = resolveMeasurementPaths(args["data-dir"]);
    return { code: 0, payload: migrateStoreToCurrent(paths) };
  }

  if (command === "repair") {
    if (!args["data-dir"] || !args.run) return { code: 2, payload: { error: "Required: --data-dir --run" } };
    const paths = resolveMeasurementPaths(args["data-dir"]);
    return { code: 0, payload: repairRunJsonl(paths, args.run, { write: args["dry-run"] !== "true" }) };
  }

  if (command === "overhead") {
    const iterations = args.iterations ? parseInt(args.iterations, 10) : 5;
    if (args.out) {
      const out = resolve(args.out);
      return { code: 0, payload: writeOverheadReport(out, iterations) };
    }
    return { code: 0, payload: measureInstrumentationOverhead(iterations) };
  }

  if (command === "roi") {
    if (!args["data-dir"] || !args.experiment) {
      return { code: 2, payload: { error: "Required: --data-dir --experiment <id>" } };
    }
    const paths = resolveMeasurementPaths(args["data-dir"]);
    const reportPath = join(paths.reportsDir, `${args.experiment}.compare.json`);
    if (!existsSync(reportPath)) return { code: 1, payload: { error: "report_not_found" } };
    const report = JSON.parse(readFileSync(reportPath, "utf-8")) as {
      results: Parameters<typeof computeDelegationRoiMatrix>[0];
      comparison?: { delegation_roi?: unknown };
    };
    const roi = report.comparison?.delegation_roi ?? computeDelegationRoiMatrix(report.results);
    return { code: 0, payload: roi };
  }

  if (command === "suite") {
    const sub = args._sub ?? args.subcommand ?? "list";
    const suitesRoot = resolve(repoRoot, "benchmarks/bench-obs/suites");
    if (sub === "list") {
      const files = existsSync(suitesRoot) ? readdirSync(suitesRoot).filter((f) => f.endsWith(".json")) : [];
      return {
        code: 0,
        payload: {
          suites: files.map((f) => {
            const s = loadSuite(join(suitesRoot, f));
            return { suite_id: s.suite_id, name: s.name, version: s.version, cases: s.cases.length };
          }),
        },
      };
    }
    if (sub === "inspect") {
      const id = args.id ?? args._;
      if (!id) return { code: 2, payload: { error: "Required suite id" } };
      const path = join(suitesRoot, `${id}.json`);
      if (!existsSync(path)) return { code: 1, payload: { error: "suite_not_found", id } };
      return { code: 0, payload: loadSuite(path) };
    }
  }

  if (command === "case") {
    const sub = args._sub ?? args.subcommand ?? "list";
    const casesRoot = resolve(repoRoot, "benchmarks/bench-obs/cases");
    if (sub === "list") {
      const files = existsSync(casesRoot) ? readdirSync(casesRoot).filter((f) => f.endsWith(".json")) : [];
      let cases = files.map((f) => loadCase(join(casesRoot, f)));
      if (args.suite) {
        const suite = loadSuite(resolve(repoRoot, `benchmarks/bench-obs/suites/${args.suite}.json`));
        cases = cases.filter((c) => suite.cases.includes(c.case_id));
      }
      return {
        code: 0,
        payload: {
          cases: cases.map((c) => ({
            case_id: c.case_id,
            name: c.name,
            class: c.class,
            split: c.split,
            strategies: c.strategies,
          })),
        },
      };
    }
    if (sub === "inspect") {
      const id = args.id ?? args._;
      if (!id) return { code: 2, payload: { error: "Required case id" } };
      const path = join(casesRoot, `${id}.json`);
      if (!existsSync(path)) return { code: 1, payload: { error: "case_not_found", id } };
      return { code: 0, payload: loadCase(path) };
    }
  }

  if (!args["data-dir"] && ["experiment", "run", "status", "cancel", "report", "compare", "metrics", "regressions", "export", "validate-suite", "validate-evidence"].includes(command)) {
    // status/cancel need data-dir; suite/case already handled
  }

  if (command === "experiment" && (args._sub === "create" || args.subcommand === "create" || args.manifest)) {
    if (!args["data-dir"]) return { code: 2, payload: { error: "Required: --data-dir" } };
    const manifestPath = args.manifest ?? args.id ?? (args._sub === "create" ? undefined : args._);
    if (!manifestPath) return { code: 2, payload: { error: "Required manifest path" } };
    const raw = JSON.parse(readFileSync(resolve(manifestPath), "utf-8"));
    const paths = resolveMeasurementPaths(args["data-dir"]);
    const exp = createExperiment(paths, raw);
    return { code: 0, payload: exp };
  }

  if (command === "run") {
    if (!args["data-dir"]) return { code: 2, payload: { error: "Required: --data-dir" } };
    const paths = resolveMeasurementPaths(args["data-dir"]);
    const suitesRoot = resolve(repoRoot, "benchmarks/bench-obs/suites");
    const casesRoot = resolve(repoRoot, "benchmarks/bench-obs/cases");

    if (args.experiment) {
      const exp = loadExperiment(paths, args.experiment);
      if (!exp) return { code: 1, payload: { error: "experiment_not_found" } };
      const suite = loadSuite(join(suitesRoot, `${exp.suite_id}.json`));
      const cases = suite.cases.map((id) => loadCase(join(casesRoot, `${id}.json`)));
      const out = runExperiment(exp, suite, cases, {
        paths,
        repoRoot,
        priceTablePath: resolve(repoRoot, "benchmarks/bench-obs/pricing/prices.v1.json"),
        evolveloopCommit: exp.evolveloop_commit,
      });
      return { code: 0, payload: out };
    }

    if (!args.suite || !args.strategy) {
      return { code: 2, payload: { error: "Required: --experiment <id> OR --suite <id> --strategy <id>" } };
    }
    const suite = loadSuite(join(suitesRoot, `${args.suite}.json`));
    const strategy = args.strategy as StrategyId;
    const cases = suite.cases.map((id) => loadCase(join(casesRoot, `${id}.json`)));
    const results = cases
      .filter((c) => c.strategies.includes(strategy))
      .map((c) =>
        runBenchmarkCase(c, strategy, {
          paths,
          repoRoot,
          suite_id: suite.suite_id,
          priceTablePath: resolve(repoRoot, "benchmarks/bench-obs/pricing/prices.v1.json"),
        }),
      );
    return {
      code: 0,
      payload: {
        suite_id: suite.suite_id,
        strategy,
        results,
        comparison: compareStrategies(results, null),
      },
    };
  }

  if (command === "status" || command === "cancel") {
    if (!args["data-dir"] || !args._ && !args.id && !args.experiment) {
      return { code: 2, payload: { error: "Required: --data-dir and experiment id" } };
    }
    const paths = resolveMeasurementPaths(args["data-dir"]);
    const id = args.id ?? args.experiment ?? args._;
    const exp = loadExperiment(paths, id);
    if (!exp) return { code: 1, payload: { error: "experiment_not_found" } };
    if (command === "cancel") {
      exp.status = "cancelled";
      saveExperiment(paths, exp);
    }
    return { code: 0, payload: exp };
  }

  if (command === "report" || command === "export") {
    if (!args["data-dir"]) return { code: 2, payload: { error: "Required: --data-dir" } };
    const paths = resolveMeasurementPaths(args["data-dir"]);
    const id = args.id ?? args.experiment ?? args._;
    if (!id) return { code: 2, payload: { error: "Required experiment id" } };
    const reportPath = join(paths.reportsDir, `${id}.compare.json`);
    if (!existsSync(reportPath)) return { code: 1, payload: { error: "report_not_found", id } };
    return { code: 0, payload: JSON.parse(readFileSync(reportPath, "utf-8")) };
  }

  if (command === "compare") {
    if (!args["data-dir"] || !args.a || !args.b) {
      return { code: 2, payload: { error: "Required: --data-dir --a <exp> --b <exp>" } };
    }
    const paths = resolveMeasurementPaths(args["data-dir"]);
    const ra = join(paths.reportsDir, `${args.a}.compare.json`);
    const rb = join(paths.reportsDir, `${args.b}.compare.json`);
    if (!existsSync(ra) || !existsSync(rb)) return { code: 1, payload: { error: "report_not_found" } };
    return {
      code: 0,
      payload: {
        a: JSON.parse(readFileSync(ra, "utf-8")),
        b: JSON.parse(readFileSync(rb, "utf-8")),
      },
    };
  }

  if (command === "validate-suite") {
    const id = args.id ?? args._;
    if (!id) return { code: 2, payload: { error: "Required suite id" } };
    const suite = loadSuite(resolve(repoRoot, `benchmarks/bench-obs/suites/${id}.json`));
    const casesRoot = resolve(repoRoot, "benchmarks/bench-obs/cases");
    const missing = suite.cases.filter((c) => !existsSync(join(casesRoot, `${c}.json`)));
    return {
      code: missing.length ? 1 : 0,
      payload: { suite_id: suite.suite_id, ok: missing.length === 0, missing_cases: missing },
    };
  }

  if (command === "validate-evidence") {
    if (!args["data-dir"] || !args.run) return { code: 2, payload: { error: "Required: --data-dir --run" } };
    const paths = resolveMeasurementPaths(args["data-dir"]);
    const events = new MeasurementEventStore(paths).load(args.run);
    const granted = events.some((e) => e.event_name === "true_full_pass.granted");
    const rejected = events.filter((e) => e.event_name === "true_full_pass.rejected");
    return {
      code: 0,
      payload: {
        run_id: args.run,
        true_full_pass_granted: granted,
        rejections: rejected.map((e) => e.attributes),
        criterion_events: events.filter((e) => e.event_name.startsWith("criterion.")).length,
      },
    };
  }

  if (command === "regressions") {
    return {
      code: 0,
      payload: {
        note: "Provide --base and --candidate experiment report ids under --data-dir",
        base: args.base ?? null,
        candidate: args.candidate ?? null,
      },
    };
  }

  if (command === "metrics") {
    return handleTelemetryCommand("metrics", args);
  }

  return { code: 2, payload: { error: `Unknown benchmark command: ${command}` } };
}

export function listBundledCases(repoRoot: string): BenchmarkCaseManifest[] {
  const casesRoot = resolve(repoRoot, "benchmarks/bench-obs/cases");
  if (!existsSync(casesRoot)) return [];
  return readdirSync(casesRoot)
    .filter((f) => f.endsWith(".json"))
    .map((f) => loadCase(join(casesRoot, f)));
}

// silence unused import in some builds
void evaluateRun;
