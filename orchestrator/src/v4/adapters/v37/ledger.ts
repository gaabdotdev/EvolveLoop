/**
 * M02 V3.7 adapter (ADR-V4-0002, OWNERSHIP-MAP).
 *
 * DELEGATES to ArtifactFabric and LeaseManager. Does not reimplement
 * content-addressed storage or fencing-epoch issuance. V4 modules other
 * than this file must not import `orchestrator/src/v3/**`.
 *
 * Baseline is provisional `03937c1` (V3.7 BLOCKED on G17). Re-run adapter
 * tests on the certified hash once published. This file does not edit
 * recovery/v37-full-cert.
 */

import { ArtifactFabric } from "../../../v3/fabric/artifacts/registry.js";
import { LeaseManager } from "../../../v3/fabric/leases/lease-manager.js";
import { resolveFabricDataPaths, type FabricDataPaths } from "../../../v3/fabric/paths.js";
import type { V37ArtifactPort, V37LeaseFencingPort } from "../../contracts/adapters-v37.js";

export interface V37LedgerBindings {
  paths: FabricDataPaths;
  artifacts: V37ArtifactPort;
  leases: V37LeaseFencingPort;
}

/** Bind the M02 ports to the live V3.7 classes. */
export function bindV37LedgerAdapters(fabricDir: string): V37LedgerBindings {
  const paths = resolveFabricDataPaths(fabricDir);
  const artifacts: V37ArtifactPort = new ArtifactFabric(paths);
  const leases: V37LeaseFencingPort = new LeaseManager(paths);
  return { paths, artifacts, leases };
}

export type { V37ArtifactPort, V37LeaseFencingPort };
