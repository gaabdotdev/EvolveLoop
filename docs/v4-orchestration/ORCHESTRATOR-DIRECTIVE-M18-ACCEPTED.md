# Orchestrator directive — M18 Wave 1 ACCEPTED

**To:** M00 leader (`feature/v4/m00-architecture`)  
**From:** V4 Master Orchestrator  
**When:** 2026-11-15  

M18 Wave 1 threat model is **ACCEPTED** (orchestrator validation). Commits on `feature/v4/m18-security`: `a733630`, `47155ec`.

## Action required before M00 contract freeze

Read (sibling worktree, read-only):

- `/home/gaab/Downloads/EvolveLoop-v4-m18/docs/v4/security/THREAT-MODEL-V4-INITIAL.md` §9
- `/home/gaab/Downloads/EvolveLoop-v4-m18/docs/v4/security/M18-WAVE1-DELIVERY.md` §4

Address as ADRs / contract invariants (no product engines):

1. Capsule ≠ grant (F01)
2. V4 trust-domain ADR vs ADR-V37-0003 (F02)
3. Event semantics identity/order/tamper-evidence (F07)
4. Canonical identifier grammar (F08)
5. Data vs control typing (F12, F09)
6. Multi-tenancy scope ADR (M18 proposes OOS V4.0–V4.2)

Optional: copy the three M18 security docs into this worktree under `docs/v4/security/` for local reference without editing the M18 branch.

Stay in this worktree; do not merge to `feature/v4-integration`.
