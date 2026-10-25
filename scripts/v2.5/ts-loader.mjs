import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../..");

const YAML_CANDIDATES = [
  path.join(workspaceRoot, "orchestrator/node_modules/yaml/browser/index.js"),
  path.join(workspaceRoot, "orchestrator/node_modules/yaml/dist/index.js"),
  path.join(workspaceRoot, "node_modules/yaml/browser/index.js"),
  path.join(workspaceRoot, "node_modules/yaml/dist/index.js"),
  path.join(process.cwd(), "orchestrator/node_modules/yaml/browser/index.js"),
  path.join(process.cwd(), "orchestrator/node_modules/yaml/dist/index.js"),
  path.join(process.cwd(), "node_modules/yaml/browser/index.js"),
  path.join(process.cwd(), "node_modules/yaml/dist/index.js"),
];

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "yaml") {
    for (const cand of YAML_CANDIDATES) {
      if (fs.existsSync(cand)) {
        const isEsm = cand.includes("browser");
        return {
          url: pathToFileURL(cand).href,
          format: isEsm ? "module" : "commonjs",
          shortCircuit: true,
        };
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
