/**
 * V2-MEM-01 — Memory Consolidation Engine.
 *
 * Analyzes verified episodes at session/milestone boundaries, extracts lessons,
 * deduplicates, and emits PROPOSED create/update/skip proposals linked to evidence.
 * Never auto-promotes to VERIFIED / ACTIVE — promotion stays behind promotion-gate.
 */

import { createHash, randomUUID } from "node:crypto";

/** Verified episode input (session/milestone artifact). */
export interface VerifiedEpisode {
  episode_id: string;
  summary: string;
  /** Direct links to original evidence artifacts. */
  evidence_ids: string[];
  /** When set, near-duplicate lessons prefer `update` against this memory. */
  related_memory_id?: string;
  project_id?: string;
  metadata?: Record<string, unknown>;
}

export type ConsolidationAction = "create" | "update" | "skip";

/** Proposal status is always PROPOSED — never auto-VERIFIED. */
export type ConsolidationProposalStatus = "PROPOSED";

export interface ConsolidationProposal {
  proposal_id: string;
  action: ConsolidationAction;
  lesson: string;
  evidence_ids: string[];
  dedupe_key: string;
  status: ConsolidationProposalStatus;
  source_episode_ids: string[];
  /** How the lesson text was produced. */
  extraction: "llm" | "heuristic" | "stub";
  /** Present when action === "update". */
  target_memory_id?: string;
  /** Why skip/update was chosen (audit). */
  reason?: string;
}

/** Injectable LLM port — Ollama or offline stub. */
export interface LessonExtractorPort {
  readonly extractor_id: string;
  extractLessons(episode: VerifiedEpisode): Promise<string[]>;
}

export interface ConsolidationEngineOptions {
  extractor?: LessonExtractorPort;
  /** Jaccard threshold for near-duplicate lessons (default 0.85). */
  similarity_threshold?: number;
}

function normalizeLesson(text: string): string {
  return text
    .toLowerCase()
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stable dedupe key from normalized lesson text. */
export function lessonDedupeKey(lesson: string): string {
  return createHash("sha256").update(normalizeLesson(lesson)).digest("hex");
}

function tokenize(text: string): Set<string> {
  return new Set(
    (normalizeLesson(text).match(/[a-z0-9_\u00c0-\u024f]+/gi) ?? []).filter((t) => t.length > 2),
  );
}

/** Simple token Jaccard similarity on lessons. */
export function lessonSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Heuristic extractRules — bullet points / sentences from episode summary.
 * Used when LLM port fails or as the deterministic stub path.
 */
export function extractRulesHeuristic(summary: string): string[] {
  const raw = summary.trim();
  if (!raw) return [];

  const bullets = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s+/, "").trim())
    .filter((line) => line.length >= 8);

  if (bullets.length >= 2) {
    return dedupeStrings(bullets);
  }

  // Split on sentence boundaries when no bullet list.
  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);

  if (sentences.length > 0) return dedupeStrings(sentences);
  return [raw];
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = normalizeLesson(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

/**
 * Deterministic offline stub for CI — does not call Ollama.
 * Produces the same rules as the heuristic extractor.
 */
export class StubLessonExtractor implements LessonExtractorPort {
  readonly extractor_id = "stub";

  async extractLessons(episode: VerifiedEpisode): Promise<string[]> {
    return extractRulesHeuristic(episode.summary);
  }
}

interface KnownLesson {
  dedupe_key: string;
  lesson: string;
  proposal_id: string;
  memory_id?: string;
}

/**
 * ConsolidationEngine — ingest verified episodes → ConsolidationProposal[].
 */
export class ConsolidationEngine {
  private readonly extractor: LessonExtractorPort;
  private readonly similarityThreshold: number;
  /** Catalog of lessons already proposed (exact + similarity dedupe). */
  private readonly known: KnownLesson[] = [];

  constructor(opts?: ConsolidationEngineOptions) {
    this.extractor = opts?.extractor ?? new StubLessonExtractor();
    this.similarityThreshold = opts?.similarity_threshold ?? 0.85;
  }

  /** Snapshot of known dedupe keys (tests / observability). */
  knownDedupeKeys(): string[] {
    return this.known.map((k) => k.dedupe_key);
  }

  /**
   * Seed existing ACTIVE/PROPOSED lessons so near-matches emit `update`.
   */
  seedKnownLessons(
    entries: Array<{ lesson: string; memory_id?: string; proposal_id?: string }>,
  ): void {
    for (const e of entries) {
      const dedupe_key = lessonDedupeKey(e.lesson);
      if (this.known.some((k) => k.dedupe_key === dedupe_key)) continue;
      this.known.push({
        dedupe_key,
        lesson: e.lesson,
        proposal_id: e.proposal_id ?? `seed-${dedupe_key.slice(0, 12)}`,
        memory_id: e.memory_id,
      });
    }
  }

  async ingestVerifiedEpisodes(
    episodes: VerifiedEpisode[],
  ): Promise<ConsolidationProposal[]> {
    const proposals: ConsolidationProposal[] = [];

    for (const episode of episodes) {
      const { lessons, extraction } = await this.extractWithFallback(episode);

      for (const lesson of lessons) {
        const proposal = this.proposeForLesson(episode, lesson, extraction);
        proposals.push(proposal);
      }
    }

    return proposals;
  }

  private async extractWithFallback(
    episode: VerifiedEpisode,
  ): Promise<{ lessons: string[]; extraction: ConsolidationProposal["extraction"] }> {
    try {
      const lessons = await this.extractor.extractLessons(episode);
      if (!Array.isArray(lessons) || lessons.length === 0) {
        return { lessons: extractRulesHeuristic(episode.summary), extraction: "heuristic" };
      }
      const cleaned = dedupeStrings(lessons.map((l) => String(l).trim()).filter(Boolean));
      if (cleaned.length === 0) {
        return { lessons: extractRulesHeuristic(episode.summary), extraction: "heuristic" };
      }
      const extraction: ConsolidationProposal["extraction"] =
        this.extractor.extractor_id === "stub"
          ? "stub"
          : this.extractor.extractor_id.startsWith("ollama")
            ? "llm"
            : "llm";
      return { lessons: cleaned, extraction };
    } catch {
      return { lessons: extractRulesHeuristic(episode.summary), extraction: "heuristic" };
    }
  }

  private proposeForLesson(
    episode: VerifiedEpisode,
    lesson: string,
    extraction: ConsolidationProposal["extraction"],
  ): ConsolidationProposal {
    const dedupe_key = lessonDedupeKey(lesson);
    const evidence_ids = [...new Set(episode.evidence_ids.filter(Boolean))];

    const exact = this.known.find((k) => k.dedupe_key === dedupe_key);
    if (exact) {
      return {
        proposal_id: exact.proposal_id,
        action: "skip",
        lesson,
        evidence_ids,
        dedupe_key,
        status: "PROPOSED",
        source_episode_ids: [episode.episode_id],
        extraction,
        target_memory_id: exact.memory_id,
        reason: "exact_dedupe_key",
      };
    }

    let best: { entry: KnownLesson; score: number } | null = null;
    for (const entry of this.known) {
      const score = lessonSimilarity(lesson, entry.lesson);
      if (score >= this.similarityThreshold && (!best || score > best.score)) {
        best = { entry, score };
      }
    }

    if (best) {
      const target =
        episode.related_memory_id ?? best.entry.memory_id ?? best.entry.proposal_id;
      const proposal_id = `upd-${dedupe_key.slice(0, 16)}`;
      const proposal: ConsolidationProposal = {
        proposal_id,
        action: "update",
        lesson,
        evidence_ids,
        dedupe_key,
        status: "PROPOSED",
        source_episode_ids: [episode.episode_id],
        extraction,
        target_memory_id: target,
        reason: `similarity=${best.score.toFixed(2)}`,
      };
      // Refresh catalog with newer wording under the same near-key cluster.
      this.known.push({
        dedupe_key,
        lesson,
        proposal_id,
        memory_id: typeof target === "string" ? target : undefined,
      });
      return proposal;
    }

    const proposal_id = `crt-${dedupe_key.slice(0, 16)}`;
    const proposal: ConsolidationProposal = {
      proposal_id,
      action: "create",
      lesson,
      evidence_ids,
      dedupe_key,
      status: "PROPOSED",
      source_episode_ids: [episode.episode_id],
      extraction,
      target_memory_id: episode.related_memory_id,
      reason: "new_lesson",
    };
    this.known.push({
      dedupe_key,
      lesson,
      proposal_id,
      memory_id: episode.related_memory_id,
    });
    return proposal;
  }
}

export interface ConsolidationRunnerOptions {
  engine: ConsolidationEngine;
  /** Interval ms when start() is used (default 60_000). Ignored by runOnce(). */
  interval_ms?: number;
  /** Optional clock/timer injection for tests. */
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

/**
 * Background runner — queue + start/stop. Tests use runOnce() without real timers.
 */
export class ConsolidationBackgroundRunner {
  private readonly engine: ConsolidationEngine;
  private readonly intervalMs: number;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private queue: VerifiedEpisode[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  /** Last runOnce result (for observability). */
  lastProposals: ConsolidationProposal[] = [];

  constructor(opts: ConsolidationRunnerOptions) {
    this.engine = opts.engine;
    this.intervalMs = opts.interval_ms ?? 60_000;
    this.setIntervalFn = opts.setIntervalFn ?? setInterval;
    this.clearIntervalFn = opts.clearIntervalFn ?? clearInterval;
  }

  enqueue(episodes: VerifiedEpisode[]): void {
    this.queue.push(...episodes);
  }

  /** Drain queue once — deterministic, no wall-clock timer required. */
  async runOnce(): Promise<ConsolidationProposal[]> {
    if (this.queue.length === 0) {
      this.lastProposals = [];
      return [];
    }
    const batch = this.queue.splice(0, this.queue.length);
    this.lastProposals = await this.engine.ingestVerifiedEpisodes(batch);
    return this.lastProposals;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = this.setIntervalFn(() => {
      void this.runOnce();
    }, this.intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer != null) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}

/** Convenience factory — stub extractor for offline CI. */
export function createOfflineConsolidationEngine(
  opts?: Omit<ConsolidationEngineOptions, "extractor">,
): ConsolidationEngine {
  return new ConsolidationEngine({
    ...opts,
    extractor: new StubLessonExtractor(),
  });
}

/** Unique id helper (exported for adapters). */
export function newConsolidationId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
