/**
 * assertObservationVsBelief — rejects Belief / inference payloads on the Observation channel.
 * Invariant (§184): Inference must never silently become observation.
 */

import { isObject } from "../contracts/common.js";
import type { Observation } from "../contracts/types.js";
import { validateObservation } from "../contracts/validators.js";
import { ChannelSeparationError } from "./errors.js";

const BELIEF_ONLY_SPEC_KEYS = [
  "statement",
  "status",
  "supporting_observation_refs",
  "dependent_belief_refs",
  "confidence",
] as const;

/**
 * Heuristic markers that turn raw text into Belief/inference (§184).
 * Fail-closed: inference language must not silently become Observation.
 */
export const INFERENCE_LANGUAGE_RE =
  /\b(?:i (?:infer|believe|think|conclude|assume|suspect)|we (?:can|should) (?:infer|conclude)|therefore|presumably|it (?:seems|appears)(?: that| like)?|my (?:hypothesis|inference|belief)|inferred (?:that|from)|probably (?:because|due)|likely (?:because|due)|hypothesis:)\b/i;

/** True when text looks like interpretive inference rather than a raw sensor fact. */
export function looksLikeInferenceLanguage(raw: string): boolean {
  return INFERENCE_LANGUAGE_RE.test(raw);
}

/**
 * Garanta that `candidate` is a raw Observation, not a Belief or inference-shaped object.
 * Throws ChannelSeparationError on violation; returns the validated Observation otherwise.
 */
export function assertObservationVsBelief(candidate: unknown): Observation {
  const details: string[] = [];

  if (!isObject(candidate)) {
    throw new ChannelSeparationError(["candidate must be an object"]);
  }

  if (candidate.kind === "Belief") {
    details.push('kind "Belief" must not be written to the Observation channel');
  }

  if (isObject(candidate.spec)) {
    for (const key of BELIEF_ONLY_SPEC_KEYS) {
      if (key in candidate.spec) {
        details.push(`spec.${key} is Belief-only and forbidden on Observation`);
      }
    }
    if (
      typeof candidate.spec.raw === "string" &&
      looksLikeInferenceLanguage(candidate.spec.raw)
    ) {
      details.push(
        "spec.raw contains inference language — write interpretive claims on the Belief channel",
      );
    }
  }

  // Belief metadata shape without Observation ids
  if (isObject(candidate.metadata)) {
    if (
      typeof candidate.metadata.belief_id === "string" &&
      candidate.metadata.belief_id.length > 0
    ) {
      details.push("metadata.belief_id marks Belief content — forbidden on Observation channel");
    }
  }

  const schema = validateObservation(candidate);
  if (!schema.valid) {
    details.push(...schema.errors.map((e) => `schema: ${e}`));
  }

  if (details.length > 0) {
    throw new ChannelSeparationError(details);
  }

  return candidate as Observation;
}

/**
 * Garanta that `candidate` is a Belief, not a raw Observation masquerading as interpretation.
 */
export function assertBeliefVsObservation(candidate: unknown): void {
  const details: string[] = [];

  if (!isObject(candidate)) {
    throw new ChannelSeparationError(["candidate must be an object"]);
  }

  if (candidate.kind === "Observation") {
    details.push('kind "Observation" must not be written to the Belief channel');
  }

  if (isObject(candidate.spec) && "raw" in candidate.spec && !("statement" in candidate.spec)) {
    details.push("spec.raw without statement looks like Observation — use Belief.statement");
  }

  if (isObject(candidate.metadata)) {
    if (
      typeof candidate.metadata.observation_id === "string" &&
      candidate.metadata.observation_id.length > 0 &&
      !candidate.metadata.belief_id
    ) {
      details.push("metadata.observation_id without belief_id is Observation-shaped");
    }
  }

  if (details.length > 0) {
    throw new ChannelSeparationError(details);
  }
}
