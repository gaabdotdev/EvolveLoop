/**
 * Benchmark Comparison Contract and Pairing Logic (G2 - Phase B)
 * Strict accounting pairing rules for benchmark samples.
 * Pure module - no IO or network allowed.
 */

import type { InferenceUsageSource } from "./inference-usage.js";

export type BenchmarkMeasurementClass = InferenceUsageSource;

export interface BenchmarkSample {
  value: number;
  measurementClass: BenchmarkMeasurementClass;
  producer: string;
  label: string;
  corpusId: string;
  taskId: string;
}

export type BenchmarkComparisonResult =
  | {
      comparable: false;
      measurementClass: "desconhecido";
      delta?: undefined;
    }
  | {
      comparable: true;
      measurementClass: BenchmarkMeasurementClass;
      delta: number;
    };

function isValidStringAttribute(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

/**
 * Compares two benchmark samples according to the strict 5-attribute pairing contract.
 * Returns { comparable: false, measurementClass: "desconhecido" } when any of the 5 attributes differs or is empty.
 * When all five match and class is not "desconhecido", returns { comparable: true, measurementClass, delta: b.value - a.value }.
 * Never calculates delta or converts to cost when not comparable.
 */
export function compareBenchmarkSamples(
  a: BenchmarkSample,
  b: BenchmarkSample,
): BenchmarkComparisonResult {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") {
    return { comparable: false, measurementClass: "desconhecido" };
  }

  // 1. Validate value finiteness (NaN and non-numbers are non-comparable / desconhecido)
  if (
    typeof a.value !== "number" ||
    !Number.isFinite(a.value) ||
    typeof b.value !== "number" ||
    !Number.isFinite(b.value)
  ) {
    return { comparable: false, measurementClass: "desconhecido" };
  }

  // 2. Validate all 5 attributes are non-empty strings
  if (
    !isValidStringAttribute(a.measurementClass) ||
    !isValidStringAttribute(b.measurementClass) ||
    !isValidStringAttribute(a.producer) ||
    !isValidStringAttribute(b.producer) ||
    !isValidStringAttribute(a.label) ||
    !isValidStringAttribute(b.label) ||
    !isValidStringAttribute(a.corpusId) ||
    !isValidStringAttribute(b.corpusId) ||
    !isValidStringAttribute(a.taskId) ||
    !isValidStringAttribute(b.taskId)
  ) {
    return { comparable: false, measurementClass: "desconhecido" };
  }

  // 3. Reject if measurementClass is "desconhecido"
  if (a.measurementClass === "desconhecido" || b.measurementClass === "desconhecido") {
    return { comparable: false, measurementClass: "desconhecido" };
  }

  // 4. Verify all 5 attributes strictly match
  if (
    a.measurementClass !== b.measurementClass ||
    a.producer !== b.producer ||
    a.label !== b.label ||
    a.corpusId !== b.corpusId ||
    a.taskId !== b.taskId
  ) {
    return { comparable: false, measurementClass: "desconhecido" };
  }

  // Strict 5-attribute match verified: delta = b.value - a.value
  return {
    comparable: true,
    measurementClass: a.measurementClass,
    delta: b.value - a.value,
  };
}

/**
 * Immutable historical E-001 proxy series.
 */
export const E001_PROXY_SERIES = Object.freeze({
  CONTROL: 1673,
  T_SKILLS_5: 382,
  T_SKILLS_10: 789,
  T_TOKENS_40: 1010,
  measurementClass: "proxy_experimental" as const,
  producer: "catalog_harness.estimate_tokens",
  label: "PROXY:whitespace_split",
});

export type E001ProxySeries = typeof E001_PROXY_SERIES;

/**
 * Asserts that a candidate or pair does not attempt to compare E-001 with 'dado_provider'.
 * Rejects if any operand has measurementClass 'dado_provider'.
 */
export function assertNotProviderTokens(
  targetOrSeries: unknown,
  candidate?: unknown,
): void {
  const isDadoProvider = (val: unknown): boolean => {
    if (val === "dado_provider") return true;
    if (typeof val === "object" && val !== null) {
      const obj = val as { measurementClass?: unknown; usage_source?: unknown };
      return (
        obj.measurementClass === "dado_provider" ||
        obj.usage_source === "dado_provider"
      );
    }
    return false;
  };

  if (candidate === undefined) {
    if (isDadoProvider(targetOrSeries)) {
      throw new Error(
        "Cannot compare E001_PROXY_SERIES with measurementClass 'dado_provider'",
      );
    }
    return;
  }

  if (isDadoProvider(targetOrSeries) || isDadoProvider(candidate)) {
    throw new Error(
      "Cannot compare E001_PROXY_SERIES with measurementClass 'dado_provider'",
    );
  }
}
