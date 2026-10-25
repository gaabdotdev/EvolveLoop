/**
 * Test Suite: Scope Enforcer & TruthFence - UKS Core V2.5
 * Tests Default-Closed confinement, boolean pre-filtering,
 * TruthFence authority tiers, and adversarial attack scenarios X01 to X06.
 */

import { describe, it, expect } from "vitest";
import { assertPathConfined } from "../../../src/knowledge/uks/storage-core.js";
import {
    resolveProjectScopeId,
    normalizeProjectRoot,
    isScopeAllowed,
    preFilterByScope,
    detectCanaryLeak,
    assertZeroCanaryLeak,
    applyTruthFence,
    ScopeEnforcer,
    ScopedKnowledgeItem
} from "../../../src/knowledge/uks/scope-enforcer";

describe("UKS Scope Enforcer & TruthFence", () => {
    const projectRootA = "/mock-workspaces/project-alpha";
    const projectRootB = "/mock-workspaces/project-beta";
    const scopeA = resolveProjectScopeId(projectRootA);
    const scopeB = resolveProjectScopeId(projectRootB);

    describe("Deterministic Scope Resolution", () => {
        it("should generate stable 16-hex project scope IDs", () => {
            const s1 = resolveProjectScopeId("/mock-workspaces/project-alpha");
            const s2 = resolveProjectScopeId("/mock-workspaces/project-alpha/");
            expect(s1).toBe(s2);
            expect(s1).toMatch(/^project:[a-f0-9]{16}$/);
            expect(s1).not.toBe(scopeB);
        });
    });

    describe("TruthFence 4-Tier Authority Filtering", () => {
        it("should prioritize Tier 0 Code over Tier 1 Docs and Tier 2 Vault", () => {
            const items: ScopedKnowledgeItem[] = [
                {
                    id: "item-vault",
                    topic_key: "auth_token_expiry",
                    scope: "global",
                    tier: "vault",
                    status: "active",
                    content: "Token expires in 30 days (corporate policy).",
                    file_path: "vault/auth.md"
                },
                {
                    id: "item-code",
                    topic_key: "auth_token_expiry",
                    scope: scopeA,
                    tier: "code",
                    status: "active",
                    content: "export const TOKEN_EXPIRY = 3600; // 1 hour in code",
                    file_path: "src/auth/constants.ts"
                },
                {
                    id: "item-ai",
                    topic_key: "auth_token_expiry",
                    scope: scopeA,
                    tier: "ai",
                    status: "active",
                    content: "Local documentation: token expires in 2 hours.",
                    file_path: ".ai/pages/auth.md"
                }
            ];

            const result = applyTruthFence(items);
            expect(result.accepted.length).toBe(1);
            expect(result.accepted[0].tier).toBe("code");
            expect(result.accepted[0].id).toBe("item-code");
            expect(result.rejected.length).toBe(2);
        });

        it("should reject items marked as obsoleto", () => {
            const items: ScopedKnowledgeItem[] = [
                {
                    id: "stale-doc",
                    topic_key: "payment_gateway",
                    scope: scopeA,
                    tier: "ai",
                    status: "obsoleto",
                    content: "Stale PayPal integration.",
                    file_path: ".ai/pages/payments.md"
                }
            ];

            const result = applyTruthFence(items);
            expect(result.accepted.length).toBe(0);
            expect(result.rejected.length).toBe(1);
            expect(result.rejected[0].reason).toBe("obsolete_status_rejected");
        });
    });

    describe("Adversarial Scenarios (X01 to X06)", () => {
        it("X01: Project A attempts to read Project B secret -> MUST BE BLOCKED", () => {
            const enforcerA = new ScopeEnforcer(projectRootA);
            const items: ScopedKnowledgeItem[] = [
                {
                    id: "secret-b",
                    topic_key: "api_key",
                    scope: scopeB, // Scoped to Project B!
                    tier: "code",
                    status: "active",
                    content: "PROJECT_B_STRIPE_SECRET_KEY=sk_live_xyz999",
                    file_path: "config/secrets.env"
                }
            ];

            const result = enforcerA.enforce(items, { allowGlobal: true });
            expect(result.accepted.length).toBe(0);
            expect(result.rejected.length).toBe(1);
            expect(result.rejected[0].reason).toContain("scope_confinement_violation");
        });

        it("X02: Partial directory prefix collision -> MUST GENERATE DIFFERENT SCOPES", () => {
            const rootTarget = "/mock-workspaces/project";
            const rootColliding = "/mock-workspaces/project-rogue";

            const sTarget = resolveProjectScopeId(rootTarget);
            const sColliding = resolveProjectScopeId(rootColliding);

            expect(sTarget).not.toBe(sColliding);
            expect(isScopeAllowed(sColliding, sTarget, false)).toBe(false);
        });

        it("X03: Directory traversal injection in path -> MUST THROW SANITIZATION ERROR", () => {
            const maliciousPath = "/mock-workspaces/project-alpha/../../etc/shadow";

            expect(() => assertPathConfined(maliciousPath, projectRootA)).toThrow("SECURITY_PATH_TRAVERSAL_VIOLATION");
        });

        it("X04: 100% textual match against foreign project -> MUST BE VETOED BY PRE-FILTER", () => {
            const enforcerA = new ScopeEnforcer(projectRootA);
            const foreignItem: ScopedKnowledgeItem = {
                id: "exact-match-b",
                topic_key: "database_schema",
                scope: scopeB,
                tier: "code",
                status: "active",
                content: "CRITICAL REPOSITORY ARCHITECTURE EXACT MATCH FOR USER QUERY",
                file_path: "src/db.ts"
            };

            const filtered = preFilterByScope([foreignItem], enforcerA.getScopeId(), true);
            expect(filtered.accepted.length).toBe(0);
            expect(filtered.discardedCount).toBe(1);
        });

        it("X05: Foreign Canary token injection -> MUST THROW SECURITY EXCEPTION", () => {
            const enforcerA = new ScopeEnforcer(projectRootA);
            const canarySecret = "CANARY_TOKEN_PROJECT_B_SECRET_XYZ";
            enforcerA.registerForeignCanary(canarySecret);

            const taintedPayload = `Context Pack: Injected snippet containing ${canarySecret} leaking from memory.`;

            expect(() => {
                enforcerA.enforce([], { serializedBundleText: taintedPayload });
            }).toThrow("SECURITY_LEAK_PREVENTED");
        });

        it("X06: Query to global scope retrieves public packs without exposing private items", () => {
            const enforcerA = new ScopeEnforcer(projectRootA);
            const mixedItems: ScopedKnowledgeItem[] = [
                {
                    id: "global-pack",
                    topic_key: "security_standards",
                    scope: "global",
                    tier: "vault",
                    status: "active",
                    content: "Global corporate security checklist.",
                    file_path: "packs/security.md"
                },
                {
                    id: "private-b",
                    topic_key: "project_b_internals",
                    scope: scopeB,
                    tier: "code",
                    status: "active",
                    content: "Private proprietary algorithm.",
                    file_path: "src/algo.ts"
                }
            ];

            const result = enforcerA.enforce(mixedItems, { allowGlobal: true });
            expect(result.accepted.length).toBe(1);
            expect(result.accepted[0].id).toBe("global-pack");
            expect(result.rejected.find(r => r.item.id === "private-b")).toBeDefined();
        });
    });
});
