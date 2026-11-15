# ADR-V4-0015 — Canonical identifier grammar

| Field | Value |
|-------|-------|
| Status | PROPOSED-DEFAULT |
| Date | 2026-11-15 |
| Meta | M00 (grammar); M02/M15 (enforcement at stores and API) |
| Constitution | §5 identity; §9.2 filesystem control |
| M18 | **TM-V4-F08** |
| Contracts | `common.ts` `ID_PREFIX`, `ID_SUFFIX`, `isValidId` |

## Context

V3 stores join `workId` into paths without a shared validator (`event-log`, `work-ledger`, `idempotency`, `approvals`). F08: ids from API/capsule/worker can traverse out of the store root.

Timestamps must not be used as identity or order keys (ADR-V4-0003).

## Decision

1. **Single grammar** for all V4 ids: `PREFIX + SUFFIX` where
   - PREFIX is from `ID_PREFIX` (e.g. `work_`, `evt_`, `capsule_`);
   - SUFFIX matches `^[A-Za-z0-9][A-Za-z0-9_-]{5,127}$`.
2. The charset **cannot represent** `/`, `\\`, `.`, `%`, NUL, spaces, or `..`. `isValidId` additionally rejects those substrings.
3. **Every trust boundary** (HTTP API, IPC, capsule parse, worker message, CLI arg) MUST call `isValidId(kind, value)` **before** the value reaches a store or a filesystem path. Stores refuse ids outside the grammar (M02).
4. Opaque suffix: UUIDv7 or ULID recommended; not required. Hyphens allowed; dots not.
5. **Ordering** is `WorkEvent.seq`, never the id and never `occurred_at`.
6. `tenant_id` is not an id-kind in this grammar; it is the constant `"local"` (ADR-V4-0014).

## Consequences

- Tests pin traversal attacks (`../`, absolute, encoded, NUL, overlong) as rejected for every prefix.
- V3 ids imported through adapters must be rewritten into this grammar or rejected.

## Alternatives rejected

- **UUIDs only, no prefix:** mixed files in one directory; weaker grep/ops.
- **Allow `.` for "human" slugs:** path-like ids (`..`, `.git`) return.
- **Per-store validators:** V3 failure mode (F08).
