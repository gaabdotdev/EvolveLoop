# ADR-V4-0001 — Contract versioning and stability

| Field | Value |
|-------|-------|
| Status | PROPOSED-DEFAULT |
| Date | 2026-11-15 |
| Meta | M00 |
| Constitution | §5 (versioned concepts), §6.1, §16.1 |
| Contracts | `catalog.ts`, every `*_SCHEMA_VERSION` |

## Context

Shared V4 contracts must evolve without silent breakage. Constitution examples are non-final (OD-007). Consumers (M01–M20) need a single rule for compatibility, deprecation and freeze.

## Decision

1. Every persisted/transferred object carries `kind` + `schema_version` (semver).
2. **Catalog** `CONTRACT_CATALOG` (v1.0.0) is the registry: kind → version, producer meta, stability, validator.
3. Stability: `PROPOSED` (this wave) → `FROZEN` after orchestrator ACCEPTED + independent architecture review → `DEPRECATED` with a successor.
4. Compatibility: same **major** is readable (`isReadableVersion`). Minors add optional fields only. Readers **must ignore** unknown optional fields for *readability* (do not fail the schema solely because a newer minor added a key). Ignoring is **not** forwarding: unknown keys MUST NOT become authority, control instructions, or executor context. ExecutionCapsule `seal`/`accept` MUST allowlist-parse known fields (ADR-V4-0006, INV-CAP-07). Incompatible changes = major bump **or** new `type_version` on events.
5. Adding a contract kind or event type = catalog minor. Removing a kind = major + deprecation ADR.
6. After freeze, semantic changes require an RFC that names the ADR it supersedes. Experimental events use `x.<meta>.<name>` and are non-authoritative.

## Consequences

- Consumers import `orchestrator/src/v4/contracts/index.ts` and call `assertConforms`.
- No dual schema sources (no parallel JSON Schema as authority). Markdown in `docs/v4/contracts/` is documentation of the TS source of truth.
- Contract tests pin current majors at `1.0.0`.

## Alternatives rejected

- **JSON Schema as sole authority:** TS validators encode invariants (hash chain, independence, secret scan) that JSON Schema cannot. JSON Schema may be generated later (M15) from TS, not the reverse.
- **CalVer:** semver matches the "same major is readable" rule already used in V3 contracts.

## Residual uncertainty

Exact RFC template for freeze is M19/orchestrator process, not a V4 runtime API.
