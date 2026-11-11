# ADR-V3-0005 — OmniRoute investigation hold

**Status:** Accepted (investigation hold)  
**Date:** 2026-11-11  
**Related:** Master v0.6 §7.5 / §9; Model Catalog; OpenRouter Jev client

## Context

OmniRoute is described as a candidate gateway for local/free/paid inference providers. Product text must not treat it as a guaranteed free quota or a default remote path.

## Decision

1. **Do not** make OmniRoute a Core dependency or silent default in V3.2.
2. Model Catalog + deterministic routing remain the local-first path.
3. Remote decision models (OpenRouter Jev-style) require **API key + explicit consent** (`consent=true` / env gates). No project payload without both.
4. OmniRoute integration stays `NOT_IMPLEMENTED` until a verified adapter exists with:
   - documented auth model
   - fail-closed behaviour when upstreams are unavailable
   - no invented availability/quota claims
5. Investigation notes may live under `docs/v3/` / research; shipping claims require tests + ownership update.

## Consequences

- Operators can use Ollama locally without OmniRoute.
- Free/remote catalogues remain optional and operator-driven.
- Status vocabulary: OmniRoute = `NOT_IMPLEMENTED` (investigated, held).
