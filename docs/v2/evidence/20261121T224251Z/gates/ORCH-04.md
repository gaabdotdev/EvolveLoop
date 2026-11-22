# ORCH-04

- **STATUS:** PASS_LIVE
- **ts:** 20261121T224251Z
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-orch-04-live-saturation.test.ts`
- **exit:** 0
- **log:** `docs/v2/evidence/20261121T224251Z/raw/ORCH-04.log` / twin `.txt`
## Live asserts
- Saturação rate-limit + memPercent injetada → reduz max_in_progress
- Probe VRAM via sysfs AMD; se ausente VRAM=UNAVAILABLE (critério rate-limit/mem fechado)
- scheduleReadyTasks respeita policy; crash=false
