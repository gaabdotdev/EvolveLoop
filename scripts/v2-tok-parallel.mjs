#!/usr/bin/env node
/**
 * V2 TOK under parallelism — reuse V1 token-economy APIs + comparator math.
 * Spawns N concurrent workers; each must meet ≥75% estimated reduction vs its
 * uncompressed baseline (same honesty model as V1-GATE-TOK).
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const TARGET_MIN_PCT = 75;
const PARALLEL = Number(process.env.V2_TOK_PARALLEL || 4);

const distTok = join(REPO, "orchestrator/dist/v3/token-economy/index.js");
if (!existsSync(distTok)) {
  console.error("MISSING_BUILD: orchestrator/dist — run: cd orchestrator && npm run build");
  console.error("TOK_PAR_STATUS=UNAVAILABLE");
  process.exit(2);
}

const tok = await import(pathToFileURL(distTok).href);

function compareTokenTotals(baselineTotal, phaseTotal, opts = {}) {
  const target_min_pct = opts.target_min_pct ?? TARGET_MIN_PCT;
  const honesty = opts.honesty ?? "estimated";
  if (baselineTotal <= 0) {
    return {
      baseline_total: baselineTotal,
      phase_total: phaseTotal,
      reduction_pct: 0,
      meets_target: false,
      target_min_pct,
      honesty,
      notes: ["baseline_total_non_positive", ...(opts.notes ?? [])],
    };
  }
  const reduction_pct = ((baselineTotal - phaseTotal) / baselineTotal) * 100;
  return {
    baseline_total: baselineTotal,
    phase_total: phaseTotal,
    reduction_pct,
    meets_target: reduction_pct >= target_min_pct,
    target_min_pct,
    honesty,
    notes: opts.notes,
  };
}

function estTokens(text) {
  return Math.ceil(Buffer.byteLength(String(text), "utf-8") / 4);
}

function sha256(text) {
  return createHash("sha256").update(String(text), "utf-8").digest("hex");
}

function verboseSkillBlob() {
  const para =
    "Please note that it is really very important to basically actually simply just carefully consider " +
    "the repository structure in order to perhaps maybe implement the requested marker correctly. ";
  return Array.from({ length: 40 }, (_, i) => `${para}Section ${i + 1}.`).join("\n");
}

function noisyStdout() {
  return [
    "\u001b[32m✓ unit/a.test.ts (12ms)\u001b[0m",
    ...Array.from({ length: 80 }, (_, i) => `log line ${i} detail blah`),
    "Error: boom",
    "    at foo (x.js:1:1)",
    "FAIL something important",
  ].join("\n");
}

async function measureWorker(workerId) {
  const intent = `Criar marcador V2-TOK-PAR worker-${workerId} sob carga paralela`;
  const baselinePrompt = [
    "You are a careful, thorough, professional software engineering agent.",
    "Please kindly explore the repository as needed and really make sure everything is correct.",
    `Task identifier: tok-par-${workerId}`,
    `Intent (please fulfill carefully): ${intent}`,
    "=== BEGIN RUNTIME SKILL (uncompressed) ===",
    verboseSkillBlob(),
    "=== END RUNTIME SKILL ===",
    "Please write the marker file and then perhaps run some tests just to be sure.",
  ].join("\n");
  const baselineStdout = noisyStdout();
  const largeFile = Array.from(
    { length: 400 },
    (_, i) => `// filler line ${i} with verbose commentary that is really very unnecessary`,
  ).join("\n");
  const ragDump = Array.from({ length: 30 }, (_, i) => `Noise sentence number ${i}`).join(" ");

  const baselineTotal =
    estTokens(baselinePrompt) +
    estTokens(baselineStdout) +
    estTokens(largeFile) +
    estTokens(ragDump);

  const pinnedInput = {
    systemRules: "No unrestricted read_file.\nTelegraphic EN only.\nStdout filter on.",
    goalContract: "GOAL: V2-TOK-PAR\nACCEPT: reduction>=75 under parallel",
    repoSymbolMap: "src/math.js|10|12|function|clamp",
  };
  const skill = tok.compressRuntimeSkill(verboseSkillBlob());
  const body = tok.compressNaturalLanguage(
    tok.compressTelegraphicProse(
      `CRITICAL: create marker tok-par-${workerId}. Do not explore. Do not modify package.json. ${intent}`,
    ),
    0.45,
  );
  const telegraphic = tok.toTelegraphicEn({
    role: "circuit_worker",
    turn: workerId,
    task_id: `tok-par-${workerId}`,
  });
  const built = tok.buildPromptWithPinnedPrefix(
    pinnedInput,
    [telegraphic, body.text, skill.text ?? skill.compressed ?? ""].join("\n"),
  );
  const filtered = tok.filterProcessOutput(baselineStdout);

  const dir = mkdtempSync(join(tmpdir(), `v2-tok-par-${workerId}-`));
  let sliceTokens = 0;
  try {
    const filePath = join(dir, "big.ts");
    writeFileSync(filePath, largeFile);
    const outline = tok.outlineFile(dir, "big.ts");
    const sliced = tok.readLines(dir, "big.ts", 1, 5);
    sliceTokens = estTokens(JSON.stringify(outline.entries)) + estTokens(sliced.lines.join("\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  let prunedText = ragDump.slice(0, 80);
  if (typeof tok.pruneRetrievedSnippetsDetailed === "function") {
    const pruned = tok.pruneRetrievedSnippetsDetailed(
      [{ id: "s1", text: ragDump }],
      ["clamp", "marker"],
      40,
    );
    prunedText = pruned.text ?? prunedText;
  } else if (typeof tok.pruneRetrievedSnippets === "function") {
    prunedText = tok.pruneRetrievedSnippets(
      [{ id: "s1", text: ragDump }],
      ["clamp", "marker"],
      40,
    );
  }

  // Crystallizer 0-token contribution for this worker (local registry).
  const reg = new tok.CrystallizerRegistry({ tokensPerLiveRun: 100 });
  const pid = `tok-par-pattern-${workerId}`;
  for (let i = 0; i < 3; i++) {
    await reg.run({
      pattern_id: pid,
      success: true,
      script: "#!/usr/bin/env node\nconsole.log('tok-par')",
      validate: (s) => s.includes("tok-par"),
    });
  }
  const fourth = await reg.run({ pattern_id: pid, success: true });
  const crystTokens = fourth.tokens_used ?? 0;

  const phaseTotal =
    estTokens(built.prompt) +
    estTokens(filtered.text) +
    sliceTokens +
    estTokens(prunedText) +
    crystTokens;

  const slice = compareTokenTotals(baselineTotal, phaseTotal, {
    honesty: "estimated",
    notes: [
      `worker=${workerId}`,
      "parallel_load",
      "V1_APIs: compressRuntimeSkill+nl+telegraphic+pin+stdout+slice+prune+crystallizer",
      `prefix_hash=${sha256(built.prefix).slice(0, 12)}`,
      `crystallizer_status=${fourth.status}`,
    ],
  });

  return {
    worker_id: workerId,
    crystallizer_zero_token: fourth.status === "zero_token_script" && crystTokens === 0,
    ...slice,
  };
}

async function main() {
  const outDir = process.env.V2_TOK_OUT || join(REPO, ".tmp", "v2-tok-parallel");
  mkdirSync(outDir, { recursive: true });

  const required = [
    "compressRuntimeSkill",
    "compressNaturalLanguage",
    "compressTelegraphicProse",
    "toTelegraphicEn",
    "buildPromptWithPinnedPrefix",
    "filterProcessOutput",
    "outlineFile",
    "readLines",
    "CrystallizerRegistry",
  ];
  const missingApis = required.filter((k) => typeof tok[k] !== "function");
  if (missingApis.length) {
    console.error("TOK_PAR_STATUS=UNAVAILABLE missing_apis=" + missingApis.join(","));
    writeFileSync(
      join(outDir, "tok-parallel.json"),
      JSON.stringify({ kind: "V2TokParallelReport", status: "UNAVAILABLE", missingApis }, null, 2),
    );
    process.exit(3);
  }

  console.log(`TOK_PAR: launching ${PARALLEL} concurrent workers`);
  const started = Date.now();
  const results = await Promise.all(
    Array.from({ length: PARALLEL }, (_, i) => measureWorker(i + 1)),
  );
  const elapsed_ms = Date.now() - started;

  const allMeet = results.every((r) => r.meets_target);
  const minPct = Math.min(...results.map((r) => r.reduction_pct));
  const maxPct = Math.max(...results.map((r) => r.reduction_pct));

  let v1Ref = null;
  const v1Latest = join(REPO, "docs/v1/evidence/latest/metrics.json");
  if (existsSync(v1Latest)) {
    try {
      v1Ref = JSON.parse(readFileSync(v1Latest, "utf-8"));
    } catch {
      v1Ref = null;
    }
  }

  const report = {
    kind: "V2TokParallelReport",
    status: allMeet ? "PASS" : "FAIL",
    parallel_workers: PARALLEL,
    elapsed_ms,
    target_min_pct: TARGET_MIN_PCT,
    all_meet_target: allMeet,
    min_reduction_pct: minPct,
    max_reduction_pct: maxPct,
    workers: results,
    v1_latest_metrics_path: existsSync(v1Latest) ? v1Latest : null,
    v1_label: v1Ref?.verdict?.label ?? null,
    honesty: "estimated",
    pass: allMeet,
  };

  writeFileSync(join(outDir, "tok-parallel.json"), JSON.stringify(report, null, 2));
  console.log("TOK_PAR_JSON=" + JSON.stringify(report));
  console.log(
    allMeet
      ? `TOK_PAR_STATUS=PASS min_reduction=${minPct.toFixed(2)}% >= ${TARGET_MIN_PCT}% parallel=${PARALLEL}`
      : `TOK_PAR_STATUS=FAIL min_reduction=${minPct.toFixed(2)}% < ${TARGET_MIN_PCT}%`,
  );
  process.exit(allMeet ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  console.error("TOK_PAR_STATUS=UNAVAILABLE");
  process.exit(2);
});
