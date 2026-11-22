/**
 * V1-TOK-07 — Lazy Tool Schemas.
 *
 * Inject only the 3–4 tools strictly needed for the current MSO state.
 * Full catalogs waste 150–400 tokens per unused tool schema per request.
 */

import { MSO_STATES, type MsoState, isMsoState } from "../mso/states.js";

/** OpenAI-compatible function tool schema (compact; no free-prose fluff). */
export interface LazyToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<
        string,
        { type: string | string[]; description?: string; enum?: string[] }
      >;
      required?: string[];
      additionalProperties: false;
    };
  };
}

const TOOL_CATALOG: Record<string, LazyToolSchema> = {
  outline_file: {
    type: "function",
    function: {
      name: "outline_file",
      description: "Return signatures + line map for a file (no full body).",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Workspace-relative path" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  read_lines: {
    type: "function",
    function: {
      name: "read_lines",
      description: "Read inclusive line window (hard-capped).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          start: { type: "integer" },
          end: { type: "integer" },
        },
        required: ["path", "start", "end"],
        additionalProperties: false,
      },
    },
  },
  resolve_definition: {
    type: "function",
    function: {
      name: "resolve_definition",
      description: "Resolve symbol definition (tree-sitter / LSP).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          line: { type: "integer" },
          symbol: { type: "string" },
        },
        required: ["path", "symbol"],
        additionalProperties: false,
      },
    },
  },
  resolve_references: {
    type: "function",
    function: {
      name: "resolve_references",
      description: "Resolve symbol references across mapped files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          symbol: { type: "string" },
        },
        required: ["path", "symbol"],
        additionalProperties: false,
      },
    },
  },
  load_goal_document: {
    type: "function",
    function: {
      name: "load_goal_document",
      description: "Load Goal Contract document for the session.",
      parameters: {
        type: "object",
        properties: { goal_id: { type: "string" } },
        required: ["goal_id"],
        additionalProperties: false,
      },
    },
  },
  list_goals: {
    type: "function",
    function: {
      name: "list_goals",
      description: "List available goal documents.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  validate_goal: {
    type: "function",
    function: {
      name: "validate_goal",
      description: "Validate Goal Contract shape.",
      parameters: {
        type: "object",
        properties: { goal_id: { type: "string" } },
        required: ["goal_id"],
        additionalProperties: false,
      },
    },
  },
  encode_task_node: {
    type: "function",
    function: {
      name: "encode_task_node",
      description: "Emit TaskGraph node in positional compact form.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          deps: { type: "string", description: "Pipe-separated dependency ids" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  surgical_edit: {
    type: "function",
    function: {
      name: "surgical_edit",
      description: "REPLACE/DELETE line range with hash validation.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          op: { type: "string", description: "REPLACE|DELETE" },
          start: { type: "integer" },
          end: { type: "integer" },
          content: { type: "string" },
          expected_hash: { type: "string" },
        },
        required: ["path", "op", "start", "end"],
        additionalProperties: false,
      },
    },
  },
  run_tests: {
    type: "function",
    function: {
      name: "run_tests",
      description: "Run deterministic tests for the workspace.",
      parameters: {
        type: "object",
        properties: { filter: { type: "string" } },
        additionalProperties: false,
      },
    },
  },
  check_evidence: {
    type: "function",
    function: {
      name: "check_evidence",
      description: "Validate evidence artifacts for VALIDATING.",
      parameters: {
        type: "object",
        properties: { evidence_id: { type: "string" } },
        required: ["evidence_id"],
        additionalProperties: false,
      },
    },
  },
  poll_inbox: {
    type: "function",
    function: {
      name: "poll_inbox",
      description: "Poll agent inbox for completion messages.",
      parameters: {
        type: "object",
        properties: { task_id: { type: "string" } },
        additionalProperties: false,
      },
    },
  },
  read_agent_status: {
    type: "function",
    function: {
      name: "read_agent_status",
      description: "Read worker/agent status.",
      parameters: {
        type: "object",
        properties: { agent_id: { type: "string" } },
        required: ["agent_id"],
        additionalProperties: false,
      },
    },
  },
  cancel_agent: {
    type: "function",
    function: {
      name: "cancel_agent",
      description: "Cancel a running agent task.",
      parameters: {
        type: "object",
        properties: { agent_id: { type: "string" } },
        required: ["agent_id"],
        additionalProperties: false,
      },
    },
  },
  escalate_block: {
    type: "function",
    function: {
      name: "escalate_block",
      description: "Escalate BLOCKED task to recovery / human.",
      parameters: {
        type: "object",
        properties: { task_id: { type: "string" }, reason_code: { type: "string" } },
        required: ["task_id", "reason_code"],
        additionalProperties: false,
      },
    },
  },
  read_blocker: {
    type: "function",
    function: {
      name: "read_blocker",
      description: "Read structured blocker record.",
      parameters: {
        type: "object",
        properties: { task_id: { type: "string" } },
        required: ["task_id"],
        additionalProperties: false,
      },
    },
  },
  propose_recovery: {
    type: "function",
    function: {
      name: "propose_recovery",
      description: "Propose recovery transition from BLOCKED.",
      parameters: {
        type: "object",
        properties: { task_id: { type: "string" }, plan_id: { type: "string" } },
        required: ["task_id"],
        additionalProperties: false,
      },
    },
  },
  record_pass: {
    type: "function",
    function: {
      name: "record_pass",
      description: "Record TRUE-FULL-PASS evidence hash.",
      parameters: {
        type: "object",
        properties: { evidence_hash: { type: "string" } },
        required: ["evidence_hash"],
        additionalProperties: false,
      },
    },
  },
  boot_reconcile: {
    type: "function",
    function: {
      name: "boot_reconcile",
      description: "Reconcile worktree state on INIT.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  read_runtime_status: {
    type: "function",
    function: {
      name: "read_runtime_status",
      description: "Read MSO runtime status on INIT.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
};

/** Max tools injected per MSO state (V1-TOK-07). */
export const LAZY_TOOLS_MAX = 4;

/**
 * Official per-state tool allowlists — only relevant tools, ≤4 each.
 * ANALYZING: symbol/read only. DELEGATING: edit + test.
 */
export const MSO_STATE_TOOL_NAMES: Readonly<Record<MsoState, readonly string[]>> = {
  INIT: ["boot_reconcile", "read_runtime_status"],
  LOADING_GOALS: ["load_goal_document", "list_goals", "validate_goal"],
  ANALYZING: ["outline_file", "read_lines", "resolve_definition", "resolve_references"],
  DECOMPOSING: ["outline_file", "read_lines", "resolve_definition", "encode_task_node"],
  DELEGATING: ["surgical_edit", "run_tests", "outline_file", "read_lines"],
  WAITING_AGENTS: ["poll_inbox", "read_agent_status", "cancel_agent"],
  VALIDATING: ["run_tests", "check_evidence", "outline_file", "read_lines"],
  BLOCKED: ["escalate_block", "read_blocker", "propose_recovery"],
  RECOVERING: ["surgical_edit", "run_tests", "outline_file", "read_lines"],
  "TRUE-FULL-PASS": ["record_pass"],
};

function pickTools(names: readonly string[]): LazyToolSchema[] {
  const out: LazyToolSchema[] = [];
  for (const name of names) {
    const tool = TOOL_CATALOG[name];
    if (!tool) {
      throw new Error(`unknown lazy tool: ${name}`);
    }
    out.push(tool);
  }
  return out;
}

/**
 * Select the tool schema subset for the current MSO state (≤4 tools).
 */
export function selectToolsForMsoState(state: MsoState | string): LazyToolSchema[] {
  if (!isMsoState(state)) {
    throw new Error(`invalid MSO state for lazy tools: ${state}`);
  }
  const names = MSO_STATE_TOOL_NAMES[state];
  if (names.length > LAZY_TOOLS_MAX) {
    throw new Error(`MSO state ${state} tool list exceeds LAZY_TOOLS_MAX=${LAZY_TOOLS_MAX}`);
  }
  return pickTools(names);
}

/** Tool names only (for tests / logging). */
export function selectToolNamesForMsoState(state: MsoState | string): string[] {
  return selectToolsForMsoState(state).map((t) => t.function.name);
}

/** Full catalog names (tests / diagnostics — never inject wholesale to agents). */
export function listLazyToolCatalogNames(): string[] {
  return Object.keys(TOOL_CATALOG);
}

/** Official MSO states covered by lazy tool selection. */
export function lazyToolCoveredStates(): readonly MsoState[] {
  return MSO_STATES;
}
