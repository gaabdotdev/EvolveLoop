import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const YAML_CANDIDATES = [
  "/home/gaab/orca/workspaces/EvolveLoop/v24-g1-observability/orchestrator/node_modules/yaml/dist/index.js",
  "/home/gaab/orca/workspaces/EvolveLoop/v.2.5/node_modules/yaml/dist/index.js",
];

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "yaml") {
    for (const cand of YAML_CANDIDATES) {
      if (fs.existsSync(cand)) {
        return { url: pathToFileURL(cand).href, shortCircuit: true };
      }
    }
  }

  // Handle absolute file paths ending in .js
  if (specifier.startsWith("/") && specifier.endsWith(".js")) {
    const candidateTs = specifier.slice(0, -3) + ".ts";
    if (fs.existsSync(candidateTs)) {
      return { url: pathToFileURL(candidateTs).href, shortCircuit: true };
    }
  }

  // Handle file:// URLs ending in .js
  if (specifier.startsWith("file://") && specifier.endsWith(".js")) {
    try {
      const filePath = fileURLToPath(specifier);
      const candidateTs = filePath.slice(0, -3) + ".ts";
      if (fs.existsSync(candidateTs)) {
        return { url: pathToFileURL(candidateTs).href, shortCircuit: true };
      }
    } catch {
      // ignore
    }
  }

  // Handle relative imports ending in .js
  if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL) {
    try {
      const parentPath = fileURLToPath(context.parentURL);
      const parentDir = parentPath.substring(0, parentPath.lastIndexOf("/"));
      const candidateTs = parentDir + "/" + specifier.slice(0, -3) + ".ts";
      if (fs.existsSync(candidateTs)) {
        return { url: pathToFileURL(candidateTs).href, shortCircuit: true };
      }
    } catch {
      // ignore
    }
  }

  return nextResolve(specifier, context);
}
