/**
 * Control Plane / fabric persistence layout (host-level, separate from project data-dir).
 */

import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export interface FabricDataPaths {
  root: string;
  nodesDir: string;
  enrollmentDir: string;
  credentialsDir: string;
  leasesDir: string;
  poolsDir: string;
  artifactsDir: string;
  artifactBlobDir: string;
  teamsDir: string;
  decisionsDir: string;
  auditDir: string;
  outboxDir: string;
  sessionsDir: string;
  cpStateFile: string;
}

export function resolveFabricDataPaths(fabricDir: string): FabricDataPaths {
  const root = resolve(fabricDir);
  const paths: FabricDataPaths = {
    root,
    nodesDir: join(root, "nodes"),
    enrollmentDir: join(root, "enrollment"),
    credentialsDir: join(root, "credentials"),
    leasesDir: join(root, "leases"),
    poolsDir: join(root, "pools"),
    artifactsDir: join(root, "artifacts"),
    artifactBlobDir: join(root, "artifact-blobs"),
    teamsDir: join(root, "teams"),
    decisionsDir: join(root, "decisions"),
    auditDir: join(root, "audit"),
    outboxDir: join(root, "outbox"),
    sessionsDir: join(root, "sessions"),
    cpStateFile: join(root, "control-plane.json"),
  };
  mkdirSync(root, { recursive: true });
  for (const [k, dir] of Object.entries(paths)) {
    if (k === "root" || k === "cpStateFile") continue;
    mkdirSync(dir as string, { recursive: true });
  }
  return paths;
}

export function defaultFabricDir(): string {
  const xdg = process.env.XDG_STATE_HOME;
  if (xdg) return join(xdg, "evolveloop", "fabric");
  const home = process.env.HOME ?? "/tmp";
  return join(home, ".evolveloop", "fabric");
}
