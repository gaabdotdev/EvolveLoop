# Agent Registry

## Orchestrator (this session)

| Field | Value |
|-------|-------|
| Role | Master Orchestrator / Program Validator |
| Runtime | Cursor Agent (interactive parent) |
| Implements product? | **No** |
| Coordination root | `docs/v4-orchestration/` |

## Wave 1 specialists

| Agent ID | Meta | Runtime | Model | Worktree | Mode | Status |
|----------|------|---------|-------|----------|------|--------|
| A-M00-1 | M00 | Cursor Task `generalPurpose` | `claude-opus-5-5-medium` | `/home/gaab/Downloads/EvolveLoop-v4-m00` | Task `95cf20e3-…` | FAILED — Opus quota; partial `55a810a` |
| A-M00-1a | M00 | Task subagent contracts | Opus | same | Task `d3d244f4-…` | FAILED — Opus quota |
| A-M00-1b | M00 | Task subagent ADRs | Opus | same | Task `1ee521ac-…` | FAILED — Opus quota |
| A-M00-2 | M00 | Cursor Task `generalPurpose` | `gpt-5.6-sol-medium` | same | Task `0376e09f-…` | FAILED — model quota |
| A-M00-3 | M00 | Cursor Task `generalPurpose` | `claude-sonnet-5-5-high` | `/home/gaab/Downloads/EvolveLoop-v4-m00` | Task `ec2e2c6f-…` | FAILED — Sonnet quota |
| A-M00-4 | M00 | Cursor Task `generalPurpose` | `cursor-grok-4.6-high-fast` | same | Task `768f1aa4-8b46-4f79-a744-8b9edd4ec01c` | COMPLETE — authored `0a88109`–`1dea128`; package ACCEPTED |
| A-M00-5 | M00 | `cursor-agent` CLI | `composer-2.5` | same | killed | STOPPED |
| A-M00-6 | M00 | Cursor Task `generalPurpose` | `gemini-4-hydrogen-high` | same | Task `532fab4b-…` | FAILED — Gemini quota (after package already on branch) |
| A-M00-* | M00 | — | — | tip `1dea128` | — | Package ACCEPTED |
| A-FREEZE-1 | M00 freeze review | Cursor Task | `cursor-grok-4.6-high-fast` | m00 | Task `8cd94458-d2cb-4e30-9f93-79c4b7faeb30` | COMPLETE — **FREEZE_REJECTED** `e1b6764` |
| A-M00-REWORK-1 | M00 freeze rework B1–B3 | Cursor Task | `cursor-grok-4.6-high-fast` | m00 | Task `a76596e8-8786-4138-bcde-102a6ca5384e` | COMPLETE — ACCEPTED rework `af118a0` |
| A-FREEZE-2 | M00 freeze re-review | Cursor Task | `cursor-grok-4.6-high-fast` | m00 | Task `4f992443-cbca-430a-9b36-af6219f34edf` | RUNNING |
| A-M19-1 | M19 Wave1 integrate | Cursor Task | `cursor-grok-4.6-high-fast` | `/home/gaab/Downloads/EvolveLoop-v4-integration` | Task `d1472461-b84a-4b4e-93fd-28a3e93873d6` | COMPLETE — Wave1 ACCEPTED @ `5967f7b` |
| A-M19-2 | M19 Wave2 integrate | Cursor Task | `cursor-grok-4.6-high-fast` | `/home/gaab/Downloads/EvolveLoop-v4-integration` | Task `a67420b0-6f2d-4b26-a0ef-7b2948e8b847` | COMPLETE — Wave2 INTEGRATED @ `d8ab952`; 200/200 |
| A-M19-3 | M19 vertical Intent→WorkProof | Cursor Task | `cursor-grok-4.6-high-fast` | `/home/gaab/Downloads/EvolveLoop-v4-integration` | Task `459d13f9-703e-4263-b345-ce399520d6dd` | COMPLETE — ACCEPTED @ `cf37912`; 202/202 |
| A-M04-1 | M04 Continuity capsule | Cursor Task | `cursor-grok-4.6-high-fast` | `/home/gaab/Downloads/EvolveLoop-v4-m04` | Task `b79ded28-b98b-4460-bf5a-fb2fc5e34efb` | COMPLETE — ACCEPTED @ `14aa02b` |
| A-M05-1 | M05 Timetravel/fork/replay | Cursor Task | `cursor-grok-4.6-high-fast` | `/home/gaab/Downloads/EvolveLoop-v4-m05` | Task `85d22360-efad-45a7-8d82-97c048bbc56b` | COMPLETE — ACCEPTED @ `b27b2cb` |
| A-M19-4 | M19 Wave3 integrate M04/M05 | Cursor Task | `cursor-grok-4.6-high-fast` | `/home/gaab/Downloads/EvolveLoop-v4-integration` | Task `dd8b3b45-3c3c-4ca5-8753-381708174371` | COMPLETE — INTEGRATED @ `3da3af5`; 234/234 |
| A-M19-5 | M19 Continuity vertical gate | Cursor Task | `cursor-grok-4.6-high-fast` | `/home/gaab/Downloads/EvolveLoop-v4-integration` | Task `27547ced-35e8-4c0d-9ccc-a7e2e317f77f` | COMPLETE — ACCEPTED @ `81abcbd`; 236/236 |
| A-M07-1 | M07 Dynamic Planning | Cursor Task | `cursor-grok-4.6-high-fast` | `/home/gaab/Downloads/EvolveLoop-v4-m07` | Task `53020ad6-71ce-44bb-bbd4-98b5f1183b38` | COMPLETE — ACCEPTED @ `0e9b581` |
| A-M08-1 | M08 Capability Intelligence | Cursor Task | `cursor-grok-4.6-high-fast` | `/home/gaab/Downloads/EvolveLoop-v4-m08` | Task `1ccdd7c6-8f00-47c7-9174-581f570f0890` | COMPLETE — ACCEPTED @ `13fac49` |
| A-M19-6 | M19 Wave4 integrate M07/M08 | Cursor Task | `cursor-grok-4.6-high-fast` | `/home/gaab/Downloads/EvolveLoop-v4-integration` | Task `09412815-2697-4f6d-92e9-93b1cc733534` | COMPLETE — INTEGRATED @ `0f7f626`; 284/284 |
| A-M18-1 | M18 | Cursor Task `generalPurpose` | `claude-opus-5-5-medium` | `/home/gaab/Downloads/EvolveLoop-v4-m18` | Task `bd6eecf1-9665-452f-ad08-55df9e01de55` | COMPLETE — Wave 1 ACCEPTED by orchestrator |

### Runtime notes

- `cursor-agent` CLI verified working (`gpt-5.3-codex`, stream-json ping → `M00_PING_OK`).
- First Wave-1 launches via `nohup` + large argv / `claude-opus-5-thinking-high` produced **empty logs and silent exit** — treated as non-viable for this host until investigated.
- Mission allows native subagents; Task tool used with explicit worktree isolation instructions.
- `agy` requires `-p='prompt'` (flag eats following `--model` if ordered wrong).

### Justification

- M00/M18 need high reasoning for contracts/threat modeling → Opus 5.5 medium (best Opus available on Task model allowlist).
- Worktrees disposable/isolated; V3.7 cert untouched.
| A-M17-1 | M17 early benchmarks | Cursor Task | `cursor-grok-4.6-high-fast` | `/home/gaab/Downloads/EvolveLoop-v4-m17` | Task `1dc1e92f-450d-4062-b8d1-bf81697e01ba` | COMPLETE — ACCEPTED @ `69d15ce`; 306/306 |
| A-M19-7 | M19 integrate M17 early | Cursor Task | `cursor-grok-4.6-high-fast` | `/home/gaab/Downloads/EvolveLoop-v4-integration` | Task `de63e3fd-7758-4782-a5a8-308219033683` | COMPLETE — INTEGRATED @ `0daf462` / HEAD `04ed782`; 306/306 |
| A-M11-1 | M11 Provenance Graph | Cursor Task | `cursor-grok-4.6-high-fast` | `/home/gaab/Downloads/EvolveLoop-v4-m11` | Task `7dace8cc-f5a4-4a81-aa6e-020e55d8af76` | COMPLETE — ACCEPTED @ `f1222f6`; 337/337 |
| A-M19-8 | M19 integrate M11 | Cursor Task | `cursor-grok-4.6-high-fast` | `/home/gaab/Downloads/EvolveLoop-v4-integration` | PENDING_LAUNCH | Wave 5 |
