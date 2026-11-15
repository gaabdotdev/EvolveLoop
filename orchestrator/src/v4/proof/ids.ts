import { randomBytes } from "node:crypto";
import { ID_PREFIX, isValidId, type IdKind } from "../contracts/index.js";

export interface IdFactory {
  evidence(): string;
  proof(): string;
  event(): string;
}

function randomId(kind: IdKind): string {
  const id = `${ID_PREFIX[kind]}${randomBytes(8).toString("hex")}`;
  if (!isValidId(kind, id)) {
    throw new Error(`generated invalid ${kind} id`);
  }
  return id;
}

export function createRandomIdFactory(): IdFactory {
  return {
    evidence: () => randomId("evidence"),
    proof: () => randomId("proof"),
    event: () => randomId("event"),
  };
}

/** Deterministic ids for tests (`evd_m0600000001`, …). */
export function createSequenceIdFactory(tag = "m06"): IdFactory {
  let n = 0;
  const next = (kind: IdKind): string => {
    n += 1;
    const suffix = `${tag}${String(n).padStart(8, "0")}`;
    const id = `${ID_PREFIX[kind]}${suffix}`;
    if (!isValidId(kind, id)) throw new Error(`invalid sequential id ${id}`);
    return id;
  };
  return {
    evidence: () => next("evidence"),
    proof: () => next("proof"),
    event: () => next("event"),
  };
}
