/**
 * Fail-closed deterministic router over Model Catalog + Adapter drivers.
 * Optional decision model only after hard constraints + explicit enable.
 */

import { ModelCatalogStore } from "../model-catalog/store.js";
import { listAdapterDrivers } from "../adapters/drivers/registry.js";
import { listAdapterContracts } from "../adapters/catalog.js";
import type { V3DataPaths } from "../paths.js";
import type { RouteCandidate, RouteDecision, RouteRequest } from "./types.js";
import { applyDecisionToRoute, invokeDecisionModel } from "./decision-model.js";
import { invokeOpenRouterJev } from "./openrouter-jev.js";

function nowIso(): string {
  return new Date().toISOString();
}

const LIMITATIONS = [
  "Hard constraints applied before any decision model",
  "Scores are heuristic ranks, not measured quality/latency",
  "use_decision_model requires explicit enable and a live Jev-style endpoint",
];

export async function routeResources(
  paths: V3DataPaths,
  request: RouteRequest,
): Promise<RouteDecision> {
  const preferLocal = request.prefer_local !== false;
  const requireInvoke = request.require_invokable_adapter === true;
  const models = new ModelCatalogStore(paths.modelCatalogDir);
  let catalog = models.load();
  if (catalog.models.length === 0) catalog = models.seed();

  const candidates: RouteCandidate[] = [];
  const rejected: RouteDecision["rejected"] = [];

  for (const m of catalog.models) {
    if (!m.enabled) {
      rejected.push({ id: m.model_id, reason: "model_disabled" });
      continue;
    }
    if (preferLocal && m.locality === "remote") {
      rejected.push({ id: m.model_id, reason: "prefer_local_excludes_remote" });
      continue;
    }
    if (request.role_hint && !m.role_hints.includes(request.role_hint) && !m.role_hints.includes("general")) {
      rejected.push({ id: m.model_id, reason: `role_hint_mismatch:${request.role_hint}` });
      continue;
    }
    let score = 10;
    if (m.locality === "local") score += 5;
    if (request.role_hint && m.role_hints.includes(request.role_hint)) score += 3;
    if (m.role_hints.includes("embedding") && request.role_hint !== "embedding") score -= 4;
    candidates.push({
      kind: "model",
      id: m.model_id,
      score,
      reasons: [`backend=${m.backend}`, `locality=${m.locality}`, `enabled`],
      locality: m.locality,
    });
  }

  for (const driver of listAdapterDrivers()) {
    const contract = listAdapterContracts().find((c) => c.adapter_id === driver.adapter_id)!;
    if (requireInvoke && !driver.can_invoke) {
      rejected.push({ id: driver.adapter_id, reason: "adapter_cannot_invoke" });
      continue;
    }
    let score = driver.can_invoke ? 12 : 2;
    if (contract.execution_bridge === "jobs_pickup") score += 4;
    candidates.push({
      kind: "adapter",
      id: driver.adapter_id,
      score,
      reasons: [
        `can_invoke=${driver.can_invoke}`,
        `execution_bridge=${contract.execution_bridge}`,
      ],
      adapter_id: driver.adapter_id,
      can_invoke: driver.can_invoke,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates[0];
  const base: RouteDecision = {
    kind: "RouteDecision",
    work_id: request.work_id,
    generated_at: nowIso(),
    status: selected ? "selected" : "no_candidate",
    selected,
    candidates,
    rejected,
    limitations: [...LIMITATIONS],
  };

  if (!request.use_decision_model) {
    return base;
  }

  if (candidates.length === 0) {
    return {
      ...base,
      status: "decision_model_unavailable",
      selected: undefined,
      rejected: [...rejected, { id: "jev-style", reason: "no_candidates_after_hard_constraints" }],
    };
  }

  const taskSummary = `route work=${request.work_id} task=${request.task_id ?? ""} role_hint=${request.role_hint ?? ""}`;
  if (request.decision_backend === "openrouter") {
    const decision = await invokeOpenRouterJev(
      { work_id: request.work_id, task_summary: taskSummary, candidates },
      { consent: request.remote_consent === true },
    );
    return applyDecisionToRoute(base, decision);
  }

  const decision = await invokeDecisionModel({
    work_id: request.work_id,
    task_summary: taskSummary,
    candidates,
    explicit_enable: true,
  });
  return applyDecisionToRoute(base, decision);
}

/** Sync helper for tests that only need deterministic path. */
export function routeResourcesDeterministic(
  paths: V3DataPaths,
  request: Omit<RouteRequest, "use_decision_model">,
): RouteDecision {
  // inline sync path without decision model
  const preferLocal = request.prefer_local !== false;
  const requireInvoke = request.require_invokable_adapter === true;
  const models = new ModelCatalogStore(paths.modelCatalogDir);
  let catalog = models.load();
  if (catalog.models.length === 0) catalog = models.seed();
  const candidates: RouteCandidate[] = [];
  const rejected: RouteDecision["rejected"] = [];
  for (const m of catalog.models) {
    if (!m.enabled) {
      rejected.push({ id: m.model_id, reason: "model_disabled" });
      continue;
    }
    if (preferLocal && m.locality === "remote") {
      rejected.push({ id: m.model_id, reason: "prefer_local_excludes_remote" });
      continue;
    }
    candidates.push({
      kind: "model",
      id: m.model_id,
      score: m.locality === "local" ? 15 : 5,
      reasons: [`backend=${m.backend}`],
      locality: m.locality,
    });
  }
  for (const driver of listAdapterDrivers()) {
    if (requireInvoke && !driver.can_invoke) {
      rejected.push({ id: driver.adapter_id, reason: "adapter_cannot_invoke" });
      continue;
    }
    candidates.push({
      kind: "adapter",
      id: driver.adapter_id,
      score: driver.can_invoke ? 16 : 2,
      reasons: [`can_invoke=${driver.can_invoke}`],
      adapter_id: driver.adapter_id,
      can_invoke: driver.can_invoke,
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  return {
    kind: "RouteDecision",
    work_id: request.work_id,
    generated_at: nowIso(),
    status: candidates[0] ? "selected" : "no_candidate",
    selected: candidates[0],
    candidates,
    rejected,
    limitations: [...LIMITATIONS],
  };
}
