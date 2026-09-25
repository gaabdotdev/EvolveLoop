/**
 * Meta0 demo stub runner — reports honest OutcomeStatus; never fakes PASS.
 */

import type { OutcomeStatus } from "../failure/types.js";
import type { DemoManifest } from "../contracts/types.js";
import { validateDemoManifest } from "../contracts/validators.js";
import { loadDemo } from "./catalog.js";
import type { DemoRuntimeContext, DemoStubResult, LoadDemoOptions } from "./types.js";

function requiredCapabilities(manifest: DemoManifest): string[] {
  if (Array.isArray(manifest.spec.required_capabilities)) {
    return manifest.spec.required_capabilities.filter((c) => typeof c === "string" && c.length > 0);
  }
  const fromConstraints: string[] = [];
  for (const c of manifest.spec.constraints) {
    const m = /^requires_capability:(.+)$/.exec(c);
    if (m) fromConstraints.push(m[1]!.trim());
  }
  return fromConstraints;
}

function requiresSandbox(manifest: DemoManifest): boolean {
  if (typeof manifest.spec.requires_sandbox === "boolean") {
    return manifest.spec.requires_sandbox;
  }
  return manifest.spec.constraints.some(
    (c) => c === "requires_sandbox:true" || c === "requires_sandbox",
  );
}

function missingCapabilities(
  required: string[],
  available: readonly string[] | undefined,
): string[] {
  const have = new Set(available ?? []);
  return required.filter((c) => !have.has(c));
}

/**
 * Stub runner for Meta0 public demos.
 *
 * Rules (inegociável):
 * - Never returns PASS (no live measurement path in this wave).
 * - Missing/invalid manifest → BLOCKED.
 * - Missing required capabilities or sandbox when required → NOT_MEASURED or BLOCKED with reason.
 * - Even with a full context, stub stays NOT_MEASURED until a real runner exists
 *   (`runtime_ready: true` still cannot yield PASS from this function).
 */
export function runDemoStub(
  demoIdOrManifest: string | DemoManifest,
  context: DemoRuntimeContext = {},
  options?: LoadDemoOptions,
): DemoStubResult {
  let manifest: DemoManifest;
  let demoId: string;

  if (typeof demoIdOrManifest === "string") {
    demoId = demoIdOrManifest;
    try {
      manifest = loadDemo(demoIdOrManifest, options);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isNotFound = err instanceof Error && err.name === "DemoNotFoundError";
      return {
        demo_id: demoId,
        status: "BLOCKED",
        reason: isNotFound
          ? `Demo not found: ${message}`
          : `Demo manifest invalid or unloadable: ${message}`,
        measured: false,
        validation_errors:
          err instanceof Error && "errors" in err
            ? (err as { errors: string[] }).errors
            : undefined,
      };
    }
  } else {
    const validation = validateDemoManifest(demoIdOrManifest);
    if (!validation.valid) {
      return {
        demo_id:
          typeof demoIdOrManifest.metadata?.demo_id === "string"
            ? demoIdOrManifest.metadata.demo_id
            : "unknown",
        status: "BLOCKED",
        reason: `DemoManifest validation failed: ${validation.errors.join("; ")}`,
        measured: false,
        validation_errors: validation.errors,
      };
    }
    manifest = demoIdOrManifest;
    demoId = manifest.metadata.demo_id;
  }

  const required = requiredCapabilities(manifest);
  const missing = missingCapabilities(required, context.available_capabilities);
  const needsSandbox = requiresSandbox(manifest);
  const sandboxReady = context.sandbox_ready === true;

  if (missing.length > 0) {
    return {
      demo_id: demoId,
      status: "NOT_MEASURED",
      reason: `Required capabilities not available: ${missing.join(", ")}. Demo runtime cannot measure this scenario.`,
      measured: false,
      title: manifest.spec.title,
      missing_capabilities: missing,
    };
  }

  if (needsSandbox && !sandboxReady) {
    return {
      demo_id: demoId,
      status: "NOT_MEASURED",
      reason:
        "Scenario requires sandbox but sandbox is not ready. Status NOT_MEASURED until live sandbox provision exists.",
      measured: false,
      title: manifest.spec.title,
    };
  }

  // Capabilities + sandbox satisfied still do not imply a live runner.
  if (!context.runtime_ready) {
    return {
      demo_id: demoId,
      status: "NOT_MEASURED",
      reason:
        "Demo catalog entry loaded, but live Meta0 runner is not implemented. Honest status: NOT_MEASURED (never PASS from stub).",
      measured: false,
      title: manifest.spec.title,
    };
  }

  // Even with runtime_ready, this stub must not claim PASS — that is reserved for
  // a future measured runner with SuccessOracle evidence.
  const blockedStatus: OutcomeStatus = "BLOCKED";
  return {
    demo_id: demoId,
    status: blockedStatus,
    reason:
      "runtime_ready was set but Meta0 live runner is still a stub — refusing to emit PASS without oracle-backed measurement.",
    measured: false,
    title: manifest.spec.title,
  };
}
