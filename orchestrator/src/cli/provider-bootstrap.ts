/**
 * Provider bootstrap for run-engine — explicit mock | real modes (ADR-V3-0001).
 * Never silently substitutes MockProvider in real mode.
 */

import { resolve } from "node:path";
import type { ProviderManifest, ProviderRuntime } from "../types/index.js";
import { ProviderRouter, createMockProvider } from "../providers/mock-provider.js";
import { PluginLoader } from "../plugins/plugin-loader.js";
import { JobFileExecutor } from "../plugins/cursor-skill-provider.js";
import type { AuthorityContext } from "../authority/capability-authority.js";

export type ProviderMode = "mock" | "real";

export interface ProviderBootstrapResult {
  router: ProviderRouter;
  provider_mode: ProviderMode;
  registered: Array<{ id: string; kind: "mock" | "real" | "skipped" }>;
  warnings: string[];
}

export interface SetupProvidersOptions {
  mode: ProviderMode;
  agentsRoot: string;
  jobsDir?: string;
  manifests: ProviderManifest[];
  providerIds: Iterable<string>;
  authorityContext?: AuthorityContext;
}

export class ProviderBootstrapError extends Error {
  readonly code = "PROVIDER_BOOTSTRAP_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "ProviderBootstrapError";
  }
}

export function parseProviderMode(raw: string | undefined): ProviderMode {
  if (raw === undefined || raw === "") return "mock";
  if (raw === "mock" || raw === "real") return raw;
  throw new ProviderBootstrapError(
    `Invalid --provider-mode '${raw}'. Expected mock|real.`,
  );
}

export function setupProviders(opts: SetupProvidersOptions): ProviderBootstrapResult {
  const router = new ProviderRouter();
  const loader = new PluginLoader(opts.agentsRoot, {
    authorityContext: opts.authorityContext,
  });
  const executor = opts.jobsDir ? new JobFileExecutor(resolve(opts.jobsDir)) : undefined;
  const manifestByName = new Map(opts.manifests.map((m) => [m.metadata.name, m]));
  const registered: ProviderBootstrapResult["registered"] = [];
  const warnings: string[] = [];

  for (const id of opts.providerIds) {
    const manifest = manifestByName.get(id);

    if (opts.mode === "mock") {
      router.register(createMockProvider(id));
      registered.push({ id, kind: "mock" });
      continue;
    }

    // real mode
    if (!manifest) {
      throw new ProviderBootstrapError(
        `provider_mode=real: no manifest for provider '${id}' (refusing silent mock)`,
      );
    }

    const pluginType = manifest.spec.plugin?.type;
    if (pluginType === "cursor-skill") {
      if (!executor) {
        throw new ProviderBootstrapError(
          `provider_mode=real: cursor-skill '${id}' requires --jobs-dir (refusing silent mock)`,
        );
      }
      router.register(loader.load(manifest, executor));
      registered.push({ id, kind: "real" });
      continue;
    }

    if (pluginType === "deterministic" || pluginType === "shell" || pluginType === "mock") {
      const runtime: ProviderRuntime = loader.load(manifest, executor);
      router.register(runtime);
      registered.push({ id, kind: pluginType === "mock" ? "mock" : "real" });
      if (pluginType === "mock") {
        warnings.push(`manifest '${id}' declares plugin.type=mock under provider_mode=real`);
      }
      continue;
    }

    throw new ProviderBootstrapError(
      `provider_mode=real: unsupported plugin type '${String(pluginType)}' for '${id}'`,
    );
  }

  return { router, provider_mode: opts.mode, registered, warnings };
}
