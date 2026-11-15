# Wave 2 launch checklist (orchestrator)

Run only after `M00-FREEZE-REVIEW-2.md` is `FREEZE_APPROVED` or `FREEZE_APPROVED_WITH_RESERVATIONS` and orchestrator stamps `CONTRACT-FREEZE.md`.

1. M19: merge M00 freeze tip into `feature/v4-integration`
2. FF Wave 2 worktrees to new integration HEAD
3. Stamp `docs/v4/architecture/CONTRACT-FREEZE.md` (FROZEN + tip hash + reservations)
4. Launch in parallel (Grok or available model), one agent per worktree:
   - M01 `EvolveLoop-v4-m01` ← `M01-MISSION.md`
   - M02 `EvolveLoop-v4-m02` ← `M02-MISSION.md`
   - M03 `EvolveLoop-v4-m03` ← `M03-MISSION.md`
   - M06 `EvolveLoop-v4-m06` ← `M06-MISSION.md`
   - M10 `EvolveLoop-v4-m10` ← `M10-MISSION.md`
   - M12 `EvolveLoop-v4-m12` ← `M12-MISSION.md`
5. Concurrency: prefer 3+3 waves if disk/quota tight (disk ~2 GiB free)
6. Do not launch M04+ until V4.0 vertical slice green
