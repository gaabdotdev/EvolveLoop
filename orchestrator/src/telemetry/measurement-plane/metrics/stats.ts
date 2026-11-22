import type { LatencyAggregate } from "../types.js";

export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export function summarizeLatency(samplesMs: number[]): LatencyAggregate {
  const sample_size = samplesMs.length;
  if (!sample_size) {
    return {
      sample_size: 0,
      mean_ms: null,
      median_ms: null,
      p50_ms: null,
      p90_ms: null,
      p95_ms: null,
      min_ms: null,
      max_ms: null,
      reliability: "insufficient_sample",
    };
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const reliability =
    sample_size < 3 ? "insufficient_sample" : sample_size < 5 ? "low" : "ok";
  return {
    sample_size,
    mean_ms: mean,
    median_ms: percentile(sorted, 50),
    p50_ms: percentile(sorted, 50),
    p90_ms: sample_size >= 5 ? percentile(sorted, 90) : null,
    p95_ms: sample_size >= 5 ? percentile(sorted, 95) : null,
    min_ms: sorted[0],
    max_ms: sorted[sorted.length - 1],
    reliability,
  };
}

/** Merge overlapping [start,end] intervals (ms epoch) into active duration. */
export function mergeIntervalDuration(intervals: Array<{ start: number; end: number }>): number {
  if (!intervals.length) return 0;
  const sorted = [...intervals].filter((i) => i.end >= i.start).sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = sorted[0].start;
  let curEnd = sorted[0].end;
  for (let i = 1; i < sorted.length; i++) {
    const it = sorted[i];
    if (it.start <= curEnd) curEnd = Math.max(curEnd, it.end);
    else {
      total += curEnd - curStart;
      curStart = it.start;
      curEnd = it.end;
    }
  }
  total += curEnd - curStart;
  return total;
}
