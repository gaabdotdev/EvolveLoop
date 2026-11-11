# ADR-V3-0004 — License hold (no unilateral MIT → noncommercial change)

**Status:** Accepted (hold)  
**Date:** 2026-11-11  
**Related:** Master v0.6 §17.1, §20.8 LICENSE note; `LICENSE` (MIT)

## Context

Product intent in Master v0.6 leans source-available / noncommercial. Repository currently ships MIT. Changing license affects prior contributors, dependents, and dependency compatibility. Master forbids assuming authority to change unilaterally.

## Decision

1. **Do not modify `LICENSE` in V3 implementation cycles** until a separate legal/product decision records:
   - exact commercial restrictions (resale / SaaS / internal commercial use / consulting)
   - contributor relicensing path
   - dependency license compatibility matrix
   - communication to existing users of MIT grants already received
2. Document intent as **pending** in status docs; do not market the tree as noncommercial-licensed while MIT remains.
3. Candidate texts (e.g. PolyForm Noncommercial 1.0.0) stay research-only until approved.

## Consequences

- Engineering continues under MIT.
- Distribution/marketing claims must not contradict `LICENSE`.
