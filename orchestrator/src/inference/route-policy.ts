/**
 * Opt-in inference route.
 * The default stays on the direct provider path.
 * OmniRoute is selected only when EVOLVELOOP_INFERENCE_GATEWAY=omniroute.
 * The free model default is the one model observed with a zero cost header.
 * Critical review is not sent to that same model and is not sent to a paid provider.
 */

export const ROUTE_POLICY_VERSION = "v1";
export const OBSERVED_ZERO_COST_MODEL = "ddgw/gpt-5.4-mini";
export const DEFAULT_OMNIROUTE_URL = "http://127.0.0.1:20128/api/v1/chat/completions";

export type InferenceTaskClass =
  | "simple"
  | "planning"
  | "code"
  | "repair"
  | "context"
  | "review"
  | "orchestration";

export type InferenceRoute =
  | {
      policyVersion: typeof ROUTE_POLICY_VERSION;
      gateway: "direct";
      provider: "anthropic";
      model: string;
      reason: string;
    }
  | {
      policyVersion: typeof ROUTE_POLICY_VERSION;
      gateway: "omniroute";
      provider: "openai";
      model: string;
      gatewayUrl: string;
      allowedGatewayHost: string;
      reason: string;
    }
  | {
      policyVersion: typeof ROUTE_POLICY_VERSION;
      gateway: "blocked";
      reason: string;
    };

function omnirouteModel(env: NodeJS.ProcessEnv): string {
  const configured = env.EVOLVELOOP_OMNIROUTE_MODEL?.trim();
  return configured && configured.length > 0 ? configured : OBSERVED_ZERO_COST_MODEL;
}

function omnirouteUrl(env: NodeJS.ProcessEnv): { gatewayUrl: string; allowedGatewayHost: string } {
  const configured = env.EVOLVELOOP_OMNIROUTE_BASE_URL?.trim();
  const gatewayUrl = configured && configured.length > 0 ? configured : DEFAULT_OMNIROUTE_URL;
  const allowedGatewayHost = new URL(gatewayUrl).hostname;
  return { gatewayUrl, allowedGatewayHost };
}

export function selectInferenceRoute(
  task: InferenceTaskClass,
  env: NodeJS.ProcessEnv = process.env,
): InferenceRoute {
  if (env.EVOLVELOOP_INFERENCE_GATEWAY !== "omniroute") {
    return {
      policyVersion: ROUTE_POLICY_VERSION,
      gateway: "direct",
      provider: "anthropic",
      model: "claude-3-5-sonnet",
      reason: "OmniRoute is not enabled. The direct provider path stays in place.",
    };
  }

  if (task === "review") {
    return {
      policyVersion: ROUTE_POLICY_VERSION,
      gateway: "blocked",
      reason: "No model measured independently of the writer is eligible, and paid fallback is not authorized.",
    };
  }

  const target = omnirouteUrl(env);
  return {
    policyVersion: ROUTE_POLICY_VERSION,
    gateway: "omniroute",
    provider: "openai",
    model: omnirouteModel(env),
    gatewayUrl: target.gatewayUrl,
    allowedGatewayHost: target.allowedGatewayHost,
    reason: "Task class uses the model observed with response cost 0.0000000000.",
  };
}
