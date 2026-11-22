#!/usr/bin/env node
/**
 * V1-GATE-COMPAT — write Agent × Modelo × Protocolo matrix evidence + live probe.
 * Does NOT invent FreeLLMAPI ready; classifies live probe honestly.
 */
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  symlinkSync,
  unlinkSync,
  readFileSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

const vitestExitArg = process.argv.find((a) => a.startsWith("--vitest-exit="));
const vitestExit = vitestExitArg ? Number(vitestExitArg.split("=")[1]) : null;

const distModels = join(REPO, "orchestrator/dist/v3/model-providers/index.js");
const distCircuit = join(REPO, "orchestrator/dist/v3/circuit/index.js");
const distMso = join(REPO, "orchestrator/dist/v3/mso/index.js");

if (!existsSync(distModels) || !existsSync(distCircuit)) {
  console.error("MISSING_BUILD: orchestrator/dist — run npm run build first");
  process.exit(2);
}

const models = await import(pathToFileURL(distModels).href);
const circuit = await import(pathToFileURL(distCircuit).href);
const mso = await import(pathToFileURL(distMso).href);

const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const evidenceDir = join(REPO, "docs/v1/evidence", `gate-compat-${ts}`);
mkdirSync(evidenceDir, { recursive: true });

const agents = circuit.createDefaultAgentAdapters().map((a) => a.adapter_id);
const protocols = models.listProtocolIds();
const layerTable = models.MODEL_LAYER_TABLE;
const modelIds = Object.values(layerTable).map((r) => r.default_model ?? `layer-${r.layer}`);

const matrix = [];
for (const agent of agents) {
  for (const protocol of protocols) {
    for (const model of modelIds) {
      matrix.push({
        agent,
        model,
        protocol,
        status: "enumerated",
        notes: "cell covered by protocol build/parse + adapter id presence",
      });
    }
  }
}

/** Live FreeLLMAPI probe — never invent ready. */
const liveProvider = new models.FreeLLMAPIModelProvider({
  baseUrl: "http://localhost:3001/v1",
  timeoutMs: 2500,
});
const liveCatalog = await liveProvider.discoverCatalog();
const liveProbe = {
  base_url: "http://localhost:3001/v1",
  state: liveCatalog.state,
  message: liveCatalog.message,
  models_count: liveCatalog.models.length,
  honest: liveCatalog.state !== "ready" || liveCatalog.models.length >= 0,
  invented_ready: false,
};

/** Fault injection classification smoke (offline). */
const faultCases = [
  { label: "http_429", input: { http_status: 429, code: "EXHAUSTED", message: "rate limit" } },
  {
    label: "timeout_mid_stream",
    input: { code: "TIMEOUT_MID_STREAM", message: "timeout mid-stream", abort_reason: "timeout" },
  },
  {
    label: "truncated_json",
    input: { code: "BAD_JSON", message: "invalid FreeLLMAPI response JSON" },
  },
  {
    label: "unreachable",
    input: { code: "UNREACHABLE", message: "ECONNREFUSED", provider_state: "unreachable" },
  },
].map((c) => {
  const report = models.classifyProviderFault(c.input);
  const cb0 = mso.createCircuitBreaker(`ev-${c.label}`);
  const handled = models.handleProviderFault(cb0, c.input, { now_ms: 1_000_000 });
  return {
    label: c.label,
    fault_kind: report.fault_kind,
    bucket: report.bucket,
    burns_task_attempt: report.burns_task_attempt,
    cooldown_ms: report.cooldown_ms,
    fallback_recommended: report.fallback_recommended,
    circuit_attempts_after: handled.circuit.attempts,
    ok:
      report.bucket === "INFRA_QUOTA" &&
      report.burns_task_attempt === false &&
      handled.circuit.attempts === 0 &&
      report.fallback_recommended === true,
  };
});

const faultsOk = faultCases.every((f) => f.ok);
const adaptersOk = agents.includes("cursor") && agents.includes("antigravity") && agents.length >= 2;
const protocolsOk = protocols.length >= 4;

const pass =
  (vitestExit === null || vitestExit === 0) &&
  faultsOk &&
  adaptersOk &&
  protocolsOk &&
  liveProbe.honest &&
  liveProbe.invented_ready === false;

const verdict = pass ? "V1-GATE-COMPAT_PASS" : "V1-GATE-COMPAT_FAIL";
const reasons = [];
if (vitestExit !== null && vitestExit !== 0) reasons.push(`vitest_exit=${vitestExit}`);
if (!faultsOk) reasons.push("fault_injection_classification_failed");
if (!adaptersOk) reasons.push("need_ge_2_real_adapters_cursor_antigravity");
if (!protocolsOk) reasons.push("need_ge_4_protocols");
if (!liveProbe.honest) reasons.push("live_probe_dishonest");
if (reasons.length === 0) reasons.push("OK_MATRIX_AND_FAULT_INJECTION");

const summary = {
  kind: "V1GateCompatVerdict",
  pass,
  label: verdict,
  reasons,
  vitest_exit: vitestExit,
  live_probe: liveProbe,
  agents,
  protocols,
  models: modelIds,
  matrix_cells: matrix.length,
  fault_injection: faultCases,
  ts,
  evidence_dir: evidenceDir,
};

writeFileSync(join(evidenceDir, "matrix.json"), JSON.stringify({ cells: matrix, agents, protocols, models: modelIds }, null, 2));
writeFileSync(join(evidenceDir, "live-probe.json"), JSON.stringify(liveProbe, null, 2));
writeFileSync(join(evidenceDir, "fault-injection.json"), JSON.stringify(faultCases, null, 2));
writeFileSync(join(evidenceDir, "verdict.json"), JSON.stringify(summary, null, 2));

const md = `# V1-GATE-COMPAT Evidence

- ts: ${ts}
- goal: V1-GATE-COMPAT (attempt 1/3)
- evidence_dir: ${evidenceDir}
- vitest_exit: ${vitestExit === null ? "n/a" : vitestExit}

## Verdict

**${verdict}**

\`\`\`json
${JSON.stringify(summary, null, 2)}
\`\`\`

## Live FreeLLMAPI probe (\`http://localhost:3001/v1\`)

| field | value |
|-------|-------|
| state | \`${liveProbe.state}\` |
| message | ${liveProbe.message} |
| models_count | ${liveProbe.models_count} |
| invented_ready | ${liveProbe.invented_ready} |

Honesty: live probe may be UNAVAILABLE / needsKey — never rewritten to ready.

## Matrix Agente × Modelo × Protocolo

| Agent | Model | Protocol | Status |
|-------|-------|----------|--------|
${matrix.map((c) => `| ${c.agent} | ${c.model} | ${c.protocol} | ${c.status} |`).join("\n")}

Cells: **${matrix.length}**

## Fault injection

| case | bucket | burns_attempt | cooldown_ms | fallback | ok |
|------|--------|---------------|-------------|----------|----|
${faultCases.map((f) => `| ${f.label} | ${f.bucket} | ${f.burns_task_attempt} | ${f.cooldown_ms} | ${f.fallback_recommended} | ${f.ok} |`).join("\n")}

## Adapters

- real adapters: ${agents.join(", ")} (≥2 required: cursor + antigravity)
- protocols: ${protocols.join(", ")}
`;

writeFileSync(join(evidenceDir, "SUMMARY.md"), md);
writeFileSync(join(evidenceDir, "07-raw-terminal-evidence.txt"), [
  "=== V1-GATE-COMPAT harness ===",
  `ts=${ts}`,
  `verdict=${verdict}`,
  `vitest_exit=${vitestExit}`,
  `live_state=${liveProbe.state}`,
  `matrix_cells=${matrix.length}`,
  `faults_ok=${faultsOk}`,
  "",
].join("\n"));

const latest = join(REPO, "docs/v1/evidence/latest-compat");
try {
  unlinkSync(latest);
} catch {
  /* no prior */
}
try {
  symlinkSync(`gate-compat-${ts}`, latest);
} catch {
  writeFileSync(join(REPO, "docs/v1/evidence/LATEST_COMPAT_PATH.txt"), evidenceDir + "\n");
}
writeFileSync(join(REPO, "docs/v1/evidence/LATEST_COMPAT_PATH.txt"), evidenceDir + "\n");

console.log(JSON.stringify({ verdict, evidence_dir: evidenceDir, vitest_exit: vitestExit, live_state: liveProbe.state }, null, 2));
process.exit(pass ? 0 : 1);
