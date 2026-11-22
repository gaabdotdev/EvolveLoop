/**
 * V5-M06 — Verifier registry: native `local_command` + CustomVerifier.
 * local_command wraps delivery validate --run (validateDelivery); never forges PASS.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  effectiveProvenance,
  type DeliveryEvidenceProvenance,
} from "../../cli/tui/delivery-status.js";
import { validateDelivery } from "../../cli/tui/delivery-verify.js";
import type {
  CustomVerifier,
  DeliveryProjectionStatus,
  VerifierRecord,
  VerifierRegistrySnapshot,
  VerifierRunResult,
} from "./types.js";

export class VerifierRegistryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VerifierRegistryError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

const LIMITATIONS = [
  "Verifier registry is a stub — not a full CI product",
  "native local_command wraps validateDelivery (delivery validate --run)",
  "PASS only after local_execution exit 0 via Delivery projection / REMED-M5",
  "CustomVerifier must never upgrade external_attestation to local_execution",
  "may_contribute_to_pass ≠ automatic Delivery PASS without attach/projection",
];

/** Native verifier: wraps delivery validate --run. */
export const NATIVE_LOCAL_COMMAND_ID = "local_command";

/** Custom verifier slot (interface only until registered). */
export const CUSTOM_VERIFIER_ID = "custom.verifier";

/** @deprecated Prefer NATIVE_LOCAL_COMMAND_ID */
export const NATIVE_TEST_RUNNER_ID = NATIVE_LOCAL_COMMAND_ID;
/** @deprecated Prefer CUSTOM_VERIFIER_ID */
export const CUSTOM_HOOK_VERIFIER_ID = CUSTOM_VERIFIER_ID;

function toProjectionStatus(
  status: string,
): DeliveryProjectionStatus | undefined {
  if (status === "FAILED") return "FAIL";
  if (
    status === "PASS" ||
    status === "FAIL" ||
    status === "UNVERIFIED" ||
    status === "ATTESTED" ||
    status === "BLOCKED"
  ) {
    return status;
  }
  return undefined;
}

export function defaultVerifierSeed(): VerifierRecord[] {
  return [
    {
      kind: "VerifierRecord",
      verifier_id: NATIVE_LOCAL_COMMAND_ID,
      display_name: "Native local_command (delivery validate --run)",
      implementation: "local_command",
      honesty: "partial",
      notes: [
        "Delegates to validateDelivery({ run }) — EvolveLoop-spawned local_execution",
        "Attaches delivery_verification evidence; PASS only if exit 0 + local_execution",
      ],
      limitations: [
        "Does not discover test suites automatically — operator supplies command",
        "Timeout / signal → non-zero; never forges PASS",
      ],
      enabled: true,
    },
    {
      kind: "VerifierRecord",
      verifier_id: CUSTOM_VERIFIER_ID,
      display_name: "CustomVerifier (interface)",
      implementation: "custom",
      honesty: "unknown",
      notes: [
        "Interface only until a CustomVerifier is registered in-process",
        "Register via registerCustomVerifier() for the process lifetime",
      ],
      limitations: [
        "No durable plugin loader in M06",
        "Absent CustomVerifier → unsupported run",
      ],
      enabled: true,
    },
  ];
}

export class VerifierRegistryStore {
  private readonly path: string;
  private customVerifiers = new Map<string, CustomVerifier>();

  constructor(rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
    this.path = join(rootDir, "verifiers.json");
  }

  load(): VerifierRegistrySnapshot {
    if (!existsSync(this.path)) {
      return {
        kind: "VerifierRegistry",
        version: 0,
        updated_at: nowIso(),
        verifiers: [],
        limitations: [...LIMITATIONS, "verifiers file absent — call seed()"],
      };
    }
    const parsed = JSON.parse(
      readFileSync(this.path, "utf-8"),
    ) as VerifierRegistrySnapshot;
    if (parsed.kind !== "VerifierRegistry") {
      throw new VerifierRegistryError("INVALID", this.path);
    }
    return parsed;
  }

  seed(force = false): VerifierRegistrySnapshot {
    if (existsSync(this.path) && !force) return this.load();
    const snap: VerifierRegistrySnapshot = {
      kind: "VerifierRegistry",
      version: 1,
      updated_at: nowIso(),
      verifiers: defaultVerifierSeed(),
      limitations: [...LIMITATIONS],
    };
    atomicWrite(this.path, JSON.stringify(snap, null, 2));
    return snap;
  }

  get(verifierId: string): VerifierRecord {
    const v = this.load().verifiers.find((x) => x.verifier_id === verifierId);
    if (!v) throw new VerifierRegistryError("NOT_FOUND", verifierId);
    return v;
  }

  /** In-process CustomVerifier registration (not durable). */
  registerCustomVerifier(verifier: CustomVerifier): void {
    this.customVerifiers.set(verifier.verifier_id, verifier);
  }

  /**
   * Upsert durable VerifierRecord metadata (M08 extension stubs).
   * Does not load plugin code — pair with registerCustomVerifier for run().
   */
  upsertVerifierRecord(record: VerifierRecord): VerifierRecord {
    const snap = existsSync(this.path) ? this.load() : this.seed();
    const next = { ...record, kind: "VerifierRecord" as const };
    const idx = snap.verifiers.findIndex((v) => v.verifier_id === next.verifier_id);
    if (idx >= 0) snap.verifiers[idx] = next;
    else snap.verifiers.push(next);
    snap.version += 1;
    snap.updated_at = nowIso();
    atomicWrite(this.path, JSON.stringify(snap, null, 2));
    return next;
  }

  /** @deprecated Prefer registerCustomVerifier */
  registerCustomHook(hook: CustomVerifier): void {
    this.registerCustomVerifier(hook);
  }

  getCustomVerifier(verifierId: string): CustomVerifier | undefined {
    return this.customVerifiers.get(verifierId);
  }

  /** @deprecated Prefer getCustomVerifier */
  getCustomHook(verifierId: string): CustomVerifier | undefined {
    return this.getCustomVerifier(verifierId);
  }

  /**
   * Run a verifier. Native local_command uses validateDelivery (REMED-M5 path).
   */
  async run(
    verifierId: string,
    input: {
      workspace: string;
      work_id?: string;
      command?: string;
      goal_contract_id?: string;
      goal_contract_version?: number;
      task_id?: string;
    },
  ): Promise<VerifierRunResult> {
    const rec = this.get(verifierId);
    if (!rec.enabled) {
      return {
        kind: "VerifierRunResult",
        verifier_id: verifierId,
        exit_code: 1,
        provenance: "absent",
        command: input.command ?? "",
        notes: ["verifier_disabled"],
        may_contribute_to_pass: false,
      };
    }

    if (
      verifierId === NATIVE_LOCAL_COMMAND_ID ||
      rec.implementation === "local_command"
    ) {
      return this.runLocalCommand(verifierId, input);
    }

    if (
      rec.implementation === "custom" ||
      rec.implementation === "custom_hook" ||
      verifierId === CUSTOM_VERIFIER_ID
    ) {
      return this.runCustom(verifierId, input);
    }

    return {
      kind: "VerifierRunResult",
      verifier_id: verifierId,
      exit_code: 1,
      provenance: "absent",
      command: input.command ?? "",
      notes: ["unsupported_verifier"],
      may_contribute_to_pass: false,
    };
  }

  private runLocalCommand(
    verifierId: string,
    input: {
      workspace: string;
      work_id?: string;
      command?: string;
      goal_contract_id?: string;
      goal_contract_version?: number;
      task_id?: string;
    },
  ): VerifierRunResult {
    const command = (input.command ?? "").trim();
    if (!command) {
      return {
        kind: "VerifierRunResult",
        verifier_id: verifierId,
        exit_code: 1,
        provenance: "absent",
        command: "",
        notes: ["command_required", "wraps_validateDelivery"],
        may_contribute_to_pass: false,
        delivery_status: "UNVERIFIED",
      };
    }

    // Wrap delivery validate --run (REMED-M5 provenance path).
    const view = validateDelivery(input.workspace, {
      run: command,
      work_id: input.work_id,
      goal_contract_id: input.goal_contract_id,
      goal_contract_version: input.goal_contract_version,
      task_id: input.task_id,
    });

    const provenance: DeliveryEvidenceProvenance = view.verification
      ? effectiveProvenance(view.verification)
      : "absent";
    const exit_code = view.verification?.exit_code ?? 1;
    const delivery_status = toProjectionStatus(view.status);

    return {
      kind: "VerifierRunResult",
      verifier_id: verifierId,
      exit_code,
      provenance,
      command,
      notes: [
        "wraps_validateDelivery",
        "delivery_validate_run",
        input.work_id ? `work_id=${input.work_id}` : "work_id=unset",
        view.evidence_id ? `evidence_id=${view.evidence_id}` : "evidence_id=none",
        `delivery_status=${view.status}`,
      ],
      may_contribute_to_pass:
        provenance === "local_execution" && exit_code === 0,
      delivery_status,
      evidence_id: view.evidence_id,
    };
  }

  private async runCustom(
    verifierId: string,
    input: {
      workspace: string;
      work_id?: string;
      command?: string;
    },
  ): Promise<VerifierRunResult> {
    const hook =
      this.customVerifiers.get(verifierId) ??
      this.customVerifiers.get(CUSTOM_VERIFIER_ID);
    if (!hook) {
      return {
        kind: "VerifierRunResult",
        verifier_id: verifierId,
        exit_code: 1,
        provenance: "absent",
        command: input.command ?? "",
        notes: [
          "custom_verifier_not_registered",
          "LIMITATION:no_durable_plugin_loader",
        ],
        may_contribute_to_pass: false,
      };
    }

    const out = await hook.run(input);
    return {
      kind: "VerifierRunResult",
      verifier_id: verifierId,
      exit_code: out.exit_code,
      provenance: out.provenance,
      command: out.command,
      notes: [
        ...(out.notes ?? []),
        "custom_verifier_returned_provenance",
        "caller_must_not_forge_PASS_without_evidence_attach",
      ],
      may_contribute_to_pass:
        out.provenance === "local_execution" && out.exit_code === 0,
    };
  }
}
