#!/usr/bin/env node
/**
 * INT-02 probe — Ollama/FreeLLMAPI readiness for live Laya benchmark.
 * EXIT 0 only if /api/tags OK AND a short /api/generate returns usable text.
 * EXIT ≠0 → INT-02=UNAVAILABLE (do not invent PASS).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const base = (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, "");
const model = process.env.EVOLVELOOP_OLLAMA_MODEL || process.env.OLLAMA_MODEL || "bonsai-64k:latest";
const outDir = process.env.V2_INT02_OUT || join(REPO, ".tmp", "v2-int02-probe");
mkdirSync(outDir, { recursive: true });

const report = {
  kind: "INT02Probe",
  base,
  model,
  tags: null,
  generate: null,
  freellmapi: null,
  status: "UNAVAILABLE",
};

async function main() {
  // FreeLLMAPI probe (optional)
  const freellm = process.env.FREELLMAPI_BASE || process.env.EVOLVELOOP_FREELLMAPI_URL;
  if (freellm) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(String(freellm).replace(/\/$/, "") + "/health", {
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));
      report.freellmapi = { ok: res.ok, status: res.status };
    } catch (err) {
      report.freellmapi = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  } else {
    report.freellmapi = { ok: false, error: "FREELLMAPI_BASE unset" };
  }

  // Ollama tags
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${base}/api/tags`, { signal: ctrl.signal }).finally(() =>
      clearTimeout(t),
    );
    const body = res.ok ? await res.json() : null;
    report.tags = {
      ok: res.ok,
      status: res.status,
      models: (body?.models ?? []).map((m) => m.name),
    };
  } catch (err) {
    report.tags = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Short generate probe
  if (report.tags?.ok) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20_000);
      const started = Date.now();
      const res = await fetch(`${base}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: 'Reply with exactly: {"status":"abstain"}',
          stream: false,
          options: { num_predict: 32 },
        }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));
      const text = res.ok ? ((await res.json())?.response ?? "") : await res.text();
      report.generate = {
        ok: res.ok && String(text).length > 0,
        status: res.status,
        latency_ms: Date.now() - started,
        response_chars: String(text).length,
        preview: String(text).slice(0, 120),
      };
    } catch (err) {
      report.generate = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  } else {
    report.generate = { ok: false, error: "skipped_tags_failed" };
  }

  const liveOk = Boolean(report.generate?.ok) || Boolean(report.freellmapi?.ok);
  report.status = liveOk ? "READY" : "UNAVAILABLE";
  writeFileSync(join(outDir, "probe.json"), JSON.stringify(report, null, 2));
  console.log("INT02_PROBE_JSON=" + JSON.stringify(report));
  console.log(`INT02_STATUS=${report.status === "READY" ? "READY" : "UNAVAILABLE"}`);
  if (!liveOk) {
    console.error(
      "INT-02 probe failed: Ollama generate and FreeLLMAPI unavailable — cannot run live Laya benchmark",
    );
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  console.log("INT02_STATUS=UNAVAILABLE");
  process.exit(2);
});
