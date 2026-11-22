/**
 * V5-M08 — Reference extension stub.
 * Registers a custom verifier (and optionally a tool) via public contracts.
 */

import type { CustomVerifier } from "./contracts.js";
import { EXTENSION_CONTRACTS_VERSION } from "./contracts.js";
import {
  ExtensionRegistryStore,
  type ExtensionRecord,
} from "./registry.js";
import {
  VerifierRegistryStore,
  type VerifierRegistryStore as VerifierStoreType,
} from "../verification/verifier-registry.js";
import { ToolRegistryStore } from "../tool-registry/store.js";
import { resolveV3DataPaths } from "../paths.js";

export const REFERENCE_EXTENSION_ID = "ext.reference.stub";
export const REFERENCE_VERIFIER_ID = "ext.reference.echo_verifier";
export const REFERENCE_TOOL_ID = "ext.reference.echo_tool";

/**
 * Echo verifier — always exit 1 with external_attestation provenance.
 * Must NEVER claim local_execution / forge PASS.
 */
export function createReferenceEchoVerifier(): CustomVerifier {
  return {
    verifier_id: REFERENCE_VERIFIER_ID,
    async run(input) {
      return {
        exit_code: 1,
        provenance: "external_attestation",
        command: input.command ?? "echo-reference-verifier",
        notes: [
          "reference stub — external_attestation only",
          "never upgrades to local_execution",
          `workspace=${input.workspace}`,
        ],
      };
    },
  };
}

export interface InstallReferenceExtensionResult {
  kind: "InstallReferenceExtensionResult";
  extension: ExtensionRecord;
  verifier_id: string;
  tool_id?: string;
  custom_verifier: CustomVerifier;
  notes: string[];
}

/**
 * Install the reference extension into Extension + Verifier (+ optional Tool) registries.
 */
export function installReferenceExtension(opts: {
  dataDir: string;
  /** Also register a deny-default tool stub (honesty=unsupported invoke). */
  withTool?: boolean;
}): InstallReferenceExtensionResult {
  const paths = resolveV3DataPaths(opts.dataDir);
  const extStore = new ExtensionRegistryStore(paths.extensionsDir);
  const verifierStore = new VerifierRegistryStore(paths.verificationDir);

  const custom = createReferenceEchoVerifier();
  verifierStore.seed();
  verifierStore.upsertVerifierRecord({
    kind: "VerifierRecord",
    verifier_id: REFERENCE_VERIFIER_ID,
    display_name: "Reference echo verifier (stub)",
    implementation: "custom",
    honesty: "unsupported",
    notes: [
      "Installed by ext.reference.stub",
      "external_attestation only — never forges PASS",
    ],
    limitations: ["In-process CustomVerifier; no durable plugin loader"],
    enabled: true,
  });
  verifierStore.registerCustomVerifier(custom);

  const provides: ExtensionRecord["provides"] = {
    verifier_ids: [REFERENCE_VERIFIER_ID],
  };
  const notes = [
    "Reference stub for SDK sketch — not a production plugin",
    `contracts ${EXTENSION_CONTRACTS_VERSION}`,
  ];

  let tool_id: string | undefined;
  if (opts.withTool) {
    const tools = new ToolRegistryStore(paths.toolRegistryDir);
    tools.registerTool({
      tool_id: REFERENCE_TOOL_ID,
      display_name: "Reference echo tool (stub)",
      tool_kind: "other",
      implementation: "unsupported",
      honesty: "unsupported",
      notes: ["reference extension stub — invoke not mediated by Core"],
      limitations: ["No live invoke path in M08"],
      enabled: true,
    });
    tool_id = REFERENCE_TOOL_ID;
    provides.tool_ids = [REFERENCE_TOOL_ID];
    notes.push(`registered tool ${REFERENCE_TOOL_ID}`);
  }

  const extension = extStore.register({
    extension_id: REFERENCE_EXTENSION_ID,
    display_name: "Reference Extension Stub",
    extension_kind: "verifier",
    permissions: {
      register_verifiers: true,
      register_tools: Boolean(opts.withTool),
    },
    provides,
    notes,
    enabled: true,
  });

  return {
    kind: "InstallReferenceExtensionResult",
    extension,
    verifier_id: REFERENCE_VERIFIER_ID,
    tool_id,
    custom_verifier: custom,
    notes,
  };
}

/** Re-export type for callers that need the store class shape. */
export type { VerifierStoreType };
