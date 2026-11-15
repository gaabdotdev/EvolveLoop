/**
 * In-memory policy store. Epoch bumps on every change/revoke (ADR-V4-0011 / D14).
 * R13 tightening is enforced for ACTIVE policies at load time.
 */

import type { Policy } from "../contracts/index.js";
import { validatePolicy } from "../contracts/index.js";
import { allowRuleHasWildcard } from "./match.js";

export class PolicyLoadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PolicyLoadError";
  }
}

export class PolicyStore {
  private readonly policies = new Map<string, Policy>();

  get(policy_id: string): Policy | undefined {
    return this.policies.get(policy_id);
  }

  put(policy: Policy): Policy {
    const validation = validatePolicy(policy);
    if (!validation.valid) {
      throw new PolicyLoadError("INVALID_POLICY", validation.issues.map((i) => `${i.code}@${i.path}`).join(","));
    }
    if (policy.status === "ACTIVE") {
      const wild = policy.rules.filter(allowRuleHasWildcard);
      if (wild.length > 0) {
        throw new PolicyLoadError(
          "INV-POL-04-TIGHT",
          `ACTIVE ALLOW rules must not use '*' selectors (R13): ${wild.map((r) => r.rule_id).join(",")}`,
        );
      }
    }
    this.policies.set(policy.policy_id, policy);
    return policy;
  }

  /** Immutable replace + epoch bump. */
  revise(policy_id: string, mutate: (current: Policy) => Omit<Policy, "epoch" | "version"> & { version?: number }): Policy {
    const current = this.policies.get(policy_id);
    if (!current) throw new PolicyLoadError("NOT_FOUND", policy_id);
    const nextBase = mutate(current);
    const next: Policy = {
      ...nextBase,
      policy_id: current.policy_id,
      version: nextBase.version ?? current.version + 1,
      epoch: current.epoch + 1,
    };
    return this.put(next);
  }

  bumpEpoch(policy_id: string): Policy {
    return this.revise(policy_id, (c) => ({ ...c, version: c.version }));
  }

  revoke(policy_id: string, revoked_at: string): Policy {
    return this.revise(policy_id, (c) => ({
      ...c,
      version: c.version,
      status: "RETIRED",
      revoked_at,
    }));
  }
}
