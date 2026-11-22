# ADR-V3-0008 — CLI harness drivers (Claude/Codex/Antigravity)

**Status:** Accepted  
**Date:** 2026-11-11  
**Related:** ADR-V3-0007, Adapter contracts, Continuity / cross-provider handoff

## Context

V3.3 requires interoperable agent adapters. Native IDE session injection is not available as a verified Core API for Claude Code / Codex / Antigravity. Claude Code CLI is present on the reference host; Codex and Antigravity may be absent.

## Decision

1. Probe harness CLIs on PATH (`cli-probe`).
2. When present, expose a `CliProcessAdapterDriver` that:
   - **dry-run / mock (default):** writes a handoff prompt under `--data-dir/harness-prompts` and records a process-session with status `dry_run` — no network call.
   - **real:** only when `provider_mode=real` **and** `EVOLVELOOP_HARNESS_CONSENT=true`, spawn the CLI and track PID for Core-owned cancel.
3. When CLI absent → `BlockedAdapterDriver` (fail-closed).
4. Cross-provider `applyCrossProvider` may set `auto_swap=true` only after Continuity ownership transfer + provider rebind; harness invoke remains dry-run unless consent gates pass.

## Consequences

- Honest `can_invoke` reflects local CLI presence.
- Tests do not require paid API calls.
- Operators must explicitly consent before Core spawns network-capable harness processes.
- IDE chat cancel remains host-owned; Core cancels only process-sessions it spawned.
