/**
 * Extra-conservative honesty guards (TM-V4-F16 / F09).
 * The frozen validators already reject self-trust field names; M06 additionally
 * refuses confidence constants so they cannot be treated as proof.
 */

import { FORBIDDEN_SELF_TRUST_FIELDS, isRecord } from "../contracts/index.js";
import { InvalidEvidenceError } from "./errors.js";

const CONFIDENCE_POISON = ["confidence", "confidence_score", "TRUE_PASS", "numeric_confidence"] as const;

export function rejectProofPoison(value: unknown, label: string): void {
  const names = new Set<string>([...FORBIDDEN_SELF_TRUST_FIELDS, ...CONFIDENCE_POISON]);
  const seen = new WeakSet<object>();
  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (!isRecord(node)) return;
    for (const [key, child] of Object.entries(node)) {
      const childPath = path ? `${path}.${key}` : key;
      if (names.has(key)) {
        throw new InvalidEvidenceError(`${label} carries forbidden proof-poison field "${key}" at ${childPath} (TM-V4-F16/F09)`);
      }
      walk(child, childPath);
    }
  };
  walk(value, "");
}
