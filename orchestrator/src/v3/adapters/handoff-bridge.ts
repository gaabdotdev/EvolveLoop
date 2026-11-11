/**
 * Cross-provider handoff bridge — Continuity package + optional Core-owned apply
 * that rebinds substitute provider_id and dry-runs/spawns target adapter.
 */

import { ContinuityEngine } from "../continuity/engine.js";
import type { V3DataPaths } from "../paths.js";
import { WorkLedgerStore } from "../work-ledger/store.js";
import { AgentRegistryStore } from "../agent-registry/store.js";
import { WorkLockStore } from "../locks/store.js";
import { getAdapterContract, isAdapterId } from "./catalog.js";
import type { AdapterId, CrossProviderHandoffEnvelope } from "./types.js";
import { getAdapterDriver } from "./drivers/registry.js";
import type { AdapterInvokeResult } from "./drivers/types.js";
import type { HandoffPackage } from "../continuity/types.js";

export class AdapterHandoffError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdapterHandoffError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function inferAdapterFromProvider(providerId?: string): AdapterId | "unknown" {
  if (!providerId) return "unknown";
  if (providerId === "cursor-skill" || providerId === "cursor") return "cursor";
  if (providerId === "claude-code" || providerId === "claude") return "claude-code";
  if (providerId === "codex") return "codex";
  if (providerId === "antigravity") return "antigravity";
  return "unknown";
}

export class AdapterHandoffBridge {
  private readonly continuity: ContinuityEngine;
  private readonly ledger: WorkLedgerStore;
  private readonly agents: AgentRegistryStore;
  private readonly locks: WorkLockStore;
  private readonly paths: V3DataPaths;

  constructor(paths: V3DataPaths) {
    this.paths = paths;
    this.continuity = new ContinuityEngine(paths);
    this.ledger = new WorkLedgerStore(paths.workLedgerDir);
    this.agents = new AgentRegistryStore(paths.agentsDir);
    this.locks = new WorkLockStore(paths.locksDir);
  }

  buildEnvelope(handoffId: string, toAdapter: string): CrossProviderHandoffEnvelope {
    if (!isAdapterId(toAdapter)) {
      throw new AdapterHandoffError("UNKNOWN_ADAPTER", toAdapter);
    }
    const pkg = this.continuity.load(handoffId);
    const target = getAdapterContract(toAdapter);
    const fromAgent = this.agents.load(pkg.work_id).agents.find((a) => a.agent_id === pkg.from_agent_id);
    const fromAdapter = inferAdapterFromProvider(fromAgent?.provider_id);
    const driver = getAdapterDriver(toAdapter);

    const envelope: CrossProviderHandoffEnvelope = {
      kind: "CrossProviderHandoffEnvelope",
      handoff_id: pkg.handoff_id,
      work_id: pkg.work_id,
      task_id: pkg.task_id,
      from_adapter: fromAdapter,
      to_adapter: toAdapter,
      package_ref: pkg.handoff_id,
      next_action: pkg.verified_progress.next_action,
      auto_swap: false,
      adapter_limitations: [
        ...target.limitations,
        driver.can_invoke
          ? "target driver can_invoke — applyCrossProvider may dry-run/spawn"
          : "target driver cannot invoke; apply still rebinds Core registry ownership",
        "auto_swap=false on envelope build; set true only after applyCrossProvider succeeds",
      ],
      created_at: nowIso(),
    };

    this.ledger.append({
      work_id: pkg.work_id,
      type: "handoff_recorded",
      origin: "adapter-handoff-bridge",
      task_id: pkg.task_id,
      agent_id: pkg.from_agent_id,
      goal_contract_id: pkg.goal_contract_id,
      payload: {
        envelope_kind: envelope.kind,
        handoff_id: handoffId,
        from_adapter: fromAdapter,
        to_adapter: toAdapter,
        auto_swap: false,
      },
      provenance: { source: "adapter-handoff-bridge", refs: [handoffId] },
    });

    return envelope;
  }

  async applyCrossProvider(input: {
    handoff_id: string;
    to_adapter: string;
    provider_mode?: "mock" | "real";
    invoke_target?: boolean;
  }): Promise<{
    envelope: CrossProviderHandoffEnvelope;
    package: HandoffPackage;
    invoke?: AdapterInvokeResult;
  }> {
    if (!isAdapterId(input.to_adapter)) {
      throw new AdapterHandoffError("UNKNOWN_ADAPTER", input.to_adapter);
    }

    let pkg = this.continuity.load(input.handoff_id);
    if (pkg.status === "pending") {
      pkg = this.continuity.applyHandoff(input.handoff_id);
    }
    if (pkg.status !== "applied" || !pkg.to_agent_id) {
      throw new AdapterHandoffError("HANDOFF_NOT_APPLIED", pkg.status);
    }

    // Ownership reconciliation: release locks held by replaced agent; substitute gets a fresh fence.
    const lockSnap = this.locks.load(pkg.work_id);
    for (const lock of lockSnap.locks) {
      if (lock.status === "held" && lock.holder_agent_id === pkg.from_agent_id) {
        this.locks.release(pkg.work_id, lock.lock_id, pkg.from_agent_id);
      }
    }
    const fence = this.locks.acquire({
      work_id: pkg.work_id,
      holder_agent_id: pkg.to_agent_id,
      scope: "task",
      resource_key: pkg.task_id,
      lease_ms: 120_000,
    });
    if (fence.status === "conflict") {
      throw new AdapterHandoffError(
        "LOCK_CONFLICT",
        `cannot transfer ownership fence for task ${pkg.task_id}: ${fence.reason}`,
      );
    }

    // Replaced agent must remain terminal — refuse if somehow still ACTIVE
    const fromAfter = this.agents.load(pkg.work_id).agents.find((a) => a.agent_id === pkg.from_agent_id);
    if (fromAfter && !["REPLACED", "CANCELLED", "COMPLETED", "FAILED", "LIMIT_REACHED"].includes(fromAfter.state)) {
      throw new AdapterHandoffError("SOURCE_STILL_ACTIVE", fromAfter.state);
    }

    this.agents.setProviderId(pkg.work_id, pkg.to_agent_id, input.to_adapter);

    let invoke: AdapterInvokeResult | undefined;
    if (input.invoke_target !== false) {
      const driver = getAdapterDriver(input.to_adapter);
      invoke = await driver.invoke(this.paths, {
        work_id: pkg.work_id,
        task_id: pkg.task_id,
        agent_id: pkg.to_agent_id,
        provider_mode: input.provider_mode ?? "mock",
        note: `Cross-provider handoff ${pkg.handoff_id}: ${pkg.verified_progress.next_action}`,
      });
    }

    const fromAgent = this.agents
      .load(pkg.work_id)
      .agents.find((a) => a.agent_id === pkg.from_agent_id);
    const envelope: CrossProviderHandoffEnvelope = {
      kind: "CrossProviderHandoffEnvelope",
      handoff_id: pkg.handoff_id,
      work_id: pkg.work_id,
      task_id: pkg.task_id,
      from_adapter: inferAdapterFromProvider(fromAgent?.provider_id),
      to_adapter: input.to_adapter,
      package_ref: pkg.handoff_id,
      next_action: pkg.verified_progress.next_action,
      auto_swap: true,
      to_agent_id: pkg.to_agent_id,
      invoke_status: invoke?.status,
      adapter_limitations: [
        ...getAdapterContract(input.to_adapter).limitations,
        "auto_swap=true means Core registry+task ownership transferred; harness process may be dry-run only",
      ],
      created_at: nowIso(),
    };

    this.ledger.append({
      work_id: pkg.work_id,
      type: "handoff_recorded",
      origin: "adapter-handoff-bridge.apply",
      task_id: pkg.task_id,
      agent_id: pkg.to_agent_id,
      goal_contract_id: pkg.goal_contract_id,
      payload: {
        handoff_id: pkg.handoff_id,
        to_adapter: input.to_adapter,
        auto_swap: true,
        invoke_status: invoke?.status ?? "skipped",
      },
      provenance: { source: "adapter-handoff-bridge", refs: [pkg.handoff_id] },
    });

    return { envelope, package: pkg, invoke };
  }
}
