/**
 * In-memory CapabilityProfile store (CapabilityProfilePort).
 *
 * Profiles are scoped by executor + context. Insertion order is preserved;
 * metric values never reorder results. ACTIVE is refused while methodology
 * is not ACCEPTED. Persistence beyond process memory is M19.
 */

import {
  CAPABILITY_PROFILE_SCHEMA_VERSION,
  DEFAULT_TENANT_ID,
  isValidId,
  type CapabilityProfile,
  type CapabilityProfilePort,
} from "../contracts/index.js";
import { CapabilityValidationError } from "./errors.js";
import { allocateProfileId } from "./ids.js";
import { estimateFromMeasurement } from "./ingest.js";
import { assertStoreableProfile } from "./invariants.js";
import { PUBLISHED_METHODOLOGY, methodologyAllowsActive } from "./methodology.js";
import type { AssembleProfileInput, Clock, MeasurementIngestInput, PutOptions } from "./types.js";

function contextKey(executor_id: string, ctx: CapabilityProfile["context"]): string {
  return `${executor_id}\u0000${ctx.work_category}\u0000${ctx.task_kind}\u0000${ctx.environment ?? ""}`;
}

function matchesContext(profile: CapabilityProfile, executor_id: string, context: CapabilityProfile["context"]): boolean {
  if (profile.subject.executor_id !== executor_id) return false;
  if (profile.context.work_category !== context.work_category) return false;
  if (profile.context.task_kind !== context.task_kind) return false;
  if (context.environment !== undefined && profile.context.environment !== context.environment) return false;
  return true;
}

function cloneProfile(profile: CapabilityProfile): CapabilityProfile {
  return structuredClone(profile);
}

export function assembleProfile(input: AssembleProfileInput): CapabilityProfile {
  const methodology = input.methodology ?? PUBLISHED_METHODOLOGY;
  if (methodology.status === "ACCEPTED" || methodologyAllowsActive(methodology)) {
    throw new CapabilityValidationError(
      "INV-CPROF-04",
      "this cut cannot stamp ACCEPTED methodology or ACTIVE profiles (M17 baselines absent)",
      "methodology.status",
    );
  }
  if (methodology.status !== "PLACEHOLDER" && methodology.status !== "PROVISIONAL") {
    throw new CapabilityValidationError("STRUCT", `methodology.status ${methodology.status} is not usable in this cut`, "methodology.status");
  }
  const profile_id = input.profile_id ?? allocateProfileId();
  if (!isValidId("capability_profile", profile_id)) {
    throw new CapabilityValidationError("STRUCT", `profile_id failed isValidId (${profile_id})`, "profile_id");
  }
  if (!isValidId("executor", input.subject.executor_id)) {
    throw new CapabilityValidationError("STRUCT", "subject.executor_id failed isValidId", "subject.executor_id");
  }
  const profile: CapabilityProfile = {
    kind: "CapabilityProfile",
    schema_version: CAPABILITY_PROFILE_SCHEMA_VERSION,
    tenant_id: DEFAULT_TENANT_ID,
    profile_id,
    subject: { executor_id: input.subject.executor_id, executor_version: input.subject.executor_version },
    context: {
      work_category: input.context.work_category,
      task_kind: input.context.task_kind,
      ...(input.context.environment !== undefined ? { environment: input.context.environment } : {}),
    },
    metrics: input.metrics.map((m) => ({ ...m, source_refs: [...m.source_refs] })),
    methodology: { id: methodology.id, version: methodology.version, status: methodology.status },
    status: input.status ?? "PROVISIONAL",
    computed_at: input.computed_at,
    valid_until: input.valid_until,
  };
  return assertStoreableProfile(profile);
}

export class CapabilityProfileStore implements CapabilityProfilePort {
  private readonly profiles = new Map<string, CapabilityProfile>();
  private readonly order: string[] = [];
  private readonly now: Clock;

  constructor(opts?: { now?: Clock }) {
    this.now = opts?.now ?? (() => new Date().toISOString());
  }

  /**
   * Persist a disclosed profile. OBSERVED metrics require control_plane attestation
   * (F10) — payload-asserted OBSERVED is not enough.
   */
  put(profile: CapabilityProfile, opts: PutOptions = {}): CapabilityProfile {
    const stored = assertStoreableProfile(profile);
    const hasObserved = stored.metrics.some((m) => m.provenance === "OBSERVED");
    if (hasObserved && opts.observed_attestation !== "control_plane") {
      throw new CapabilityValidationError(
        "F10_UNAUTHENTICATED_OBSERVED",
        "OBSERVED metrics require control_plane attestation at put (TM-V4-F10)",
        "metrics.provenance",
      );
    }
    const prev = this.profiles.get(stored.profile_id);
    this.profiles.set(stored.profile_id, cloneProfile(stored));
    if (!prev) this.order.push(stored.profile_id);
    return cloneProfile(stored);
  }

  get(profile_id: string): CapabilityProfile | undefined {
    const found = this.profiles.get(profile_id);
    return found ? this.effective(found) : undefined;
  }

  /**
   * CapabilityProfilePort. Returns insertion order, never sorted by metric values.
   * Expired profiles are disclosed as STALE copies; stored objects are not mutated.
   */
  async profilesFor(executor_id: string, context: CapabilityProfile["context"]): Promise<CapabilityProfile[]> {
    const out: CapabilityProfile[] = [];
    for (const id of this.order) {
      const profile = this.profiles.get(id);
      if (!profile) continue;
      if (!matchesContext(profile, executor_id, context)) continue;
      out.push(this.effective(profile));
    }
    return out;
  }

  ingestEstimate(input: MeasurementIngestInput): ReturnType<typeof estimateFromMeasurement> {
    return estimateFromMeasurement(input);
  }

  ingestAndPut(
    assemble: Omit<AssembleProfileInput, "metrics"> & { measurements: MeasurementIngestInput[] },
    opts: PutOptions = {},
  ): CapabilityProfile {
    const metrics = assemble.measurements.map((m) => estimateFromMeasurement(m));
    const channels = new Set(assemble.measurements.map((m) => m.channel));
    const attestation: PutOptions["observed_attestation"] =
      opts.observed_attestation ?? (channels.size === 1 && channels.has("control_plane") ? "control_plane" : undefined);
    const profile = assembleProfile({ ...assemble, metrics });
    return this.put(profile, { ...opts, observed_attestation: attestation });
  }

  /** Test/debug listing. Same insertion order; not a ranking. */
  listAll(): CapabilityProfile[] {
    return this.order.map((id) => this.effective(this.profiles.get(id)!));
  }

  private effective(profile: CapabilityProfile): CapabilityProfile {
    const copy = cloneProfile(profile);
    const now = this.now();
    if (isIso(now) && Date.parse(copy.valid_until) < Date.parse(now) && copy.status !== "STALE") {
      copy.status = "STALE";
    }
    if (copy.status === "ACTIVE" && !methodologyAllowsActive(copy.methodology)) {
      copy.status = "PROVISIONAL";
    }
    return copy;
  }
}

function isIso(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

/** Stable key for tests that need to assert we do not rank by context-free score. */
export function profileStorageKey(profile: CapabilityProfile): string {
  return contextKey(profile.subject.executor_id, profile.context);
}
