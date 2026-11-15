import { generateNodeIdentity } from "../../../src/v3/fabric/trust/identity.js";
import { HandleSigningAdapter } from "../../../src/v4/adapters/v37/identity.js";
import {
  DEFAULT_TENANT_ID,
  POLICY_DECISION_SCHEMA_VERSION,
  computeCapsuleDigest,
  type DelegableGrantRef,
  type EffectLedgerPort,
  type EffectRecord,
  type ExecutionCapsule,
  type IsoTimestamp,
  type PolicyDecision,
  type PolicyDecisionPort,
  type PolicyDecisionRequest,
  type RetryDecision,
} from "../../../src/v4/contracts/index.js";
import {
  CapsuleService,
  InMemoryReplayStore,
  signerFromHandle,
  type CapsuleServiceOptions,
  type DelegableGrantSource,
  type TombstoneView,
} from "../../../src/v4/continuity/index.js";
import { EFFECT, TASK, WORK, draft, runtime, workCreated } from "../ledger/helpers.js";

export { EFFECT, TASK, WORK };
export const NOW: IsoTimestamp = "2026-11-15T12:00:00.000Z";
export const LATER: IsoTimestamp = "2026-11-15T13:00:00.000Z";
export const POLICY_ID = "pol_default0001";
export const WORKER_REF = { executor_id: "executor_worker01", executor_version: "1.0.0" } as const;
export const READ_GRANT: DelegableGrantRef = {
  grant_ref: "grn" + "aa".repeat(12),
  scope: ["filesystem.read /workspace/src/app.ts"],
  expires_at: LATER,
};
export const WRITE_GRANT: DelegableGrantRef = {
  grant_ref: "grn" + "bb".repeat(12),
  scope: ["git.mutate origin/main"],
  expires_at: LATER,
};

export function stubEffects(open: EffectRecord[] = []): EffectLedgerPort {
  const retry: RetryDecision = { action: "RECONCILE_FIRST", reason: "open_effect_not_dispatched_by_m04" };
  return {
    plan: async () => {
      throw new Error("effects.plan unused in M04 tests");
    },
    transition: async () => {
      throw new Error("effects.transition unused in M04 tests");
    },
    get: async () => undefined,
    listOpen: async () => open,
    retryDecision: async () => retry,
  };
}

export class AllowlistPolicy implements PolicyDecisionPort {
  readonly requests: PolicyDecisionRequest[] = [];
  constructor(
    private readonly allowActions: ReadonlySet<string>,
    private readonly policy_id = POLICY_ID,
    private readonly epoch = 0,
  ) {}

  async currentEpoch(policy_id: string): Promise<number> {
    if (policy_id !== this.policy_id) throw new Error(`unknown policy ${policy_id}`);
    return this.epoch;
  }

  async decide(request: PolicyDecisionRequest): Promise<PolicyDecision> {
    this.requests.push(request);
    const allow = this.allowActions.has(request.action);
    return {
      kind: "PolicyDecision",
      schema_version: POLICY_DECISION_SCHEMA_VERSION,
      tenant_id: DEFAULT_TENANT_ID,
      decision_id: `pdec_${String(this.requests.length).padStart(8, "0")}`,
      request,
      decision: allow ? "ALLOW" : "DENY",
      policy_ref: { policy_id: this.policy_id, version: 1, epoch: this.epoch },
      matched_rule_ids: allow ? ["rule_allow"] : [],
      reason: allow ? "allowlisted_action" : "deny_by_default",
      obligations: [],
      decided_at: NOW,
      valid_until: "2026-11-15T12:01:00.000Z",
    };
  }
}

export function grantSource(grants: DelegableGrantRef[]): DelegableGrantSource {
  return { grantsFor: async () => grants };
}

export function emptyTombs(): TombstoneView {
  return {
    consumedGrants: async () => [],
    terminalEffects: async () => [],
  };
}

export function resign(capsule: ExecutionCapsule, extra: Record<string, unknown>, sign: (manifest: string) => { key_id: string; value_b64: string }): ExecutionCapsule {
  const { integrity: _ignored, ...rest } = { ...capsule, ...extra } as ExecutionCapsule;
  void _ignored;
  const manifest_sha256 = computeCapsuleDigest(rest);
  const sig = sign(manifest_sha256);
  return {
    ...(rest as Omit<ExecutionCapsule, "integrity">),
    integrity: {
      canonicalization: "evolveloop-canonical-json-v1",
      manifest_sha256,
      signature: { alg: "Ed25519", key_id: sig.key_id, value_b64: sig.value_b64 },
    },
  };
}

export async function seededWorld(opts?: { grants?: DelegableGrantRef[]; allow?: string[]; lease_required?: boolean }) {
  const opened = runtime();
  await opened.rt.ledger.append(
    WORK,
    [
      workCreated(),
      draft("task.planned", { task_id: TASK, state: "RUNNING" }),
      draft("effect.planned", { effect_id: EFFECT, state: "PLANNED" }),
      draft("effect.state_changed", { effect_id: EFFECT, state: "DISPATCHED" }),
    ],
    { expected_head_seq: 0 },
  );
  const checkpoint = await opened.rt.checkpoints.create(WORK, 4);
  const km = generateNodeIdentity();
  const adapter = new HandleSigningAdapter();
  const handle = adapter.register({
    private_key_pem: km.private_key_pem,
    public_key_spki_b64: km.public_key_spki_b64,
  });
  const { signer, keys } = signerFromHandle(adapter, handle);
  const policy = new AllowlistPolicy(new Set(opts?.allow ?? ["filesystem.read"]));
  const replay = new InMemoryReplayStore();
  const effects = stubEffects();
  const serviceOpts: CapsuleServiceOptions = {
    now: () => NOW,
    signer,
    keys,
    require_signature: true,
    rederive_subject: WORKER_REF,
    grants: grantSource(opts?.grants ?? [READ_GRANT, WRITE_GRANT]),
    lease_required: opts?.lease_required ?? false,
    tombstones: emptyTombs(),
  };
  const service = new CapsuleService(opened.rt.ledger, opened.rt.checkpoints, effects, policy, replay, serviceOpts);
  return {
    root: opened.root,
    rt: opened.rt,
    checkpoint,
    service,
    policy,
    replay,
    effects,
    signer,
    keys,
    handle,
    adapter,
    km,
    serviceOpts,
  };
}
