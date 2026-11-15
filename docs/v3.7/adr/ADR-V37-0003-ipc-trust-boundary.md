# ADR-V37-0003 — Coordinator IPC trust boundary (SEC-H02)

**Status:** Accepted  
**Date:** 2026-11-14  
**Relates:** ISSUE-SEC-H02-IPC, AUD-H02-01

## Context

The V3.5 Coordinator exposes a local Unix-domain socket (`ipc.sock`) authenticated by shared tokens on disk (`ipc.token`, `ipc.privileged.token`, mode `0600`). An independent audit correctly observed that any process running as the **same UID** that can read the data-dir can present the privileged token and invoke privileged methods (`tick`, approvals, `shutdown`).

## Decision

EvolveLoop’s local Coordinator IPC is a **single-user trusted-host** control channel:

1. **In scope:** cross-user isolation on multi-user hosts (socket `0600` + token files `0600` + optional `SO_PEERCRED` UID match to the Coordinator process UID).
2. **Out of scope:** mutual distrust between processes that already share the operator UID and filesystem access to the Coordinator data-dir. That class of adversary is treated as **host/session compromise** of the EvolveLoop operator account, not as a fabric multi-tenant boundary.

Capability split (operator vs privileged token), nonce anti-replay, and optional epoch binding remain mandatory **within** that trust domain (least privilege among cooperating tools, not isolation from malware with the same UID).

## Consequences

| Guarantee | Provided? |
|-----------|-----------|
| Other OS users cannot open `ipc.sock` / read tokens (when FS permissions hold) | Yes |
| Same-UID process with data-dir read cannot forge privileged calls | **No** — by design out of scope |
| Privileged methods require privileged token (not operator token) | Yes |
| Replay of privileged requests within TTL window rejected | Yes |
| Cross-node fabric auth (mTLS + session) | Separate plane — not IPC |

Deployments that require isolation between same-UID workloads must not co-locate untrusted code with the Coordinator data-dir; use separate OS users, separate hosts, or external policy (containers with distinct UIDs).

## Alternatives rejected

- **Full same-UID isolation via in-memory-only secrets:** valuable hardening, but does not stop a same-UID debugger/`ptrace`/memfd reader of the Coordinator process; would create a false sense of multi-tenant security.
- **Mandatory abstract-namespace + SCM_RIGHTS only:** deferred; does not change the fundamental same-UID threat without a stronger OS sandbox around the Coordinator itself.
