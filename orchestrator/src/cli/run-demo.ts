#!/usr/bin/env node
/**
 * Meta0 Public Proof CLI — list / stub-run official demos.
 *
 * Usage:
 *   npm run run-demo -- --list
 *   npm run run-demo -- DEMO-003
 *   node dist/cli/run-demo.js DEMO-001
 *
 * Stub never reports PASS. Missing sandbox/capabilities → NOT_MEASURED / BLOCKED.
 */
import { listDemos, runDemoStub, defaultDemosDir } from "../v3/meta0/index.js";

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const positional: string[] = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--list" || a === "-l") flags.add("list");
    else if (a === "--help" || a === "-h") flags.add("help");
    else if (a === "--demos-dir") {
      const val = argv[++i];
      if (val) flags.add(`demos-dir=${val}`);
    } else if (!a.startsWith("-")) {
      positional.push(a);
    }
  }
  return { flags, positional };
}

function demosDirFromFlags(flags: Set<string>): string | undefined {
  for (const f of flags) {
    if (f.startsWith("demos-dir=")) return f.slice("demos-dir=".length);
  }
  return undefined;
}

function printHelp(): void {
  console.log(`Meta0 demo stub — EvolveLoop V3 Public Proof

Usage:
  run-demo --list
  run-demo <DEMO-ID>
  run-demo --demos-dir <path> <DEMO-ID>

Notes:
  - Catalog: ${defaultDemosDir()}
  - Stub reports NOT_MEASURED / BLOCKED honestly; never fakes PASS.
`);
}

function main(): void {
  const { flags, positional } = parseArgs(process.argv);
  if (flags.has("help")) {
    printHelp();
    process.exit(0);
  }

  const demosDir = demosDirFromFlags(flags);
  const options = demosDir ? { demosDir } : undefined;

  if (flags.has("list")) {
    const entries = listDemos(options);
    if (entries.length === 0) {
      console.log(JSON.stringify({ demos: [], demos_dir: demosDir ?? defaultDemosDir() }, null, 2));
      process.exit(0);
    }
    const demos = entries.map((e) => ({
      demo_id: e.demo_id,
      title: e.manifest.spec.title,
      result: e.manifest.spec.result ?? "NOT_MEASURED",
      path: e.path,
    }));
    console.log(JSON.stringify({ demos_dir: demosDir ?? defaultDemosDir(), demos }, null, 2));
    process.exit(0);
  }

  const demoId = positional[0];
  if (!demoId) {
    printHelp();
    process.exit(2);
  }

  const result = runDemoStub(demoId, {}, options);
  console.log(JSON.stringify(result, null, 2));
  // Non-zero when blocked/unloadable; NOT_MEASURED exits 0 (honest gap, not crash).
  if (result.status === "BLOCKED") process.exit(1);
  process.exit(0);
}

main();
