/**
 * Hierarchical Global Resource Manager — Host→Project→Workflow→Task→Agent.
 * No double-counting: child consumption rolls up once to parent.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteJson, nowIso } from "./atomic.js";
import type { OpsDataPaths } from "./paths.js";
import type {
  HostCapacity,
  ProvenanceKind,
  ReservationState,
  ResourceReservation,
  ResourceScopeKind,
  ResourceType,
} from "./types.js";

export const DEFAULT_HOST_CAPACITY: HostCapacity = {
  cpu: 4,
  memory_mb: 8192,
  processes: 128,
  disk_mb: 10240,
  workflows: 8,
  agents: 16,
  harness_sessions: 4,
  provider_requests: 8,
};

export class GlobalResourceManager {
  private capacity: HostCapacity;

  constructor(
    private readonly paths: OpsDataPaths,
    capacity?: Partial<HostCapacity>,
  ) {
    mkdirSync(paths.reservationsDir, { recursive: true });
    this.capacity = { ...DEFAULT_HOST_CAPACITY, ...capacity };
  }

  setCapacity(capacity: Partial<HostCapacity>): void {
    this.capacity = { ...this.capacity, ...capacity };
  }

  getCapacity(): HostCapacity {
    return { ...this.capacity };
  }

  private pathFor(id: string): string {
    return join(this.paths.reservationsDir, `${id}.json`);
  }

  list(filter?: {
    scope?: ResourceScopeKind;
    scope_id?: string;
    state?: ReservationState;
    resource_type?: ResourceType;
  }): ResourceReservation[] {
    let items = readdirSync(this.paths.reservationsDir)
      .filter((f) => f.endsWith(".json"))
      .map(
        (f) =>
          JSON.parse(
            readFileSync(join(this.paths.reservationsDir, f), "utf-8"),
          ) as ResourceReservation,
      );
    if (filter?.scope) items = items.filter((r) => r.scope === filter.scope);
    if (filter?.scope_id) items = items.filter((r) => r.scope_id === filter.scope_id);
    if (filter?.state) items = items.filter((r) => r.state === filter.state);
    if (filter?.resource_type) items = items.filter((r) => r.resource_type === filter.resource_type);
    return items;
  }

  get(id: string): ResourceReservation | undefined {
    const p = this.pathFor(id);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf-8")) as ResourceReservation;
  }

  /** Expire leases that passed expiry (no process reconciliation here). */
  expireLeases(now = Date.now()): ResourceReservation[] {
    const expired: ResourceReservation[] = [];
    for (const r of this.list({ state: "HELD" })) {
      if (Date.parse(r.lease_expires_at) <= now) {
        const next: ResourceReservation = {
          ...r,
          state: "EXPIRED",
          updated_at: nowIso(),
        };
        atomicWriteJson(this.pathFor(r.reservation_id), next);
        expired.push(next);
      }
    }
    return expired;
  }

  /**
   * Held usage for a resource type at host level.
   * Child scopes contribute once via top-level held reservations only
   * (we store leaf reservations; rollup counts unique reservation rows, not nested sum).
   */
  heldUsage(resourceType: ResourceType, scope?: { kind: ResourceScopeKind; id: string }): number {
    this.expireLeases();
    let items = this.list({ state: "HELD", resource_type: resourceType });
    if (scope) {
      items = items.filter((r) => r.scope === scope.kind && r.scope_id === scope.id);
    } else {
      // Host rollup: count reservations whose scope is workflow/project/agent (each once)
      // Avoid double count by counting only reservations without parent_reservation_id
      // OR counting host-scoped only. Spec: consumption descends without double counting.
      items = items.filter((r) => !r.parent_reservation_id);
    }
    return items.reduce((sum, r) => sum + r.quantity, 0);
  }

  available(resourceType: ResourceType): number {
    const capKey = resourceType as keyof HostCapacity;
    const cap = this.capacity[capKey];
    if (typeof cap !== "number") return 0;
    return Math.max(0, cap - this.heldUsage(resourceType));
  }

  reserve(input: {
    resource_type: ResourceType;
    quantity: number;
    unit: string;
    owner: string;
    scope: ResourceScopeKind;
    scope_id: string;
    lease_ms?: number;
    provenance?: ProvenanceKind;
    release_policy?: ResourceReservation["release_policy"];
    parent_reservation_id?: string;
    /** Refuse estimated tokens/cost as if measured */
    allow_estimated?: boolean;
  }): ResourceReservation {
    if (
      (input.resource_type === "tokens" || input.resource_type === "cost_usd") &&
      (input.provenance === "unavailable" ||
        (!input.allow_estimated && input.provenance === "estimated"))
    ) {
      throw new Error(`RESOURCE_USAGE_UNAVAILABLE:${input.resource_type}`);
    }

    this.expireLeases();
    const avail = this.available(input.resource_type);
    // Project-scoped check still counts against host pool for host-limited types
    if (input.quantity > avail && input.scope !== "task") {
      throw new Error(
        `RESOURCE_INSUFFICIENT:${input.resource_type}:need=${input.quantity}:avail=${avail}`,
      );
    }

    const ts = nowIso();
    const reservation_id = `res-${randomUUID()}`;
    const rec: ResourceReservation = {
      kind: "ResourceReservation",
      reservation_id,
      resource_type: input.resource_type,
      quantity: input.quantity,
      unit: input.unit,
      owner: input.owner,
      scope: input.scope,
      scope_id: input.scope_id,
      lease_expires_at: new Date(Date.now() + (input.lease_ms ?? 600_000)).toISOString(),
      state: "HELD",
      provenance: input.provenance ?? "policy_limit",
      release_policy: input.release_policy ?? "on_terminal",
      created_at: ts,
      updated_at: ts,
      parent_reservation_id: input.parent_reservation_id,
    };
    atomicWriteJson(this.pathFor(reservation_id), rec);
    return rec;
  }

  renew(reservationId: string, leaseMs: number): ResourceReservation {
    const rec = this.get(reservationId);
    if (!rec) throw new Error(`RESERVATION_NOT_FOUND:${reservationId}`);
    if (rec.state !== "HELD") throw new Error(`RESERVATION_NOT_HELD:${reservationId}`);
    const next: ResourceReservation = {
      ...rec,
      lease_expires_at: new Date(Date.now() + leaseMs).toISOString(),
      updated_at: nowIso(),
    };
    atomicWriteJson(this.pathFor(reservationId), next);
    return next;
  }

  release(reservationId: string, opts?: { force?: boolean; activeProcess?: boolean }): ResourceReservation {
    const rec = this.get(reservationId);
    if (!rec) throw new Error(`RESERVATION_NOT_FOUND:${reservationId}`);
    if (rec.state === "RELEASED") return rec;
    if (opts?.activeProcess && !opts.force) {
      throw new Error(`RESERVATION_ACTIVE_PROCESS:${reservationId}`);
    }
    const next: ResourceReservation = {
      ...rec,
      state: "RELEASED",
      updated_at: nowIso(),
    };
    atomicWriteJson(this.pathFor(reservationId), next);
    return next;
  }

  status(): Record<string, unknown> {
    this.expireLeases();
    const types: ResourceType[] = [
      "cpu",
      "memory_mb",
      "processes",
      "disk_mb",
      "workflows",
      "agents",
      "harness_sessions",
      "provider_requests",
    ];
    const usage: Record<string, { capacity: number; held: number; available: number }> = {};
    for (const t of types) {
      const capacity = this.capacity[t as keyof HostCapacity] ?? 0;
      const held = this.heldUsage(t);
      usage[t] = { capacity, held, available: Math.max(0, capacity - held) };
    }
    return {
      capacity: this.capacity,
      usage,
      held_reservations: this.list({ state: "HELD" }).length,
      note: "tokens/cost omitted unless provenance measured",
    };
  }

  reconcile(activeOwners: Set<string>): { released: string[]; kept: string[] } {
    const released: string[] = [];
    const kept: string[] = [];
    for (const r of this.list({ state: "HELD" })) {
      if (!activeOwners.has(r.owner) && Date.parse(r.lease_expires_at) <= Date.now()) {
        this.release(r.reservation_id);
        released.push(r.reservation_id);
      } else {
        kept.push(r.reservation_id);
      }
    }
    return { released, kept };
  }
}
