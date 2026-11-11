/**
 * Bridge TaskGraph implement tasks → ExecutionEngine with explicit provider mode.
 * Enforces PLAN_APPROVED / canStartTask before dispatch.
 */

import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ExecutionEngine } from "../../engine/execution-engine.js";
import {
  buildRegistryFromManifestFiles,
  loadYamlFile,
} from "../../registry/manifest-loader.js";
import type { CapabilityIR, ProviderManifest } from "../../types/index.js";
import { setupProviders, type ProviderMode } from "../../cli/provider-bootstrap.js";
import { TaskGraphStore } from "../task-graph/store.js";
import { canStartTask } from "../task-graph/types.js";
import { CoordinationEventLog } from "../event-log/store.js";
import { WorkLedgerStore } from "../work-ledger/store.js";
import type { V3DataPaths } from "../paths.js";
import { resolveDataPaths } from "../../persistence/paths.js";

export class ExecutionBridgeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "ExecutionBridgeError";
  }
}

export interface DispatchImplementTaskInput {
  work_id: string;
  task_id: string;
  ir_path: string;
  provider_mode: ProviderMode;
  /** Defaults to repo root (parent of orchestrator/). */
  agents_root?: string;
  policy_id?: string;
  /** When provider_mode=real and cursor-skill providers appear, jobs dir is required. */
  jobs_dir?: string;
}

export interface DispatchImplementTaskResult {
  work_id: string;
  task_id: string;
  feature_id: string;
  provider_mode: ProviderMode;
  success: boolean;
  finished: boolean;
  state: string;
  run_id?: string;
  blocked_reason?: string;
  evidence_count: number;
}

function loadProviderManifests(providersDir: string): ProviderManifest[] {
  const manifests: ProviderManifest[] = [];
  for (const ent of readdirSync(providersDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    try {
      manifests.push(loadYamlFile<ProviderManifest>(join(providersDir, ent.name, "provider.yaml")));
    } catch {
      /* skip */
    }
  }
  return manifests;
}

function defaultOrchestratorRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export async function dispatchImplementTask(
  paths: V3DataPaths,
  input: DispatchImplementTaskInput,
): Promise<DispatchImplementTaskResult> {
  const tasks = new TaskGraphStore(paths.taskGraphsDir);
  const events = new CoordinationEventLog(paths.eventLogDir);
  const ledger = new WorkLedgerStore(paths.workLedgerDir);
  const graph = tasks.load(input.work_id);
  const task = graph.tasks.find((t) => t.task_id === input.task_id);
  if (!task) throw new ExecutionBridgeError("TASK_NOT_FOUND", input.task_id);

  const byId = new Map(graph.tasks.map((t) => [t.task_id, t]));
  if (!canStartTask(task, byId) && task.state === "PENDING") {
    throw new ExecutionBridgeError(
      "TASK_NOT_READY",
      `task ${input.task_id} cannot start (missing PLAN_APPROVED or unmet deps)`,
    );
  }
  if (task.state === "TRUE_PASS" || task.state === "CANCELLED") {
    throw new ExecutionBridgeError("TASK_TERMINAL", task.state);
  }

  tasks.setTaskState(input.work_id, input.task_id, "IN_PROGRESS");

  const orchestratorRoot = defaultOrchestratorRoot();
  const agentsRoot = input.agents_root ? resolve(input.agents_root) : resolve(orchestratorRoot, "..");
  const providersDir = join(orchestratorRoot, "providers");
  const manifests = loadProviderManifests(providersDir);
  const ir = loadYamlFile<CapabilityIR>(resolve(input.ir_path));
  const featureId = `${input.work_id}__${input.task_id}`;

  const fullRegistry = buildRegistryFromManifestFiles(manifests);
  // Narrow registry to IR capabilities only — avoids loading unrelated cursor-skill providers.
  const irCaps = new Set(ir.spec.nodes.map((n) => n.capability));
  const caps: typeof fullRegistry.capabilities = {};
  for (const capId of irCaps) {
    if (fullRegistry.capabilities[capId]) {
      caps[capId] = fullRegistry.capabilities[capId]!;
    } else {
      caps[capId] = {
        providers: [
          {
            id: capId.includes(".") ? capId.split(".")[0]! : capId,
            priority: 100,
            cost: "low",
            quality_score: 0.9,
            availability: "active",
            version: "1.0.0",
          },
        ],
      };
    }
  }
  const registry = { ...fullRegistry, capabilities: caps };

  const providerIds = new Set<string>();
  for (const cap of Object.values(registry.capabilities)) {
    for (const p of cap.providers) providerIds.add(p.id);
  }

  const needsJobsDir = [...providerIds].some((id) => {
    const manifest = manifests.find((m) => m.metadata.name === id);
    return manifest?.spec.plugin?.type === "cursor-skill";
  });
  const jobsDir = needsJobsDir
    ? resolve(input.jobs_dir ?? paths.jobsDir)
    : input.jobs_dir
      ? resolve(input.jobs_dir)
      : undefined;

  if (input.provider_mode === "real" && needsJobsDir && !jobsDir) {
    throw new ExecutionBridgeError(
      "JOBS_DIR_REQUIRED",
      "real mode with cursor-skill providers requires --jobs-dir",
    );
  }

  const bootstrap = setupProviders({
    mode: input.provider_mode,
    agentsRoot,
    jobsDir,
    manifests,
    providerIds,
  });

  const dataPaths = resolveDataPaths(join(paths.root, "engine-data"));
  const engine = new ExecutionEngine({
    registry,
    providers: bootstrap.router,
    dataPaths,
    contractsDir: join(orchestratorRoot, "contracts"),
    policiesDir: join(orchestratorRoot, "policies"),
    agentsRoot: input.provider_mode === "real" || jobsDir ? agentsRoot : undefined,
    jobsDir,
  });

  events.append({
    work_id: input.work_id,
    type: "execution.dispatch",
    actor: task.owner_agent_id,
    payload: {
      task_id: input.task_id,
      feature_id: featureId,
      provider_mode: input.provider_mode,
      ir_path: input.ir_path,
    },
  });

  const result = await engine.run({
    ir,
    policy_id: input.policy_id ?? ir.metadata.policy_ref ?? "high-reliability",
    feature_id: featureId,
  });

  const runId = featureId;
  tasks.linkEngineRun(input.work_id, input.task_id, {
    feature_id: featureId,
    ir_id: ir.metadata.id,
    run_id: runId,
  });

  if (result.success && result.finished) {
    tasks.setTaskState(input.work_id, input.task_id, "TRUE_PASS");
  } else if (result.finished) {
    tasks.setTaskState(input.work_id, input.task_id, "FAILED");
  } else {
    tasks.setTaskState(input.work_id, input.task_id, "PARTIAL_PASS");
  }

  events.append({
    work_id: input.work_id,
    type: "execution.result",
    actor: "execution-bridge",
    payload: {
      task_id: input.task_id,
      success: result.success,
      finished: result.finished,
      state: result.state,
      provider_mode: input.provider_mode,
    },
  });

  ledger.append({
    work_id: input.work_id,
    type: "execution_recorded",
    origin: "execution-bridge",
    task_id: input.task_id,
    agent_id: task.owner_agent_id,
    goal_contract_id: graph.goal_contract_id,
    payload: {
      feature_id: featureId,
      provider_mode: input.provider_mode,
      success: result.success,
      finished: result.finished,
      state: String(result.state),
      run_id: runId,
      evidence_count: result.evidence.length,
    },
    provenance: { source: "execution-bridge", refs: [featureId] },
  });

  return {
    work_id: input.work_id,
    task_id: input.task_id,
    feature_id: featureId,
    provider_mode: input.provider_mode,
    success: result.success,
    finished: result.finished,
    state: String(result.state),
    run_id: runId,
    blocked_reason: result.blocked_reason,
    evidence_count: result.evidence.length,
  };
}
