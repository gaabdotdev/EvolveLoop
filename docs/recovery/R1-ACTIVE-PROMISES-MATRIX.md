# R1 — Active Promises Matrix (freeze)

**Baseline code:** `6dee950` on `recovery/pre-v37-cert`  
**V3.7 fabric:** tracked separately (`c89949a`); not used to satisfy pre-V3.7 FAILs.  
**Source of truth for counts:** `MASTER-REQUIREMENTS-REGISTER.md` (62 IDs).

## Classes

| Class | Meaning |
|-------|---------|
| ORIGINAL_EVOLVELOOP | Promised under EvolveLoop public/V3 definition |
| INHERITED | Present via MegaBrain/GaabType ancestry; not auto-attributed |
| ADAPTED | Inherited + changed for EvolveLoop |
| REIMPLEMENTED | Rebuilt under EvolveLoop contracts |
| REPLACED | Intent preserved by named substitute |
| UNKNOWN_ORIGIN | Provenance unclear — do not treat as PASS |

## Status freeze rules

- `DOC_PASS` ≠ `PASS`
- `SUPERSEDED` must name substitute
- `DEPRECATED` needs recorded decision (V21-001, V23-003)
- `UNKNOWN` (malformed rows / incomplete auditor columns) → reclassify in remediation, never hide FAIL
- V3.7 requirements are **additional** and listed under Gate G9–G17; they do not rewrite V0–V3.6 FAIL

## Bucket summary (from R0)

| Status | Count | Certification impact |
|--------|------:|----------------------|
| PASS | 4 | Keep; revalidate on integrated tip |
| PARTIAL | 5 | Remediate or accept as CONDITIONAL only if non-mandatory |
| FAIL | 5 | Must remediate for TRUE_FULL_PASS |
| UNVERIFIED | 39 | Validate; implement only if lacuna confirmed |
| SUPERSEDED | 1 | Point to substitute |
| DEPRECATED | 2 | Decision recorded |
| UNKNOWN | 6 | Reclassify |
| **Total** | **62** | |

## Active mandatory themes (not exhaustive IDs)

1. Public `/evolve` honesty / dual control plane (PUB-001)
2. Security: ApprovalBroker, sandbox, path confinement, approvals
3. Core: Goal Contract, Grill-Me, planner, TaskGraph, TRUE_FULL_PASS evidence
4. Runtime V3.5 + GlobalOps V3.6 on **same tip**, functionally revalidated
5. Measurement Plane wired + provenance classes
6. Hard gates: wiki / grill-me / image-to-code / Graphify never empty-PASS
7. V3.7 fabric multi-host (separate; currently BLOCKED if no second host)

## Explicit non-goals / not mandatory without acceptance

- Speculative ideas never accepted as product commitment
- OmniRoute as free-provider guarantee
- Exactly-once distributed delivery
- MegaBrain brand capabilities without EvolveLoop evidence

## Next

R2 remediations on this branch; update `REQUIREMENT-TRACEABILITY.md` per commit.
