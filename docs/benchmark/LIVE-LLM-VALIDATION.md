# Live LLM Validation Path

## Purpose

Complement the V3 deterministic solvers with a path that:

1. Uses real LLM harnesses when consent + auth exist.
2. Never applies `DETERMINISTIC_SOLVER` for “live” code mutations.
3. Separates worker and reviewer into distinct sessions/agents.
4. Supports recovery/handoff before substitute continuation.
5. Keeps deterministic `evaluateVerifiedTrueFullPass` as the authority for `TRUE_FULL_PASS`.

## Modes

| Mode | Condition | Behavior |
|------|-----------|----------|
| `LIVE` | `EVOLVELOOP_HARNESS_CONSENT=true` + authenticated provider | Real Claude `-p` worker + reviewer |
| `DRY_PLUMBING` | Auth present, consent false | Prompt packages written; no live spawn |
| `BLOCKED` | No auth / no consent | Records blockers; no TRUE_FULL_PASS |

## CLI

```bash
evolve eval live-readiness --data-dir ./data
evolve eval live-suite --data-dir ./data [--repo-root ..]
```

## What is NOT claimed when BLOCKED

- Autonomy of LLM engineering
- Live cost/token economy
- Independent LLM review quality on real diffs
- Recovery of LLM-produced work (only handoff plumbing + partial marker)

## Relationship to V3_COMPLETE

Historical V3 freeze remains valid for Core + deterministic generalization.
This path is a **complementary** capability gate under `docs/benchmark/`.
