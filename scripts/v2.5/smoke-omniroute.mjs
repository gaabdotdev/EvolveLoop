#!/usr/bin/env -S node --experimental-strip-types
/**
 * One controlled EvolveLoop adapter call through the local OmniRoute gateway.
 * Prints telemetry only. Does not print the gateway credential.
 */
import * as path from "node:path";
import * as url from "node:url";
import * as cp from "node:child_process";
import * as fs from "node:fs";
import { register } from "node:module";

if (!process.execArgv.includes("--experimental-strip-types")) {
  const child = cp.spawnSync(process.execPath, ["--experimental-strip-types", ...process.argv.slice(1)], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(child.status ?? 0);
}

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
register(path.join(__dirname, "ts-loader.mjs"), import.meta.url);

const { ObservableLlmProviderAdapter } = await import(
  path.resolve(__dirname, "../../orchestrator/src/observability/observable-llm-adapter.ts")
);
const { selectInferenceRoute } = await import(
  path.resolve(__dirname, "../../orchestrator/src/inference/route-policy.ts")
);

const keyFile = process.env.OMNIROUTE_CLIENT_KEY_FILE;
if (!keyFile) {
  console.error("OMNIROUTE_CLIENT_KEY_FILE is required");
  process.exit(2);
}
const keyMeta = JSON.parse(fs.readFileSync(keyFile, "utf8"));
if (typeof keyMeta.key !== "string" || keyMeta.key.length === 0) {
  console.error("client key file has no key field");
  process.exit(2);
}

const route = selectInferenceRoute("simple", {
  ...process.env,
  EVOLVELOOP_INFERENCE_GATEWAY: "omniroute",
});
if (route.gateway !== "omniroute") {
  console.error("route was not omniroute");
  process.exit(2);
}

const adapter = new ObservableLlmProviderAdapter(undefined, {
  allowLoopback: true,
  allowedGateways: [route.allowedGatewayHost],
});

const started = Date.now();
const result = await adapter.complete({
  provider: route.provider,
  model: route.model,
  gatewayUrl: route.gatewayUrl,
  apiKey: keyMeta.key,
  prompt: "Reply with the single word pong.",
  maxTokens: 8,
  temperature: 0,
});
const wallMs = Date.now() - started;

const evidence = {
  policyVersion: route.policyVersion,
  requestedModel: route.model,
  gatewayUrlHost: route.allowedGatewayHost,
  text: result.text,
  omniroute: result.omniroute ?? null,
  usage: result.raw && typeof result.raw === "object" ? result.raw.usage ?? null : null,
  wallMs,
};
console.log(JSON.stringify(evidence, null, 2));
