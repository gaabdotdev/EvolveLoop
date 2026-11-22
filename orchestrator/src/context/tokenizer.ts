import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type TokenizerLabel = "tiktoken:cl100k_base" | "PROXY:whitespace_split";

let cachedCounter: ((text: string) => number) | null = null;
let cachedLabel: TokenizerLabel | null = null;
let cachedPython: string | null = null;

function whitespaceProxy(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Repo root: orchestrator/src/context → ../../.. */
function repoRootFromThisModule(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

/**
 * Python that can `import tiktoken` (cl100k_base).
 * Preferência: env override → docs/v22/baseline/.venv (contrato CI local) → python3 no PATH.
 */
export function resolveTiktokenPython(): string {
  if (cachedPython) return cachedPython;

  const envOverride =
    process.env.EVOLVELOOP_BASELINE_PYTHON?.trim() ||
    process.env.EVOLVELOOP_TIKTOKEN_PYTHON?.trim();
  const candidates: string[] = [];
  if (envOverride) candidates.push(envOverride);

  const baselineVenv = join(repoRootFromThisModule(), "docs/v22/baseline/.venv/bin/python");
  candidates.push(baselineVenv, "python3");

  const probe = `
import json, sys
try:
    import tiktoken
    enc = tiktoken.get_encoding("cl100k_base")
    _ = len(enc.encode("probe"))
    print(json.dumps({"ok": True}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
    sys.exit(2)
`;

  for (const bin of candidates) {
    if (bin !== "python3" && !existsSync(bin)) continue;
    const run = spawnSync(bin, ["-c", probe], {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
    });
    if (run.status !== 0 || !run.stdout) continue;
    try {
      const parsed = JSON.parse(run.stdout.trim()) as { ok?: boolean };
      if (parsed.ok) {
        cachedPython = bin;
        return bin;
      }
    } catch {
      continue;
    }
  }

  cachedPython = "python3";
  return cachedPython;
}

function loadTiktokenViaPython(): ((text: string) => number) | null {
  const python = resolveTiktokenPython();
  const script = `
import sys, json
try:
    import tiktoken
    enc = tiktoken.get_encoding("cl100k_base")
    data = sys.stdin.read()
    print(json.dumps({"tokens": len(enc.encode(data))}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;
  const probe = spawnSync(python, ["-c", script], {
    input: "probe",
    encoding: "utf-8",
    maxBuffer: 1024 * 1024,
  });
  if (probe.status !== 0 || !probe.stdout) return null;
  try {
    const parsed = JSON.parse(probe.stdout.trim()) as { tokens?: number; error?: string };
    if (parsed.error || parsed.tokens === undefined) return null;
  } catch {
    return null;
  }

  return (text: string) => {
    const run = spawnSync(python, ["-c", script], {
      input: text,
      encoding: "utf-8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (run.status !== 0 || !run.stdout) return whitespaceProxy(text);
    try {
      const out = JSON.parse(run.stdout.trim()) as { tokens?: number };
      return out.tokens ?? whitespaceProxy(text);
    } catch {
      return whitespaceProxy(text);
    }
  };
}

/** Aligns with V22-BENCH harness tokenizer selection. */
export function resolveTokenizer(): { label: TokenizerLabel; count: (text: string) => number } {
  if (cachedCounter && cachedLabel) {
    return { label: cachedLabel, count: cachedCounter };
  }
  const tik = loadTiktokenViaPython();
  if (tik) {
    cachedCounter = tik;
    cachedLabel = "tiktoken:cl100k_base";
    return { label: cachedLabel, count: tik };
  }
  cachedCounter = whitespaceProxy;
  cachedLabel = "PROXY:whitespace_split";
  return { label: cachedLabel, count: whitespaceProxy };
}

export function countTokens(text: string): { tokens: number; tokenizer: TokenizerLabel } {
  const { label, count } = resolveTokenizer();
  return { tokens: count(text), tokenizer: label };
}

/** Test hook — reset module cache */
export function resetTokenizerCache(): void {
  cachedCounter = null;
  cachedLabel = null;
  cachedPython = null;
}

/**
 * Measurement counter. Throws if tiktoken is not importable.
 * Never falls back to the whitespace proxy.
 */
export function requireTiktokenCounts(texts: string[]): number[] {
  const python = resolveTiktokenPython();
  const script = `
import json, sys
try:
    import tiktoken
except Exception as e:
    print(json.dumps({"error": "tiktoken_import:" + str(e)}))
    sys.exit(2)
enc = tiktoken.get_encoding("cl100k_base")
data = json.load(sys.stdin)
if not isinstance(data, list):
    print(json.dumps({"error": "expected_list"}))
    sys.exit(2)
print(json.dumps({"tokens": [len(enc.encode(t)) for t in data], "tokenizer": "tiktoken:cl100k_base"}))
`;
  const run = spawnSync(python, ["-c", script], {
    input: JSON.stringify(texts),
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let parsed: { tokens?: number[]; tokenizer?: string; error?: string } = {};
  try {
    parsed = JSON.parse((run.stdout ?? "").trim() || "{}") as typeof parsed;
  } catch {
    throw new Error(
      `tiktoken measurement failed: ${run.stderr?.trim() || "unparseable tokenizer output"}`,
    );
  }
  if (run.status !== 0 || parsed.error || !parsed.tokens || parsed.tokenizer !== "tiktoken:cl100k_base") {
    throw new Error(
      `tiktoken measurement refused proxy fallback: ${parsed.error || run.stderr?.trim() || "missing tiktoken:cl100k_base"}`,
    );
  }
  if (parsed.tokens.length !== texts.length) {
    throw new Error("tiktoken measurement returned a different count than the input batch");
  }
  return parsed.tokens;
}
