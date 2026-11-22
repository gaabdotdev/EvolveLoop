import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export interface MeasurementDataPaths {
  root: string;
  eventsDir: string;
  artifactsDir: string;
  experimentsDir: string;
  reportsDir: string;
  projectionsDir: string;
  suitesDir: string;
}

/** Measurement plane layout under V3 --data-dir (or standalone root). */
export function resolveMeasurementPaths(dataDir: string): MeasurementDataPaths {
  const root = join(resolve(dataDir), "measurement");
  const paths: MeasurementDataPaths = {
    root,
    eventsDir: join(root, "events"),
    artifactsDir: join(root, "artifacts"),
    experimentsDir: join(root, "experiments"),
    reportsDir: join(root, "reports"),
    projectionsDir: join(root, "projections"),
    suitesDir: join(root, "suites"),
  };
  for (const dir of Object.values(paths)) {
    mkdirSync(dir, { recursive: true });
  }
  return paths;
}
