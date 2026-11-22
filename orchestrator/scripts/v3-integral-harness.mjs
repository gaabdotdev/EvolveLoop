#!/usr/bin/env node
/**
 * V3 §22.23 — Integral harness (sequential, exit codes preserved).
 *
 * Steps:
 *   a) build (tsc)
 *   b) unit packs v0+v1+v2+v3 (relevant globs, expanded before vitest)
 *   c) one integration test
 *   d) security adversarial pack
 *   e) recovery/chaos (SIGKILL reconciler)
 *   f) v3 regression
 *
 * usage:
 *   node scripts/v3-integral-harness.mjs <evidence_dir>
 *
 * Writes:
 *   <evidence_dir>/integral-harness.log
 *   <evidence_dir>/integral-SUMMARY.md
 *   <evidence_dir>/integral-harness.exit  (overall)
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, globSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const orchRoot = resolve(__dirname, "..");
const evidenceArg = process.argv[2];
if (!evidenceArg) {
  console.error("usage: node scripts/v3-integral-harness.mjs <evidence_dir>");
  process.exit(2);
}

const evidenceDir = resolve(evidenceArg);
mkdirSync(evidenceDir, { recursive: true });
const logPath = join(evidenceDir, "integral-harness.log");
const summaryPath = join(evidenceDir, "integral-SUMMARY.md");
const exitPath = join(evidenceDir, "integral-harness.exit");

writeFileSync(
  logPath,
  `# V3 integral harness log\nts=${new Date().toISOString()}\norch=${orchRoot}\nevidence=${evidenceDir}\n\n`,
  "utf-8",
);

/** @type {{ id: string; label: string; cmd: string; args: string[]; exit: number; duration_ms: number }[]} */
const steps = [];

/**
 * Expand globs relative to orchRoot so vitest receives concrete file paths.
 * @param {string[]} patterns
 */
function expandTestGlobs(patterns) {
  /** @type {string[]} */
  const files = [];
  for (const pattern of patterns) {
    const hits = globSync(pattern, { cwd: orchRoot });
    files.push(...hits.sort());
  }
  return [...new Set(files)];
}

/**
 * @param {string} id
 * @param {string} label
 * @param {string} cmd
 * @param {string[]} args
 */
function runStep(id, label, cmd, args) {
  const header = `\n===== STEP ${id}: ${label} =====\n$ ${cmd} ${args.join(" ")}\n`;
  appendFileSync(logPath, header, "utf-8");
  console.log(`\n[integral] ${id} — ${label}`);
  const t0 = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: orchRoot,
    encoding: "utf-8",
    env: { ...process.env, FORCE_COLOR: "0" },
    maxBuffer: 32 * 1024 * 1024,
  });
  const duration_ms = Date.now() - t0;
  const exit = r.status ?? (r.signal ? 128 : 1);
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  appendFileSync(logPath, out + `\n--- exit=${exit} duration_ms=${duration_ms} ---\n`, "utf-8");
  steps.push({ id, label, cmd, args, exit, duration_ms });
  console.log(`[integral] ${id} exit=${exit} (${duration_ms}ms)`);
  return exit;
}

// a) build
runStep("a", "build (tsc)", "npm", ["run", "build"]);

// b) unit packs v0+v1+v2+v3 relevantes
const unitFiles = expandTestGlobs([
  "tests/unit/v0-*.test.ts",
  "tests/unit/v1-*.test.ts",
  "tests/unit/v2-*.test.ts",
  "tests/unit/v3-*.test.ts",
]);
appendFileSync(logPath, `unit_files_expanded=${unitFiles.length}\n`, "utf-8");
if (unitFiles.length === 0) {
  appendFileSync(logPath, "ERROR: no unit files matched globs\n", "utf-8");
  steps.push({
    id: "b",
    label: "unit v0+v1+v2+v3 packs",
    cmd: "npx",
    args: ["vitest", "run", "(no files)"],
    exit: 1,
    duration_ms: 0,
  });
} else {
  runStep("b", `unit v0+v1+v2+v3 packs (${unitFiles.length} files)`, "npx", [
    "vitest",
    "run",
    ...unitFiles,
  ]);
}

// c) integration (one deterministic, no live consent)
runStep("c", "integration (v0-intent-flow)", "npx", [
  "vitest",
  "run",
  "tests/integration/v0-intent-flow.integration.test.ts",
]);

// d) security adversarial
runStep("d", "security adversarial pack", "npx", [
  "vitest",
  "run",
  "tests/unit/security/audit-adversarial.test.ts",
  "tests/unit/verified-pass-adversarial.test.ts",
]);

// e) recovery / chaos
runStep("e", "recovery/chaos (SIGKILL reconciler)", "npx", [
  "vitest",
  "run",
  "tests/unit/v0-chaos-reconciler.test.ts",
]);

// f) v3 regression
const v3Files = expandTestGlobs(["tests/unit/v3-*.test.ts"]);
appendFileSync(logPath, `v3_files_expanded=${v3Files.length}\n`, "utf-8");
if (v3Files.length === 0) {
  steps.push({
    id: "f",
    label: "v3 regression",
    cmd: "npx",
    args: ["vitest", "run", "(no files)"],
    exit: 1,
    duration_ms: 0,
  });
} else {
  runStep("f", `v3 regression (${v3Files.length} files)`, "npx", ["vitest", "run", ...v3Files]);
}

const allOk = steps.every((s) => s.exit === 0);
const overall = allOk ? 0 : 1;

const summaryLines = [
  `# V3 Integral Harness SUMMARY — §22.23`,
  ``,
  `- **ts:** ${new Date().toISOString()}`,
  `- **evidence_dir:** \`${evidenceDir}\``,
  `- **orchestrator:** \`${orchRoot}\``,
  `- **overall_exit:** **${overall}**`,
  `- **log:** \`integral-harness.log\``,
  ``,
  `| Step | Label | Exit | Duration ms | Command |`,
  `|------|-------|------|-------------|---------|`,
];
for (const s of steps) {
  const cmdShort =
    s.args.length > 6
      ? `${s.cmd} ${s.args.slice(0, 3).join(" ")} … (${s.args.length - 3} more)`
      : `${s.cmd} ${s.args.join(" ")}`;
  summaryLines.push(
    `| ${s.id} | ${s.label} | **${s.exit}** | ${s.duration_ms} | \`${cmdShort}\` |`,
  );
}
summaryLines.push(``);
summaryLines.push(
  allOk
    ? `**STATUS:** all steps exit 0 — conjunto integrado revalidado nesta sessão.`
    : `**STATUS:** FAIL — one or more steps non-zero; see log.`,
);
summaryLines.push(``);

writeFileSync(summaryPath, summaryLines.join("\n"), "utf-8");
writeFileSync(exitPath, String(overall) + "\n", "utf-8");

console.log(`\n[integral] SUMMARY → ${summaryPath}`);
console.log(`[integral] overall_exit=${overall}`);
process.exit(overall);
