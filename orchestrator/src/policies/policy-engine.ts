import type { ExecutionPolicy, ExecutionPolicySpec, GraphNode } from "../types/index.js";
import { loadPoliciesFromDir } from "../registry/manifest-loader.js";
import type { ContractDocument } from "../contracts/contract-types.js";

export const DEFAULT_INFERENCE_TIMEOUT_MS = 60000; // 60s fallback

export function normalizeRetryCount(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || Number.isNaN(raw) || !Number.isInteger(raw)) return undefined;
    if (raw < 0) return 0;
    if (raw > 10) return 10;
    return raw;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (/^-?\d+$/.test(trimmed)) {
      const val = parseInt(trimmed, 10);
      if (!Number.isFinite(val)) return undefined;
      if (val < 0) return 0;
      if (val > 10) return 10;
      return val;
    }
    return undefined;
  }
  return undefined;
}

export function parseTimeoutMs(timeout?: unknown): number | undefined {
  if (timeout === undefined || timeout === null) return undefined;
  if (typeof timeout === "number") {
    if (!Number.isFinite(timeout) || timeout <= 0) return undefined;
    return Math.floor(timeout);
  }
  if (typeof timeout !== "string") return undefined;
  const str = timeout.trim();
  if (str === "" || str === "0" || str === "0ms" || str === "0s") return undefined;
  const m = str.match(/^(\d+)(ms|s|m|h)?$/i);
  if (!m) return undefined;
  const val = Number(m[1]);
  if (!Number.isFinite(val) || val <= 0) return undefined;
  const unit = (m[2] || "ms").toLowerCase();
  switch (unit) {
    case "ms":
      return val;
    case "s":
      return val * 1000;
    case "m":
      return val * 60 * 1000;
    case "h":
      return val * 60 * 60 * 1000;
    default:
      return val;
  }
}

const BUILTIN_POLICIES: Record<string, ExecutionPolicy> = {
  "high-reliability": {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "ExecutionPolicy",
    metadata: { id: "high-reliability", version: "1.0.0", description: "Production" },
    spec: {
      retries: { default: 3, by_capability: { testing: 2 }, by_type: { gate: 1, worker: 3 } },
      gates: {
        required: ["testing", "security-review", "po-acceptance", "documentation"],
        optional: ["frontend-visual-review"],
        skipped: [],
      },
      provider_strategy: "highest_quality",
      parallelism: { max_parallel: 3, mode: "async" },
      timeouts: { step_timeout: "30m", wait_timeout: "60m", feature_timeout: "8h" },
      on_gate_reject: "orchestrator",
      on_evidence_missing: "fail",
      fail_fast: false,
      execution_order: "topological",
      knowledge: { consult_before_schedule: true, consult_before_provider_select: true },
      memory: { scope: "feature", persist_contextual: true },
      phase_gates: {
        enabled: true,
        mapping: {
          testing: 3,
          "security-review": 4,
          "po-acceptance": 5,
          documentation: 6,
        },
      },
    },
  },
  "rapid-prototype": {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "ExecutionPolicy",
    metadata: { id: "rapid-prototype", version: "1.0.0" },
    spec: {
      retries: { default: 1 },
      gates: {
        required: ["testing"],
        skipped: ["security-review", "documentation", "po-acceptance"],
      },
      provider_strategy: "fastest",
      parallelism: { max_parallel: 4, mode: "async" },
      timeouts: {},
      on_gate_reject: "auto_retry",
      on_evidence_missing: "fail",
      fail_fast: true,
      execution_order: "topological",
      gate_depth: "fast",
      knowledge: { consult_before_schedule: false },
    },
  },
  "cost-optimized": {
    apiVersion: "capability-orchestrator.io/v2",
    kind: "ExecutionPolicy",
    metadata: { id: "cost-optimized", version: "1.0.0", description: "Minimize cost — fast gates, cheapest providers" },
    spec: {
      retries: { default: 1, by_type: { gate: 0, worker: 2 } },
      gates: {
        required: ["testing"],
        optional: ["security-review", "frontend-visual-review", "po-acceptance", "documentation"],
        skipped: [],
      },
      provider_strategy: "cheapest",
      provider_strategy_fallback: "stable",
      parallelism: { max_parallel: 2, mode: "async" },
      timeouts: { step_timeout: "15m" },
      on_gate_reject: "orchestrator",
      on_evidence_missing: "retry",
      fail_fast: false,
      execution_order: "topological",
      gate_depth: "fast",
      min_confidence: 0.6,
      cost_budget: { max_nodes: 20, max_gate_depth: "fast" },
      knowledge: { consult_before_schedule: true },
    },
  },
};

export class PolicyEngine {
  private policies: Map<string, ExecutionPolicy>;

  constructor(options?: { policiesDir?: string; customPolicies?: ExecutionPolicy[] }) {
    this.policies = new Map(Object.entries(BUILTIN_POLICIES));
    if (options?.policiesDir) {
      for (const p of loadPoliciesFromDir(options.policiesDir)) {
        this.policies.set(p.metadata.id, p);
      }
    }
    for (const p of options?.customPolicies ?? []) {
      this.policies.set(p.metadata.id, p);
    }
  }

  resolve(policyId: string, overrides?: Partial<ExecutionPolicySpec>): ExecutionPolicy {
    const base = this.policies.get(policyId) ?? BUILTIN_POLICIES["high-reliability"];
    if (!overrides) return structuredClone(base);

    return {
      ...base,
      spec: {
        ...base.spec,
        ...overrides,
        retries: { ...base.spec.retries, ...overrides.retries },
        gates: { ...base.spec.gates, ...overrides.gates },
        parallelism: { ...base.spec.parallelism, ...overrides.parallelism },
      },
    };
  }

  gateEnabled(policy: ExecutionPolicy, capability: string): boolean {
    const { required, optional, skipped } = policy.spec.gates;
    if (skipped?.includes(capability)) return false;
    if (required.includes(capability)) return true;
    if (optional?.includes(capability)) return true;
    return !this.isKnownGate(capability);
  }

  private isKnownGate(capability: string): boolean {
    const allGates = new Set([
      "testing",
      "security-review",
      "po-acceptance",
      "documentation",
      "frontend-visual-review",
    ]);
    return allGates.has(capability);
  }

  retriesFor(policy: ExecutionPolicy, node: GraphNode, contract?: ContractDocument): number {
    const { retries } = policy.spec;
    const policyRetriesRaw =
      retries.by_capability?.[node.capability] ??
      retries.by_type?.[node.type] ??
      retries.default ??
      0;
    const policyRetries = normalizeRetryCount(policyRetriesRaw) ?? 0;

    const contractMaxRaw = contract?.spec?.retry_policy?.max;
    if (contractMaxRaw !== undefined) {
      const contractMax = normalizeRetryCount(contractMaxRaw);
      if (contractMax === undefined) {
        // Fail-closed: contrato especificou retry_policy.max inválido, limita a 0 retries
        return 0;
      }
      return Math.min(policyRetries, contractMax);
    }

    return policyRetries;
  }

  resolveTimeoutMs(policy: ExecutionPolicy, node: GraphNode, contract?: ContractDocument): number {
    const policyTimeoutStr = policy.spec.timeouts?.step_timeout;
    const policyTimeoutMs = parseTimeoutMs(policyTimeoutStr);
    const contractTimeoutRaw = contract?.spec?.timeout;

    if (contractTimeoutRaw !== undefined) {
      const contractTimeoutMs = parseTimeoutMs(contractTimeoutRaw);
      if (contractTimeoutMs === undefined) {
        // Fail-closed: contrato especificou timeout inválido, faz clamp para DEFAULT_INFERENCE_TIMEOUT_MS
        return policyTimeoutMs !== undefined
          ? Math.min(policyTimeoutMs, DEFAULT_INFERENCE_TIMEOUT_MS)
          : DEFAULT_INFERENCE_TIMEOUT_MS;
      }
      if (policyTimeoutMs !== undefined) {
        return Math.min(policyTimeoutMs, contractTimeoutMs);
      }
      return contractTimeoutMs;
    }

    return policyTimeoutMs ?? DEFAULT_INFERENCE_TIMEOUT_MS;
  }

  maxParallel(policy: ExecutionPolicy): number {
    return policy.spec.parallelism.max_parallel;
  }

  providerStrategy(policy: ExecutionPolicy): ExecutionPolicySpec["provider_strategy"] {
    return policy.spec.provider_strategy;
  }

  minConfidence(policy: ExecutionPolicy): number {
    return policy.spec.min_confidence ?? 0;
  }

  gateDepth(policy: ExecutionPolicy): ExecutionPolicySpec["gate_depth"] {
    return policy.spec.gate_depth ?? "standard";
  }
}
