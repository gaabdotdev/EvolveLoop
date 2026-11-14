/**
 * Logical Worker Pools — dynamic membership by selectors.
 */

import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteJson, nowIso } from "../../ops/atomic.js";
import type { FabricDataPaths } from "../paths.js";
import type { WorkerNodeRecord, WorkerPool } from "../types.js";

export class PoolRegistry {
  constructor(private readonly paths: FabricDataPaths) {}

  private path(id: string): string {
    return join(this.paths.poolsDir, `${id}.json`);
  }

  get(poolId: string): WorkerPool | undefined {
    const p = this.path(poolId);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf8")) as WorkerPool;
  }

  list(): WorkerPool[] {
    return readdirSync(this.paths.poolsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.paths.poolsDir, f), "utf8")) as WorkerPool);
  }

  create(input: Omit<WorkerPool, "kind" | "pool_id" | "member_worker_node_ids" | "created_at" | "updated_at"> & {
    pool_id?: string;
  }): WorkerPool {
    const pool: WorkerPool = {
      kind: "WorkerPool",
      pool_id: input.pool_id ?? `pool_${randomUUID()}`,
      name: input.name,
      selectors: input.selectors,
      constraints: input.constraints,
      max_concurrency: input.max_concurrency,
      budget: input.budget,
      priority: input.priority,
      draining: input.draining ?? false,
      member_worker_node_ids: [],
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    atomicWriteJson(this.path(pool.pool_id), pool);
    return pool;
  }

  update(poolId: string, patch: Partial<WorkerPool>): WorkerPool {
    const pool = this.get(poolId);
    if (!pool) throw new Error("pool_not_found");
    Object.assign(pool, patch, { pool_id: pool.pool_id, kind: "WorkerPool", updated_at: nowIso() });
    atomicWriteJson(this.path(poolId), pool);
    return pool;
  }

  delete(poolId: string): void {
    const p = this.path(poolId);
    if (existsSync(p)) unlinkSync(p);
  }

  matches(node: WorkerNodeRecord, pool: WorkerPool): boolean {
    const s = pool.selectors;
    if (s.fleets?.length && !s.fleets.includes(node.fleet)) return false;
    if (s.statuses?.length && !s.statuses.includes(node.status)) return false;
    const caps = new Set([
      ...node.capabilities.harnesses,
      ...node.capabilities.sandbox_backends,
      ...node.capabilities.toolchains,
      ...Object.entries(node.capabilities.probes)
        .filter(([, v]) => v.ok)
        .map(([k]) => k),
    ]);
    if (s.capabilities_all) {
      for (const c of s.capabilities_all) if (!caps.has(c)) return false;
    }
    if (s.capabilities_any?.length) {
      if (!s.capabilities_any.some((c) => caps.has(c))) return false;
    }
    return node.trust === "trusted" && node.status !== "REVOKED" && node.status !== "QUARANTINED";
  }

  reconcileMembership(nodes: WorkerNodeRecord[]): WorkerPool[] {
    const out: WorkerPool[] = [];
    for (const pool of this.list()) {
      pool.member_worker_node_ids = nodes.filter((n) => this.matches(n, pool)).map((n) => n.identity.worker_node_id);
      pool.updated_at = nowIso();
      atomicWriteJson(this.path(pool.pool_id), pool);
      out.push(pool);
    }
    return out;
  }
}
