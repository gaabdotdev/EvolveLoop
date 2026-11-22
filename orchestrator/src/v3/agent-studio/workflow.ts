/**
 * V5-M09 — Canonical workflow model (ONE model: nodes, edges, approvals).
 * YAML load — no separate visual engine.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  AGENT_STUDIO_SCHEMA_VERSION,
  type WorkflowEdge,
  type WorkflowModel,
  type WorkflowNode,
  type WorkflowNodeType,
} from "./schema.js";
import { AgentStudioError, stripSecrets } from "./config-io.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

const NODE_TYPES = new Set<WorkflowNodeType>([
  "task",
  "approval",
  "gate",
  "start",
  "end",
]);

export function parseWorkflowModel(raw: unknown): WorkflowModel {
  if (!isPlainObject(raw)) {
    throw new AgentStudioError("INVALID", "WorkflowModel must be an object");
  }
  const { cleaned } = stripSecrets(raw);
  const o = cleaned as Record<string, unknown>;
  const name = String(o.name ?? "").trim();
  if (!name) throw new AgentStudioError("INVALID", "workflow name required");

  const nodesRaw = o.nodes;
  if (!Array.isArray(nodesRaw) || nodesRaw.length === 0) {
    throw new AgentStudioError("INVALID", "nodes[] required");
  }
  const nodes: WorkflowNode[] = nodesRaw.map((n, i) => {
    if (!isPlainObject(n)) {
      throw new AgentStudioError("INVALID", `nodes[${i}] must be object`);
    }
    const id = String(n.id ?? "").trim();
    const type = String(n.type ?? "").trim() as WorkflowNodeType;
    if (!id) throw new AgentStudioError("INVALID", `nodes[${i}].id required`);
    if (!NODE_TYPES.has(type)) {
      throw new AgentStudioError(
        "INVALID",
        `nodes[${i}].type invalid: ${type}`,
      );
    }
    return {
      id,
      type,
      label: typeof n.label === "string" ? n.label : undefined,
      agent: typeof n.agent === "string" ? n.agent : undefined,
      approval: typeof n.approval === "string" ? n.approval : undefined,
    };
  });

  const edgesRaw = o.edges;
  if (!Array.isArray(edgesRaw)) {
    throw new AgentStudioError("INVALID", "edges[] required");
  }
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: WorkflowEdge[] = edgesRaw.map((e, i) => {
    if (!isPlainObject(e)) {
      throw new AgentStudioError("INVALID", `edges[${i}] must be object`);
    }
    const from = String(e.from ?? "").trim();
    const to = String(e.to ?? "").trim();
    if (!from || !to) {
      throw new AgentStudioError("INVALID", `edges[${i}] needs from/to`);
    }
    if (!nodeIds.has(from) || !nodeIds.has(to)) {
      throw new AgentStudioError(
        "INVALID",
        `edges[${i}] references unknown node`,
      );
    }
    return {
      from,
      to,
      label: typeof e.label === "string" ? e.label : undefined,
    };
  });

  const approvalsRaw = o.approvals;
  const approvals = Array.isArray(approvalsRaw)
    ? approvalsRaw.map((a, i) => {
        if (!isPlainObject(a)) {
          throw new AgentStudioError("INVALID", `approvals[${i}] must be object`);
        }
        const id = String(a.id ?? "").trim();
        if (!id) {
          throw new AgentStudioError("INVALID", `approvals[${i}].id required`);
        }
        return {
          id,
          required: a.required !== false,
          description:
            typeof a.description === "string" ? a.description : undefined,
        };
      })
    : [];

  return {
    kind: "WorkflowModel",
    schema_version: String(o.schema_version ?? AGENT_STUDIO_SCHEMA_VERSION),
    name,
    nodes,
    edges,
    approvals,
    notes: Array.isArray(o.notes) ? o.notes.map(String) : undefined,
  };
}

export function loadWorkflowYaml(filePath: string): WorkflowModel {
  const path = resolve(filePath);
  if (!existsSync(path)) throw new AgentStudioError("NOT_FOUND", path);
  const text = readFileSync(path, "utf-8");
  const ext = extname(path).toLowerCase();
  const raw =
    ext === ".json" ? JSON.parse(text) : parseYaml(text);
  return parseWorkflowModel(raw);
}

export function saveWorkflow(
  filePath: string,
  workflow: WorkflowModel,
): string {
  const path = resolve(filePath);
  mkdirSync(dirname(path), { recursive: true });
  const { cleaned } = stripSecrets(workflow);
  const body =
    extname(path).toLowerCase() === ".json"
      ? JSON.stringify(cleaned, null, 2) + "\n"
      : stringifyYaml(cleaned);
  writeFileSync(path, body, { encoding: "utf-8", mode: 0o600 });
  return path;
}

export function workflowPath(studioDir: string, name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return join(studioDir, "workflows", `${safe}.yaml`);
}
