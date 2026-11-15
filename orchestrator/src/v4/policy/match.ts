/**
 * Rule matching + path canonicalization (TM-V4-F14 / RR-W5-04 partial).
 * R13: ALLOW rules may not use `*` on subjects, actions, or resources.
 *
 * Absolute filesystem resources without a glob are resolved with realpath
 * (symlink-aware). Logical resources (`prod`, `network.egress`) stay lexical.
 * This does not close F14: glob prefixes are not realpath'd; V3 `denied_paths`
 * `startsWith` is unchanged.
 */

import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { ExecutorRef, PolicyRule, RiskLevel } from "../contracts/index.js";
import { RISK_RANK } from "./types.js";

export const ALLOW_WILDCARD_DENIED = "INV-POL-04-TIGHT";

/** True when an ALLOW rule uses a wildcard in any selector (freeze R13 tightening). */
export function allowRuleHasWildcard(rule: PolicyRule): boolean {
  if (rule.effect !== "ALLOW") return false;
  return rule.subjects.includes("*") || rule.actions.includes("*") || rule.resources.includes("*");
}

function looksLikeAbsoluteFsPath(value: string): boolean {
  return value.startsWith("/") && !value.includes("*");
}

/** Symlink-aware resolve; fail-closed to undefined on unexpected IO errors. */
function canonicalFsPath(value: string): string | undefined {
  try {
    if (existsSync(value)) return realpathSync(value);
    const parent = dirname(value);
    const base = basename(value);
    if (parent !== value && existsSync(parent)) {
      return join(realpathSync(parent), base);
    }
    return value;
  } catch {
    return undefined;
  }
}

/**
 * Resource strings that cannot be matched safely (path traversal, encoding, NUL).
 * Absolute non-glob paths are realpath'd when the leaf or parent exists.
 * Fail-closed: undefined ⇒ no match ⇒ DENY (deny-by-default).
 */
export function canonicalizeResource(resource: string): string | undefined {
  if (typeof resource !== "string" || resource.length === 0) return undefined;
  if (resource.includes("\0") || resource.includes("%") || resource.includes("\\")) return undefined;
  if (resource.includes("..")) return undefined;
  if (!looksLikeAbsoluteFsPath(resource)) return resource;
  return canonicalFsPath(resource);
}

export function resourceMatches(pattern: string, resource: string): boolean {
  const pat = canonicalizeResource(pattern);
  const res = canonicalizeResource(resource);
  if (!pat || !res) return false;
  if (pat === res) return true;
  if (pat.endsWith("*") && pat.length > 1 && !pat.slice(0, -1).includes("*")) {
    return res.startsWith(pat.slice(0, -1));
  }
  return false;
}

export function subjectMatches(selector: string, subject: ExecutorRef, labels: readonly string[]): boolean {
  if (selector === subject.executor_id) return true;
  if (selector.startsWith("label:")) return labels.includes(selector.slice("label:".length));
  if (selector === "*") return true;
  return false;
}

export function actionMatches(selector: string, action: string): boolean {
  if (selector === action) return true;
  if (selector === "*") return true;
  return false;
}

export function riskWithin(max: RiskLevel | undefined, actual: RiskLevel): boolean {
  if (!max) return true;
  return RISK_RANK[actual] <= RISK_RANK[max];
}

export function ruleMatches(
  rule: PolicyRule,
  input: {
    subject: ExecutorRef;
    action: string;
    resource: string;
    environment: string;
    risk: RiskLevel;
    labels: readonly string[];
    nowMs: number;
  },
): boolean {
  if (allowRuleHasWildcard(rule)) return false;
  const subjectOk = rule.subjects.some((s) => subjectMatches(s, input.subject, input.labels));
  const actionOk = rule.actions.some((a) => actionMatches(a, input.action));
  const resourceOk = rule.resources.some((r) => resourceMatches(r, input.resource));
  if (!subjectOk || !actionOk || !resourceOk) return false;
  const cond = rule.conditions;
  if (!cond) return true;
  if (cond.environments && cond.environments.length > 0 && !cond.environments.includes(input.environment)) {
    return false;
  }
  if (!riskWithin(cond.max_risk, input.risk)) return false;
  if (cond.valid_from && Date.parse(cond.valid_from) > input.nowMs) return false;
  if (cond.valid_until && Date.parse(cond.valid_until) <= input.nowMs) return false;
  return true;
}
