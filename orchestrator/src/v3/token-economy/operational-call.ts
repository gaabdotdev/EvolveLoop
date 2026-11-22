/**
 * V1-TOK-10 — No free prose in operational calls.
 *
 * Operational LLM calls use tool_choice: required, rigid stop sequences,
 * and JSON schemas without free-text fields (explanation/summary/thoughts).
 * Exception states (BLOCKED) may relax via allowFreeProse — default is forbid.
 */

import type { LazyToolSchema } from "./lazy-tools.js";

/** Property names banned from operational response / tool schemas. */
export const FREE_PROSE_PROP_NAMES = [
  "explanation",
  "summary",
  "thoughts",
  "reasoning",
  "commentary",
  "rationale",
  "notes",
  "message",
  "prose",
] as const;

export type FreeProsePropName = (typeof FREE_PROSE_PROP_NAMES)[number];

export const DEFAULT_OPERATIONAL_STOP_SEQUENCES = [
  "<<<END_PATCH>>>",
  "<<<END_JSON>>>",
  "<<<END_OP>>>",
] as const;

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
}

export interface OperationalCallSpec {
  kind: "OperationalCallSpec";
  tool_choice: "required";
  stop: string[];
  tools: LazyToolSchema[];
  response_json_schema: JsonSchemaObject;
  /** Explicit list of banned free-prose property names. */
  forbid_free_prose_props: readonly FreeProsePropName[];
  max_tokens?: number;
}

export interface BuildOperationalCallSpecInput {
  tools?: readonly LazyToolSchema[];
  stop_sequences?: readonly string[];
  /** Base schema; free-prose props are stripped. */
  schema?: JsonSchemaObject;
  max_tokens?: number;
  /** When true, keep free-prose props (BLOCKED/debug only). Default false. */
  allow_free_prose?: boolean;
}

const DEFAULT_OP_SCHEMA: JsonSchemaObject = {
  type: "object",
  properties: {
    op: { type: "string", enum: ["REPLACE", "DELETE", "NOOP"] },
    path: { type: "string" },
    start: { type: "integer" },
    end: { type: "integer" },
    content: { type: "string" },
    expected_hash: { type: "string" },
  },
  required: ["op"],
  additionalProperties: false,
};

function isFreeProseProp(name: string): name is FreeProsePropName {
  return (FREE_PROSE_PROP_NAMES as readonly string[]).includes(name);
}

/**
 * Strip banned free-prose properties from a JSON schema object.
 */
export function stripFreeProseProps(schema: JsonSchemaObject): JsonSchemaObject {
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema.properties ?? {})) {
    if (isFreeProseProp(key)) continue;
    properties[key] = value;
  }
  const required = (schema.required ?? []).filter((k) => !isFreeProseProp(k));
  return {
    type: "object",
    properties,
    required: required.length > 0 ? required : undefined,
    additionalProperties: false,
  };
}

/** True when schema has no free-prose property keys. */
export function schemaHasNoFreeProse(schema: JsonSchemaObject): boolean {
  return !Object.keys(schema.properties ?? {}).some((k) => isFreeProseProp(k));
}

/**
 * Build an OperationalCallSpec: tool_choice required, stop sequences,
 * JSON schema without free-prose fields.
 */
export function buildOperationalCallSpec(
  input: BuildOperationalCallSpecInput = {},
): OperationalCallSpec {
  const rawSchema = input.schema ?? DEFAULT_OP_SCHEMA;
  const response_json_schema = input.allow_free_prose
    ? { ...rawSchema, additionalProperties: false as const }
    : stripFreeProseProps(rawSchema);

  if (!input.allow_free_prose && !schemaHasNoFreeProse(response_json_schema)) {
    throw new Error("operational schema still contains free-prose properties");
  }

  const stop = [...(input.stop_sequences ?? DEFAULT_OPERATIONAL_STOP_SEQUENCES)];
  if (stop.length === 0) {
    throw new Error("operational call requires at least one stop sequence");
  }

  return {
    kind: "OperationalCallSpec",
    tool_choice: "required",
    stop,
    tools: [...(input.tools ?? [])],
    response_json_schema,
    forbid_free_prose_props: FREE_PROSE_PROP_NAMES,
    max_tokens: input.max_tokens,
  };
}
