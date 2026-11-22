# LIMITATION — Full SDK publish deferred (M08)

**Status:** deferred  
**Why:** Publishing a public npm SDK freezes contracts before Gate A–J closure and Studio maturity. M08 ships the **in-repo boundary** only.

## What exists instead

- Versioned re-exports in `orchestrator/src/v3/extensions/contracts.ts`
- Extension registry with permissions
- Reference stub installer

## Forbidden claims

- Do not claim `@evolveloop/sdk` is published
- Do not claim hot-pluggable third-party marketplace
