# Workstream Registry

States: `PENDING` | `DISCOVERY` | `CONTRACT_REVIEW` | `READY` | `RUNNING` | `REVIEW` | `REWORK` | `ACCEPTED` | `INTEGRATED` | `BLOCKED`

| Meta | Name | Phase | Branch | Worktree | Owner runtime | Status | Notes |
|------|------|-------|--------|----------|---------------|--------|-------|
| M00 | Architecture & Domain Contracts | 1 | `feature/v4/m00-architecture` | `/home/gaab/Downloads/EvolveLoop-v4-m00` | rework `a76596e8-…` | **FROZEN** | `CONTRACT-FREEZE.md` @ `e4fb8ad`; R1–R16 binding |
| M01 | Goal Compiler & Work State | 2 | `feature/v4/m01-goal-work` | `/home/gaab/Downloads/EvolveLoop-v4-m01` | — | **ACCEPTED** | tip `f72ad76`; 44/44 |
| M02 | Event Ledger, Persistence & Checkpoints | 2 | `feature/v4/m02-ledger-checkpoints` | `/home/gaab/Downloads/EvolveLoop-v4-m02` | — | **ACCEPTED** | tip `374769d`; 66/66 |
| M03 | Effect Ledger | 2→3 | `feature/v4/m03-effect-ledger` | `/home/gaab/Downloads/EvolveLoop-v4-m03` | — | **ACCEPTED** | tip `91dbdf3`; 54/54 |
| M04 | Capsule, Handoff & Recovery | 3 | — | — | — | PENDING | |
| M05 | Time Travel, Replay & Fork | 3 | — | — | — | PENDING | |
| M06 | WorkProof & Independent Verifier | 2→6 | `feature/v4/m06-workproof-min` | `/home/gaab/Downloads/EvolveLoop-v4-m06` | — | **ACCEPTED** | tip `2728695`; 54/54 |
| M07 | Dynamic Planning Engine | 4 | — | — | — | PENDING | |
| M08 | Capability Intelligence | 4 | — | — | — | PENDING | |
| M09 | Adaptive Execution Intelligence | 4 | — | — | — | PENDING | |
| M10 | Policy Engine, Trust & Governance | 2→5 | `feature/v4/m10-policy-foundations` | `/home/gaab/Downloads/EvolveLoop-v4-m10` | — | **ACCEPTED** | tip `78fa4bc`; 63/63 |
| M11 | Trust & Provenance Graph | 5 | — | — | — | PENDING | |
| M12 | Predictive Observability & CE | 2→7 | `feature/v4/m12-obs-init` | `/home/gaab/Downloads/EvolveLoop-v4-m12` | — | **ACCEPTED** | tip `72c5f5b`; 59/59 |
| M13 | Elastic Compute Fabric | 7 | — | — | — | PENDING | |
| M14 | Agent & Runtime Ecosystem | 7 | — | — | — | PENDING | No marketplace |
| M15 | Control Center, CLI, SDK & APIs | 2→7 | — | — | — | PENDING | CLI early |
| M16 | Autonomous Engineering & Impossible Handoff | 6 | — | — | — | PENDING | |
| M17 | Benchmarks & Economic Proof | cross | — | — | — | PENDING | |
| M18 | Security & Adversarial Assurance | cross | `feature/v4/m18-security` | `/home/gaab/Downloads/EvolveLoop-v4-m18` | Task `bd6eecf1-…` | **INTEGRATED** (Wave 1) | Tip `47155ec` → `2fc17c2`; later waves PENDING |
| M19 | Integration & Release | 8 | `feature/v4-integration` | `/home/gaab/Downloads/EvolveLoop-v4-integration` | Task `a67420b0-…` | **RUNNING** Wave2 merge | Wave1 done; integrating 6 ACCEPTED tips |
| M20 | Independent Final Audit | 8 | — | — | — | PENDING | Separate context |

## Ownership roots (initial — M00 must refine)

| Area | Provisional owner |
|------|-------------------|
| `docs/v4/architecture/**`, `docs/v4/adr/**`, `docs/v4/contracts/**` | M00 |
| `docs/v4/security/**` | M18 (findings); owners fix code |
| `docs/v4-orchestration/**` | Orchestrator |
| `orchestrator/src/v4/**` (to be created by M00 layout) | Split per meta after ownership map |
| V3.7 fabric/registry/protocol/workers | **Do not modify** — adapters only |
