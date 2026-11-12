# ADR-V35-0001 — Security model & threat boundaries

**Status:** Accepted  
**Date:** 2026-11-12

## Context

V3 CapabilityAuthority provides allow|deny|confirm for engine capabilities but does not confine child processes. V3.5 must enforce least privilege at the execution boundary.

## Decision

- Introduce `SandboxProfile` with filesystem, network, process limits, secrets policy, and capability grants.
- Fail-closed for unknown capabilities.
- `require_os_sandbox=true` blocks execution when no OS backend is available (no silent host fallback).
- Integrate with existing AuthorityContext as a ceiling (narrow only).

## Threat model (summary)

| Threat | Mitigation |
|--------|------------|
| Path traversal / symlink escape | bwrap bind + denied paths; authority path checks |
| TOCTOU on host FS APIs | Prefer sandbox-bound execution over check-then-act on host |
| Network exfiltration | `--unshare-net` default for agent-workspace profile |
| Env/secret leakage | `--clearenv` + allowlist; scoped inject |
| Privilege escalation via sandbox.disable | Denied / require_approval |
| PID reuse kill | `/proc` starttime fencing |

## Trust boundaries

1. Coordinator/harness control plane (trusted).
2. Sandboxed task subprocess (untrusted).
3. Provider/harness process (semi-trusted; separate profile).
4. Human operator via Approval Broker.

## Consequences

- Agents cannot widen grants beyond profile + authority.
- Missing bubblewrap → blocked for OS-required profiles.
