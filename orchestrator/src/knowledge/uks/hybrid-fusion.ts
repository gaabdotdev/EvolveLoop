/**
 * EvolveLoop V2.5 - Unified Knowledge System (UKS Core)
 * Reciprocal Rank Fusion (RRF) Hybrid Fusion Engine (Phase 6)
 * 
 * Fuses multi-channel relevance signals from:
 * 1. BM25 Lexical Engine (In-process keyword matching)
 * 2. AST Syntactic Extractor (In-process code symbol resolution)
 * 3. Local Vector Embeddings (Optional / Degraded offline)
 * 
 * Formula: RRF_Score(d) = SUM_c ( w_c / (k + rank_c(d)) ) with k = 60.
 * Includes graceful degradation (degraded_mode: true) and snippet deduplication.
 */

// storage-core imports omitted (not needed)

export type FusionChannel = "bm25" | "ast" | "vector";

export interface ChannelHit {
    item_id: string;
    file_path: string;
    start_line: number;
    end_line: number;
    title: string;
    content: string;
    raw_score: number;
    channel: FusionChannel;
    metadata?: Record<string, unknown>;
}

export interface FusedHit {
    item_id: string;
    file_path: string;
    start_line: number;
    end_line: number;
    title: string;
    content: string;
    rrf_score: number;
    contributing_channels: FusionChannel[];
    channel_ranks: Partial<Record<FusionChannel, number>>;
    channel_scores: Partial<Record<FusionChannel, number>>;
    citation_ref: string;
    metadata?: Record<string, unknown>;
}

export interface FusionOptions {
    k?: number;                                       // Smoothing constant (default: 60)
    weights?: Partial<Record<FusionChannel, number>>; // Channel weights (default: bm25: 1.0, ast: 1.2, vector: 0.8)
    deduplicateOverlaps?: boolean;                     // Merge overlapping line ranges (default: true)
    maxResults?: number;                              // Top N results limit (default: 10)
    vectorAvailable?: boolean;                        // Vector engine status flag (default: false)
}

export interface FusionResult {
    hits: FusedHit[];
    degraded_mode: boolean;
    active_channels: FusionChannel[];
    total_candidates: number;
    duration_ms: number;
}

export const DEFAULT_RRF_K = 60;

export const DEFAULT_CHANNEL_WEIGHTS: Record<FusionChannel, number> = {
    bm25: 1.0,   // Standard lexical weight
    ast: 1.2,    // Boost for exact AST symbol definitions
    vector: 0.8  // Semantic similarity weight
};

/**
 * Merges two text contents if line ranges overlap or are contiguous.
 */
function mergeChunkContents(
    hitA: FusedHit,
    hitB: ChannelHit
): { start_line: number; end_line: number; content: string } {
    const minStart = Math.min(hitA.start_line, hitB.start_line);
    const maxEnd = Math.max(hitA.end_line, hitB.end_line);

    // If one encompasses the other or they overlap significantly
    if (hitA.content.includes(hitB.content)) {
        return { start_line: minStart, end_line: maxEnd, content: hitA.content };
    }
    if (hitB.content.includes(hitA.content)) {
        return { start_line: minStart, end_line: maxEnd, content: hitB.content };
    }

    // Otherwise concatenate seamlessly
    const combined = `${hitA.content}\n---\n${hitB.content}`;
    return { start_line: minStart, end_line: maxEnd, content: combined };
}

/**
 * Canonical Reciprocal Rank Fusion Engine.
 */
export class HybridFusionEngine {
    private k: number;
    private weights: Record<FusionChannel, number>;

    constructor(options: FusionOptions = {}) {
        this.k = options.k ?? DEFAULT_RRF_K;
        this.weights = {
            ...DEFAULT_CHANNEL_WEIGHTS,
            ...(options.weights || {})
        };
    }

    /**
     * Executes RRF fusion across multiple channel hit lists.
     */
    public fuse(
        channelHitsMap: Partial<Record<FusionChannel, ChannelHit[]>>,
        options: FusionOptions = {}
    ): FusionResult {
        const startTime = performance.now();
        const k = options.k ?? this.k;
        const weights = { ...this.weights, ...(options.weights || {}) };
        const maxResults = options.maxResults ?? 10;
        const deduplicate = options.deduplicateOverlaps ?? true;
        const vectorAvailable = options.vectorAvailable ?? false;

        const activeChannels: FusionChannel[] = [];
        const candidatesMap = new Map<string, FusedHit>();

        // Check if vector channel was requested or available
        const vectorHits = channelHitsMap["vector"] || [];
        const degradedMode = !vectorAvailable || vectorHits.length === 0;

        // Process each channel
        const channelsToProcess: FusionChannel[] = ["bm25", "ast", "vector"];

        for (const channel of channelsToProcess) {
            const hits = channelHitsMap[channel];
            if (!hits || hits.length === 0) continue;

            activeChannels.push(channel);
            const channelWeight = weights[channel] ?? 1.0;

            // Sort hits by raw_score descending to assign rank
            const sorted = [...hits].sort((a, b) => b.raw_score - a.raw_score);

            for (let rankIndex = 0; rankIndex < sorted.length; rankIndex++) {
                const hit = sorted[rankIndex];
                const rank = rankIndex + 1; // 1-based rank
                const rrfContribution = channelWeight / (k + rank);

                // Unique candidate key: file_path + line range or item_id
                const candidateKey = hit.item_id || `${hit.file_path}#L${hit.start_line}-L${hit.end_line}`;
                let candidate = candidatesMap.get(candidateKey);

                if (!candidate) {
                    // Check for overlapping chunks in the same file if deduplication is enabled
                    let merged = false;
                    if (deduplicate) {
                        for (const existing of candidatesMap.values()) {
                            if (existing.file_path === hit.file_path) {
                                // Check overlap: start <= existing.end && end >= existing.start
                                const overlaps = (hit.start_line <= existing.end_line + 2) && (hit.end_line >= existing.start_line - 2);
                                if (overlaps) {
                                    // Merge hit into existing candidate
                                    const mergedData = mergeChunkContents(existing, hit);
                                    existing.start_line = mergedData.start_line;
                                    existing.end_line = mergedData.end_line;
                                    existing.content = mergedData.content;
                                    existing.citation_ref = `${existing.file_path}:${mergedData.start_line}-${mergedData.end_line}`;
                                    existing.rrf_score += rrfContribution;

                                    if (!existing.contributing_channels.includes(channel)) {
                                        existing.contributing_channels.push(channel);
                                    }
                                    existing.channel_ranks[channel] = rank;
                                    existing.channel_scores[channel] = hit.raw_score;

                                    merged = true;
                                    break;
                                }
                            }
                        }
                    }

                    if (!merged) {
                        candidate = {
                            item_id: hit.item_id,
                            file_path: hit.file_path,
                            start_line: hit.start_line,
                            end_line: hit.end_line,
                            title: hit.title,
                            content: hit.content,
                            rrf_score: rrfContribution,
                            contributing_channels: [channel],
                            channel_ranks: { [channel]: rank },
                            channel_scores: { [channel]: hit.raw_score },
                            citation_ref: `${hit.file_path}:${hit.start_line}-${hit.end_line}`,
                            metadata: hit.metadata
                        };
                        candidatesMap.set(candidateKey, candidate);
                    }
                } else {
                    // Increment RRF score for existing exact candidate
                    candidate.rrf_score += rrfContribution;
                    if (!candidate.contributing_channels.includes(channel)) {
                        candidate.contributing_channels.push(channel);
                    }
                    candidate.channel_ranks[channel] = rank;
                    candidate.channel_scores[channel] = hit.raw_score;
                }
            }
        }

        // Convert candidates map to sorted array
        const fusedList = Array.from(candidatesMap.values());
        fusedList.sort((a, b) => b.rrf_score - a.rrf_score);

        // Format RRF scores to 6 decimal places for readability
        for (const hit of fusedList) {
            hit.rrf_score = Number(hit.rrf_score.toFixed(6));
        }

        const durationMs = Number((performance.now() - startTime).toFixed(2));

        return {
            hits: fusedList.slice(0, maxResults),
            degraded_mode: degradedMode,
            active_channels: activeChannels,
            total_candidates: fusedList.length,
            duration_ms: durationMs
        };
    }
}
