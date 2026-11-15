# Orchestrator directive — Phase 3 Continuity gate

**When:** after M04 + M05 are orchestrator-ACCEPTED and M19-integrated  
**Purpose:** exit Phase 3 (V4.1) before Adaptive Intel (M07+)

## Required vertical (automated)

```text
Work on M02 ledger
  → M04 seal capsule (allowlist-only)
  → M04 verify/accept (raw INV-CAP-07; grants re-derived; Work from ledger not task_refs)
  → crash/recovery from VERIFIED checkpoint without confirmed-state loss
  → M05 fork at checkpoint (new work_id; no grant inheritance; fork_inherited EXTERNAL)
  → M05 replay RECORDED does not re-dispatch EXTERNAL
```

Optional: M06 proof on forked work remains honest; M12 CE on handoff event.

## Location

`orchestrator/tests/v4/vertical/continuity-handoff.test.ts` (M19 ownership after integrate).

## Non-claims

No absolute replay determinism. No V4 APPROVED (G17). No Impossible Handoff (M16).
