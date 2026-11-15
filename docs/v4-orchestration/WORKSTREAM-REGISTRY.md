# Workstream Registry

States: `PENDING` | `DISCOVERY` | `CONTRACT_REVIEW` | `READY` | `RUNNING` | `REVIEW` | `REWORK` | `ACCEPTED` | `INTEGRATED` | `BLOCKED`

| Meta | Name | Phase | Branch | Worktree | Owner runtime | Status | Notes |
|------|------|-------|--------|----------|---------------|--------|-------|
| M00 | Architecture & Domain Contracts | 1 | `feature/v4/m00-architecture` | `/home/gaab/Downloads/EvolveLoop-v4-m00` | rework `a76596e8-…` | **FROZEN** | `CONTRACT-FREEZE.md` @ `e4fb8ad`; R1–R16 binding |
| M01 | Goal Compiler & Work State | 2 | `feature/v4/m01-goal-work` | `/home/gaab/Downloads/EvolveLoop-v4-m01` | — | **INTEGRATED** | tip `f72ad76` → `e815407` |
| M02 | Event Ledger, Persistence & Checkpoints | 2 | `feature/v4/m02-ledger-checkpoints` | `/home/gaab/Downloads/EvolveLoop-v4-m02` | — | **INTEGRATED** | tip `374769d` → `780a622` |
| M03 | Effect Ledger | 2→3 | `feature/v4/m03-effect-ledger` | `/home/gaab/Downloads/EvolveLoop-v4-m03` | — | **INTEGRATED** | tip `91dbdf3` → `d2c85d6` |
| M04 | Capsule, Handoff & Recovery | 3 | `feature/v4/m04-continuity` | `/home/gaab/Downloads/EvolveLoop-v4-m04` | Task `b79ded28-…` | **INTEGRATED** | tip `14aa02b` → `26831b0` |
| M05 | Time Travel, Replay & Fork | 3 | `feature/v4/m05-timetravel` | `/home/gaab/Downloads/EvolveLoop-v4-m05` | Task `85d22360-…` | **INTEGRATED** | tip `b27b2cb` → `33229c5` |
| M06 | WorkProof & Independent Verifier | 2→6 | `feature/v4/m06-workproof-min` | `/home/gaab/Downloads/EvolveLoop-v4-m06` | — | **INTEGRATED** | tip `2728695` → `8c801ae` |
| M07 | Dynamic Planning Engine | 4 | `feature/v4/m07-planning` | `/home/gaab/Downloads/EvolveLoop-v4-m07` | Task `53020ad6-…` | **INTEGRATED** | tip `0e9b581` → `cfead01` |
| M08 | Capability Intelligence | 4 | `feature/v4/m08-capability` | `/home/gaab/Downloads/EvolveLoop-v4-m08` | Task `1ccdd7c6-…` | **INTEGRATED** | tip `13fac49` → `07bd808`; methodology PROVISIONAL |
| M09 | Adaptive Execution Intelligence | 4 | — | — | — | **BLOCKED** | wait methodology ACCEPTED + observed baseline |
| M10 | Policy Engine, Trust & Governance | 2→5 | `feature/v4/m10-policy-foundations` | `/home/gaab/Downloads/EvolveLoop-v4-m10` | — | **INTEGRATED** | tip `78fa4bc` → `32ec793` |
| M11 | Trust & Provenance Graph | 5 | `feature/v4/m11-provenance` | `/home/gaab/Downloads/EvolveLoop-v4-m11` | — | **READY** | Wave 5 first cut |
| M12 | Predictive Observability & CE | 2→7 | `feature/v4/m12-obs-init` | `/home/gaab/Downloads/EvolveLoop-v4-m12` | — | **INTEGRATED** | tip `72c5f5b` → `df4fbf4` |
| M13 | Elastic Compute Fabric | 7 | — | — | — | PENDING | |
| M14 | Agent & Runtime Ecosystem | 7 | — | — | — | PENDING | No marketplace |
| M15 | Control Center, CLI, SDK & APIs | 2→7 | — | — | — | PENDING | CLI early |
| M16 | Autonomous Engineering & Impossible Handoff | 6 | — | — | — | PENDING | |
| M17 | Benchmarks & Economic Proof | cross | `feature/v4/m17-benchmarks-early` | reclaimable | Task `1dc1e92f-…` | **INTEGRATED** | tip `69d15ce` → `0daf462`; baseline DECLARED_UNAVAILABLE |
| M18 | Security & Adversarial Assurance | cross | `feature/v4/m18-security` | `/home/gaab/Downloads/EvolveLoop-v4-m18` | Task `bd6eecf1-…` | **INTEGRATED** (Wave 1) | Tip `47155ec` → `2fc17c2`; later waves PENDING |
| M19 | Integration & Release | 8 | `feature/v4-integration` | `/home/gaab/Downloads/EvolveLoop-v4-integration` | Task `de63e3fd-…` | **INTEGRATED** M17 | HEAD `04ed782`; 306/306; Wave5 next |
| M20 | Independent Final Audit | 8 | — | — | — | PENDING | Separate context |

## Ownership roots (initial — M00 must refine)

| Area | Provisional owner |
|------|-------------------|
| `docs/v4/architecture/**`, `docs/v4/adr/**`, `docs/v4/contracts/**` | M00 |
| `docs/v4/security/**` | M18 (findings); owners fix code |
| `docs/v4-orchestration/**` | Orchestrator |
| `orchestrator/src/v4/**` (to be created by M00 layout) | Split per meta after ownership map |
| V3.7 fabric/registry/protocol/workers | **Do not modify** — adapters only |
