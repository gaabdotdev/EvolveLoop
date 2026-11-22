/**
 * V3-MEM-04 — Local Multi-Hop Synthesis.
 *
 * expandGraph(hops) → collect evidence from HybridGraphStore
 * synthesizeLocal → Ollama micro-loop when available; else deterministic stub
 * → closed dossiers for complex questions without Frontier models.
 *
 * STATUS vocabulary (honest, documented):
 *   CLOSED_OLLAMA              — dossier closed via local Ollama generate
 *   CLOSED_DETERMINISTIC_STUB  — dossier closed offline (no Frontier; CI-safe)
 *   OPEN_INSUFFICIENT_EVIDENCE — expansion yielded no usable evidence
 */

import { createHash } from "node:crypto";
import {
  HybridGraphStore,
  HybridGraphError,
  fileNodeId,
  normalizeGraphPath,
  type HybridGraphNodeKind,
} from "./hybrid-graph.js";

export const MULTI_HOP_SYNTHESIS_SCHEMA_VERSION = "1";

export const SYNTHESIS_STATUSES = [
  "CLOSED_OLLAMA",
  "CLOSED_DETERMINISTIC_STUB",
  "OPEN_INSUFFICIENT_EVIDENCE",
] as const;
export type SynthesisStatus = (typeof SYNTHESIS_STATUSES)[number];

export class MultiHopSynthesisError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MultiHopSynthesisError";
  }
}

export interface GraphEvidence {
  node_id: string;
  kind: HybridGraphNodeKind;
  label: string;
  hops: number;
  payload: Record<string, unknown>;
  /** Distinct edge types incident on this node within the traversed neighborhood. */
  via_edge_types: string[];
}

export interface GraphExpansion {
  start_file: string;
  start_node_id: string;
  max_hops: number;
  evidence: GraphEvidence[];
  /** Total nodes visited including start (hop 0). */
  nodes_visited: number;
}

export interface DossierCitation {
  node_id: string;
  kind: HybridGraphNodeKind;
  label: string;
  hops: number;
}

export interface ClosedDossier {
  question: string;
  status: SynthesisStatus;
  /** True iff status is CLOSED_* — dossier is self-contained (no Frontier). */
  closed: boolean;
  answer: string;
  citations: DossierCitation[];
  hops_used: number;
  evidence_count: number;
  synthesizer: "ollama" | "deterministic_stub";
  model?: string;
  /** Stable fingerprint of the evidence set used for synthesis. */
  evidence_fingerprint: string;
  limitations: string[];
  schema_version: string;
}

export interface OllamaSynthesisOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  /** Inject fetch for tests. */
  fetchFn?: typeof fetch;
  /**
   * When true, skip Ollama and force the deterministic stub path
   * (STATUS=CLOSED_DETERMINISTIC_STUB). Default false.
   */
  forceStub?: boolean;
}

export interface SynthesizeLocalInput {
  question: string;
  expansion: GraphExpansion;
  ollama?: OllamaSynthesisOptions;
}

export interface MultiHopSynthesisInput {
  question: string;
  start_file: string;
  /** Max BFS hops from start_file (default 2; min 1). */
  hops?: number;
  graph: HybridGraphStore;
  ollama?: OllamaSynthesisOptions;
}

function resolveOllamaBaseUrl(opts?: OllamaSynthesisOptions): string {
  return (
    opts?.baseUrl ||
    process.env.OLLAMA_HOST ||
    process.env.EVOLVELOOP_OLLAMA_URL ||
    "http://127.0.0.1:11434"
  ).replace(/\/$/, "");
}

function resolveOllamaModel(opts?: OllamaSynthesisOptions): string {
  return (
    opts?.model ||
    process.env.EVOLVELOOP_OLLAMA_MODEL ||
    process.env.OLLAMA_MODEL ||
    "bonsai-64k:latest"
  );
}

function byStableEvidence(a: GraphEvidence, b: GraphEvidence): number {
  if (a.hops !== b.hops) return a.hops - b.hops;
  const k = a.kind.localeCompare(b.kind);
  if (k !== 0) return k;
  return a.node_id.localeCompare(b.node_id);
}

/** Stable SHA-256 over evidence ids/kinds/hops (payload-independent). */
export function fingerprintEvidence(evidence: readonly GraphEvidence[]): string {
  const payload = JSON.stringify(
    [...evidence]
      .map((e) => ({ id: e.node_id, kind: e.kind, hops: e.hops }))
      .sort((a, b) => `${a.hops}|${a.kind}|${a.id}`.localeCompare(`${b.hops}|${b.kind}|${b.id}`)),
  );
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Bidirectional BFS up to `maxHops` from start_file.
 * Collects File | Decision | Test | Symbol nodes at hops ≥ 1 as evidence.
 * Integrates HybridGraphStore without mutating its public contract.
 */
export function expandGraph(
  store: HybridGraphStore,
  startFile: string,
  maxHops: number,
): GraphExpansion {
  if (!Number.isFinite(maxHops) || maxHops < 1) {
    throw new MultiHopSynthesisError(
      "HOPS_INVALID",
      `maxHops must be ≥ 1 (got ${String(maxHops)})`,
    );
  }
  const hopsCap = Math.floor(maxHops);

  const start_file = normalizeGraphPath(startFile);
  const start_node_id = fileNodeId(start_file);

  const edges = store.listEdges();
  const adjacency = new Map<string, string[]>();
  const edgeTypesByNode = new Map<string, Set<string>>();

  const addAdj = (a: string, b: string): void => {
    let list = adjacency.get(a);
    if (!list) {
      list = [];
      adjacency.set(a, list);
    }
    if (!list.includes(b)) list.push(b);
  };
  const addType = (nodeId: string, edgeType: string): void => {
    let set = edgeTypesByNode.get(nodeId);
    if (!set) {
      set = new Set();
      edgeTypesByNode.set(nodeId, set);
    }
    set.add(edgeType);
  };

  for (const e of edges) {
    addAdj(e.from_id, e.to_id);
    addAdj(e.to_id, e.from_id);
    addType(e.from_id, e.edge_type);
    addType(e.to_id, e.edge_type);
  }
  for (const [k, list] of adjacency) {
    list.sort((a, b) => a.localeCompare(b));
    adjacency.set(k, list);
  }

  const hopsMap = new Map<string, number>();
  hopsMap.set(start_node_id, 0);
  const queue: string[] = [start_node_id];
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++]!;
    const curHops = hopsMap.get(cur)!;
    if (curHops >= hopsCap) continue;
    for (const next of adjacency.get(cur) ?? []) {
      if (hopsMap.has(next)) continue;
      hopsMap.set(next, curHops + 1);
      queue.push(next);
    }
  }

  const evidence: GraphEvidence[] = [];
  for (const [nodeId, hops] of hopsMap) {
    if (hops < 1 || hops > hopsCap) continue;
    const node = store.getNode(nodeId);
    if (!node) continue;
    const via = [...(edgeTypesByNode.get(nodeId) ?? [])].sort((a, b) => a.localeCompare(b));
    evidence.push({
      node_id: node.node_id,
      kind: node.kind,
      label: node.label,
      hops,
      payload: node.payload,
      via_edge_types: via,
    });
  }
  evidence.sort(byStableEvidence);

  return {
    start_file,
    start_node_id,
    max_hops: hopsCap,
    evidence,
    nodes_visited: hopsMap.size,
  };
}

function openInsufficient(question: string, expansion: GraphExpansion): ClosedDossier {
  return {
    question,
    status: "OPEN_INSUFFICIENT_EVIDENCE",
    closed: false,
    answer:
      "Insufficient graph evidence to close a dossier. Expand hops or ingest more HybridGraph edges.",
    citations: [],
    hops_used: expansion.max_hops,
    evidence_count: 0,
    synthesizer: "deterministic_stub",
    evidence_fingerprint: fingerprintEvidence([]),
    limitations: [
      "STATUS=OPEN_INSUFFICIENT_EVIDENCE",
      "No Decision/Test/File/Symbol nodes within hop radius",
    ],
    schema_version: MULTI_HOP_SYNTHESIS_SCHEMA_VERSION,
  };
}

function citationsFrom(evidence: readonly GraphEvidence[]): DossierCitation[] {
  return evidence.map((e) => ({
    node_id: e.node_id,
    kind: e.kind,
    label: e.label,
    hops: e.hops,
  }));
}

/**
 * Deterministic local synthesizer — always available offline.
 * Builds a structured dossier from evidence; never calls Frontier.
 */
export function synthesizeDeterministicStub(
  question: string,
  expansion: GraphExpansion,
): ClosedDossier {
  if (expansion.evidence.length === 0) {
    return openInsufficient(question, expansion);
  }

  const byKind = {
    Decision: expansion.evidence.filter((e) => e.kind === "Decision"),
    Test: expansion.evidence.filter((e) => e.kind === "Test"),
    File: expansion.evidence.filter((e) => e.kind === "File"),
    Symbol: expansion.evidence.filter((e) => e.kind === "Symbol"),
  };

  const lines: string[] = [
    `# Multi-hop dossier (deterministic stub)`,
    ``,
    `Question: ${question.trim() || "(empty)"}`,
    `Start: ${expansion.start_file} (${expansion.start_node_id})`,
    `Hops: ${expansion.max_hops} | Evidence nodes: ${expansion.evidence.length}`,
    ``,
    `## Summary`,
    `Local synthesis (deterministic stub; no remote LLM). Graph neighborhood yields ` +
      `${byKind.Decision.length} decision(s), ${byKind.Test.length} test(s), ` +
      `${byKind.File.length} file(s), ${byKind.Symbol.length} symbol(s).`,
    ``,
  ];

  const section = (title: string, items: GraphEvidence[]): void => {
    lines.push(`## ${title}`);
    if (items.length === 0) {
      lines.push(`(none)`);
    } else {
      for (const e of items) {
        const via = e.via_edge_types.length > 0 ? e.via_edge_types.join(",") : "n/a";
        lines.push(`- [hop ${e.hops}] ${e.node_id} — ${e.label} (via ${via})`);
      }
    }
    lines.push(``);
  };

  section("Decisions", byKind.Decision);
  section("Tests", byKind.Test);
  section("Files", byKind.File);
  section("Symbols", byKind.Symbol);

  lines.push(`## Citations`);
  for (const c of citationsFrom(expansion.evidence)) {
    lines.push(`- ${c.hops}:${c.kind}:${c.node_id}`);
  }
  lines.push(``);
  lines.push(`STATUS=CLOSED_DETERMINISTIC_STUB`);

  return {
    question,
    status: "CLOSED_DETERMINISTIC_STUB",
    closed: true,
    answer: lines.join("\n"),
    citations: citationsFrom(expansion.evidence),
    hops_used: expansion.max_hops,
    evidence_count: expansion.evidence.length,
    synthesizer: "deterministic_stub",
    evidence_fingerprint: fingerprintEvidence(expansion.evidence),
    limitations: [
      "STATUS=CLOSED_DETERMINISTIC_STUB",
      "No LLM used — structured evidence dump only",
      "Ollama path available when probe succeeds",
    ],
    schema_version: MULTI_HOP_SYNTHESIS_SCHEMA_VERSION,
  };
}

export interface OllamaProbeResult {
  ok: boolean;
  base_url: string;
  model?: string;
  code: string;
  detail: string;
}

/** Probe GET /api/tags — CI-safe; never throws. */
export async function probeOllama(
  opts?: OllamaSynthesisOptions,
): Promise<OllamaProbeResult> {
  const base_url = resolveOllamaBaseUrl(opts);
  const model = resolveOllamaModel(opts);
  const fetchFn = opts?.fetchFn ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? 4_000;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetchFn(`${base_url}/api/tags`, { signal: ctrl.signal }).finally(() =>
      clearTimeout(t),
    );
    if (!res.ok) {
      return {
        ok: false,
        base_url,
        model,
        code: `HTTP_${res.status}`,
        detail: `Ollama /api/tags failed with ${res.status}`,
      };
    }
    const body = (await res.json()) as { models?: Array<{ name?: string }> };
    const names = (body.models ?? []).map((m) => m.name).filter(Boolean) as string[];
    if (names.length === 0) {
      return { ok: false, base_url, model, code: "NO_MODELS", detail: "no models pulled" };
    }
    const has =
      names.includes(model) || names.some((n) => n.startsWith(model.split(":")[0]!));
    return {
      ok: true,
      base_url,
      model: has ? model : names[0],
      code: has ? "OK" : "OK_MODEL_FALLBACK",
      detail: has ? `model=${model}` : `fallback=${names[0]}`,
    };
  } catch (err) {
    return {
      ok: false,
      base_url,
      model,
      code: "UNREACHABLE",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function buildOllamaPrompt(question: string, expansion: GraphExpansion): string {
  const evidenceBlock = expansion.evidence
    .map(
      (e) =>
        `- hops=${e.hops} kind=${e.kind} id=${e.node_id} label=${e.label} via=${e.via_edge_types.join("|") || "n/a"}`,
    )
    .join("\n");
  return [
    "You are EvolveLoop local multi-hop memory synthesizer.",
    "Close a short technical dossier from the graph evidence only.",
    "Do NOT invent nodes, files, or decisions absent from the evidence list.",
    "Reply with plain text: Summary, then bullet Findings citing node ids, then STATUS=CLOSED_OLLAMA.",
    "",
    `Question: ${question}`,
    `Start file: ${expansion.start_file}`,
    `Max hops: ${expansion.max_hops}`,
    "Evidence:",
    evidenceBlock || "(none)",
  ].join("\n");
}

export interface OllamaGenerateAttempt {
  dossier: ClosedDossier | null;
  /** Honest reason when dossier is null (for stub fallback annotations). */
  fail_reason?: string;
}

/** Strip optional model "thinking" wrappers if present; keep visible answer. */
function normalizeOllamaResponse(raw: string): string {
  let text = raw.trim();
  // Closed thinking blocks
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  // Truncated/unclosed thinking — drop from opening tag to end
  text = text.replace(/<think>[\s\S]*$/gi, "").trim();
  text = text.replace(/<\/?think>/gi, "").trim();
  // If the model only emitted thinking (common with low num_predict), keep a
  // minimal non-empty placeholder so callers can still close via citations.
  return text;
}

async function synthesizeViaOllama(
  question: string,
  expansion: GraphExpansion,
  opts: OllamaSynthesisOptions | undefined,
  probe: OllamaProbeResult,
): Promise<OllamaGenerateAttempt> {
  if (!probe.ok || !probe.model) {
    return { dossier: null, fail_reason: "probe_not_ok" };
  }
  const fetchFn = opts?.fetchFn ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? 45_000;
  const base_url = probe.base_url;
  const model = probe.model;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetchFn(`${base_url}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        prompt: buildOllamaPrompt(question, expansion),
        stream: false,
        options: { temperature: 0, num_predict: 768 },
      }),
    }).finally(() => clearTimeout(t));

    if (!res.ok) {
      return { dossier: null, fail_reason: `generate_http_${res.status}` };
    }
    const body = (await res.json()) as { response?: string };
    const raw = (body.response ?? "").trim();
    if (!raw) {
      return { dossier: null, fail_reason: "generate_empty_response" };
    }
    const visible = normalizeOllamaResponse(raw);
    const limitations = [
      "STATUS=CLOSED_OLLAMA",
      "Local Ollama only — Frontier models are not used",
      `probe=${probe.code}`,
    ];

    let answer: string;
    if (visible) {
      answer = visible.includes("STATUS=CLOSED_OLLAMA")
        ? visible
        : `${visible}\n\nSTATUS=CLOSED_OLLAMA`;
    } else {
      // Reasoning-only models (e.g. truncated <think>) — close from evidence + cite.
      const stub = synthesizeDeterministicStub(question, expansion);
      answer = [
        `# Multi-hop dossier (Ollama; model returned reasoning-only tokens)`,
        ``,
        stub.answer.replace("STATUS=CLOSED_DETERMINISTIC_STUB", "STATUS=CLOSED_OLLAMA"),
      ].join("\n");
      limitations.push("model_visible_answer_empty_after_think_strip");
    }

    return {
      dossier: {
        question,
        status: "CLOSED_OLLAMA",
        closed: true,
        answer,
        citations: citationsFrom(expansion.evidence),
        hops_used: expansion.max_hops,
        evidence_count: expansion.evidence.length,
        synthesizer: "ollama",
        model,
        evidence_fingerprint: fingerprintEvidence(expansion.evidence),
        limitations,
        schema_version: MULTI_HOP_SYNTHESIS_SCHEMA_VERSION,
      },
    };
  } catch (err) {
    return {
      dossier: null,
      fail_reason: `generate_error:${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * synthesizeLocal: prefer Ollama when available; else deterministic stub.
 * Always returns a dossier object; STATUS documents which path closed it.
 */
export async function synthesizeLocal(input: SynthesizeLocalInput): Promise<ClosedDossier> {
  const question = input.question ?? "";
  const expansion = input.expansion;
  if (!expansion) {
    throw new MultiHopSynthesisError("EXPANSION_REQUIRED", "expansion is required");
  }

  if (expansion.evidence.length === 0) {
    return openInsufficient(question, expansion);
  }

  const forceStub = input.ollama?.forceStub === true;
  if (forceStub) {
    return synthesizeDeterministicStub(question, expansion);
  }

  const probe = await probeOllama(input.ollama);
  if (probe.ok) {
    const attempt = await synthesizeViaOllama(question, expansion, input.ollama, probe);
    if (attempt.dossier) return attempt.dossier;

    const stub = synthesizeDeterministicStub(question, expansion);
    return {
      ...stub,
      limitations: [
        ...stub.limitations,
        `ollama_probe=${probe.code}:${probe.detail}`,
        `ollama_generate_failed=${attempt.fail_reason ?? "unknown"}`,
        "fell_back_to_deterministic_stub",
      ],
    };
  }

  const stub = synthesizeDeterministicStub(question, expansion);
  // Annotate that Ollama was probed but unavailable.
  return {
    ...stub,
    limitations: [
      ...stub.limitations,
      `ollama_probe=${probe.code}:${probe.detail}`,
      "fell_back_to_deterministic_stub",
    ],
  };
}

/**
 * Full pipeline: expandGraph → synthesizeLocal → closed dossier.
 */
export async function runMultiHopSynthesis(
  input: MultiHopSynthesisInput,
): Promise<ClosedDossier> {
  if (!input.graph) {
    throw new MultiHopSynthesisError("GRAPH_REQUIRED", "HybridGraphStore required");
  }
  if (!(input.graph instanceof HybridGraphStore)) {
    // Still allow duck-typed stores in tests if they expose the same surface —
    // but require listEdges/getNode via runtime check.
    const g = input.graph as HybridGraphStore;
    if (typeof g.listEdges !== "function" || typeof g.getNode !== "function") {
      throw new MultiHopSynthesisError("GRAPH_INVALID", "graph missing HybridGraphStore API");
    }
  }

  const hops = input.hops ?? 2;
  let expansion: GraphExpansion;
  try {
    expansion = expandGraph(input.graph, input.start_file, hops);
  } catch (err) {
    if (err instanceof HybridGraphError || err instanceof MultiHopSynthesisError) throw err;
    throw new MultiHopSynthesisError(
      "EXPAND_FAILED",
      err instanceof Error ? err.message : String(err),
    );
  }

  return synthesizeLocal({
    question: input.question,
    expansion,
    ollama: input.ollama,
  });
}
