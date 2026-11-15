# META M19 — Wave 1 integration (M00 + M18)

You are the **Integration & Release Engineering** leader (M19) for EvolveLoop V4.

## Environment

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-integration` |
| Branch | `feature/v4-integration` |
| Baseline | provisional `03937c1` (V3.7 **BLOCKED** G17 — never claim APPROVED) |
| Disk | ~99% full — no `npm install`; keep symlink `node_modules` |

## Authority

- You are the **only** meta allowed to merge accepted meta branches into `feature/v4-integration`.
- Do **not** rewrite domain contracts; if conflict is semantic, return to owner meta.
- Do **not** edit `recovery/v37-full-cert` or V3.7 evidence.
- Orchestrator already **ACCEPTED**:
  - M00 tip `1dea128` on `feature/v4/m00-architecture`
  - M18 Wave 1 tip `47155ec` on `feature/v4/m18-security`

## Job (this launch)

1. Merge (or cherry-pick equivalent) **ACCEPTED** commits from M00 and M18 into `feature/v4-integration`.
2. Resolve only composition conflicts (paths, imports, docs index). Domain disputes → stop and report to orchestrator with evidence.
3. Ensure `orchestrator/src/v4/contracts/**`, `docs/v4/{architecture,adr,contracts}/**`, `docs/v4/security/**` land coherently.
4. Run `cd orchestrator && npx vitest run tests/v4` after merge — expect 23+ pass.
5. Update `docs/v4-orchestration/INTEGRATION-STATUS.md` with integrated commits and commands.
6. Commit on `feature/v4-integration` only.

## Out of scope

- Freezing contracts (orchestrator + freeze reviewer).
- Starting M01–M12 implementation.
- Product engines.

## Delivery

Report: merge commit hash(es), test results, conflicts deferred, limitations.
