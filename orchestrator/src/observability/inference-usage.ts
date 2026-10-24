/**
 * Pure module for inference usage classification and accounting (G1 - Phase B).
 * No IO allowed in this module.
 * Conforms to UKS Core V2.5 contracts.
 */

export type InferenceUsageSource =
  | "dado_provider"
  | "estimativa_local"
  | "proxy_experimental"
  | "desconhecido";

export type InferenceUsageConfidence =
  | "exact"
  | "estimated"
  | "proxy"
  | "NOT_MEASURED";

export type InferenceOutcome = "success" | "error" | "interrupted";

export const NOT_MEASURED = "NOT_MEASURED" as const;
export type NotMeasured = typeof NOT_MEASURED;

export interface InferenceSpanRecord {
  run_id: string | null;
  task_id: string | null;
  agent_id: string | null;
  phase: string | null;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  usage_source: InferenceUsageSource;
  usage_confidence: InferenceUsageConfidence;
  estimated_cost: "NOT_MEASURED";
  actual_cost: "NOT_MEASURED";
  retry_index: number | null;
  outcome: InferenceOutcome;
  duration_ms: number | null;
}

export interface ClassifyHttpInferenceUsageInput {
  httpOk: boolean;
  body?: unknown;
  runId?: string | null;
  run_id?: string | null;
  taskId?: string | null;
  task_id?: string | null;
  agentId?: string | null;
  agent_id?: string | null;
  phase?: string | null;
  provider?: string | null;
  model?: string | null;
  retryIndex?: number | null;
  retry_index?: number | null;
  durationMs?: number | null;
  duration_ms?: number | null;
  callIndex?: number | null;
  call_index?: number | null;
  outcome?: InferenceOutcome;
}

function cleanString(val: unknown): string | null {
  return typeof val === "string" && val.trim().length > 0 ? val : null;
}

function isFiniteNumber(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val);
}

function extractMeasurementClass(
  val: InferenceUsageSource | { usage_source: InferenceUsageSource },
): string {
  if (typeof val === "string") {
    return val;
  }
  if (typeof val === "object" && val !== null) {
    const source = (val as { usage_source?: unknown }).usage_source;
    if (typeof source === "string") {
      return source;
    }
    throw new Error("Object argument must have a string 'usage_source'");
  }
  throw new Error("Argument must be a string or an object with a string 'usage_source'");
}

/**
 * Rejects arithmetic aggregation across different measurement classes.
 */
export function assertSameMeasurementClass(
  classA: InferenceUsageSource | { usage_source: InferenceUsageSource },
  classB: InferenceUsageSource | { usage_source: InferenceUsageSource },
): void {
  const a = extractMeasurementClass(classA);
  const b = extractMeasurementClass(classB);
  if (a !== b) {
    throw new Error(
      `Cannot aggregate different measurement classes: '${a}' and '${b}'`,
    );
  }
}

/**
 * Classifies an already-parsed HTTP payload without calling vendor-cache-usage.
 */
export function classifyHttpInferenceUsage(
  input: ClassifyHttpInferenceUsageInput,
): InferenceSpanRecord {
  const run_id = cleanString(input.runId ?? input.run_id);
  const task_id = cleanString(input.taskId ?? input.task_id);
  const agent_id = cleanString(input.agentId ?? input.agent_id);
  const phase = cleanString(input.phase);
  const provider = cleanString(input.provider);
  const model = cleanString(input.model);

  // retry_index only if caller explicitly passes retryIndex / retry_index.
  // call_index or callIndex is NOT retry_index.
  const rawRetry = input.retryIndex ?? input.retry_index;
  const retry_index = isFiniteNumber(rawRetry) ? rawRetry : null;

  // duration_ms only if caller passes a finite number. Never default to 0.
  const rawDuration = input.durationMs ?? input.duration_ms;
  const duration_ms = isFiniteNumber(rawDuration) ? rawDuration : null;

  // cached_input_tokens is always null and NOT_MEASURED (never sum vendor tokens)
  const cached_input_tokens: number | null = null;
  const estimated_cost = NOT_MEASURED;
  const actual_cost = NOT_MEASURED;

  const body = input.body;
  const usageObj =
    body &&
    typeof body === "object" &&
    "usage" in body &&
    typeof (body as Record<string, unknown>).usage === "object" &&
    (body as Record<string, unknown>).usage !== null
      ? ((body as { usage: Record<string, unknown> }).usage)
      : null;

  if (!input.httpOk || !usageObj) {
    return {
      run_id,
      task_id,
      agent_id,
      phase,
      provider,
      model,
      input_tokens: null,
      output_tokens: null,
      cached_input_tokens,
      usage_source: "desconhecido",
      usage_confidence: "NOT_MEASURED",
      estimated_cost,
      actual_cost,
      retry_index,
      outcome: input.outcome ?? "error",
      duration_ms,
    };
  }

  // HTTP OK and usage object is present
  let rawInput: unknown = undefined;
  if ("input_tokens" in usageObj) {
    rawInput = usageObj.input_tokens;
  } else if ("prompt_tokens" in usageObj) {
    rawInput = usageObj.prompt_tokens;
  }

  let rawOutput: unknown = undefined;
  if ("output_tokens" in usageObj) {
    rawOutput = usageObj.output_tokens;
  } else if ("completion_tokens" in usageObj) {
    rawOutput = usageObj.completion_tokens;
  }

  const input_tokens: number | null = isFiniteNumber(rawInput) ? rawInput : null;
  const output_tokens: number | null = isFiniteNumber(rawOutput) ? rawOutput : null;

  let usage_source: InferenceUsageSource;
  let usage_confidence: InferenceUsageConfidence;
  let outcome: InferenceOutcome;

  if (input_tokens !== null || output_tokens !== null) {
    usage_source = "dado_provider";
    usage_confidence = "exact";
    outcome = input.outcome ?? "success";
  } else {
    // Both fields are missing or not finite numbers - do not default to 0
    usage_source = "desconhecido";
    usage_confidence = "NOT_MEASURED";
    outcome = input.outcome ?? "error";
  }

  return {
    run_id,
    task_id,
    agent_id,
    phase,
    provider,
    model,
    input_tokens,
    output_tokens,
    cached_input_tokens,
    usage_source,
    usage_confidence,
    estimated_cost,
    actual_cost,
    retry_index,
    outcome,
    duration_ms,
  };
}

export const classifyHttpPayloadUsage = classifyHttpInferenceUsage;
