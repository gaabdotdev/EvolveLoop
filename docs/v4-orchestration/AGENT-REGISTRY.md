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
| A-M18-1 | M18 | Cursor Task `generalPurpose` | `claude-opus-5-5-medium` | `/home/gaab/Downloads/EvolveLoop-v4-m18` | Task `bd6eecf1-9665-452f-ad08-55df9e01de55` | COMPLETE — Wave 1 ACCEPTED by orchestrator |

### Runtime notes

- `cursor-agent` CLI verified working (`gpt-5.3-codex`, stream-json ping → `M00_PING_OK`).
- First Wave-1 launches via `nohup` + large argv / `claude-opus-5-thinking-high` produced **empty logs and silent exit** — treated as non-viable for this host until investigated.
- Mission allows native subagents; Task tool used with explicit worktree isolation instructions.
- `agy` requires `-p='prompt'` (flag eats following `--model` if ordered wrong).

### Justification

- M00/M18 need high reasoning for contracts/threat modeling → Opus 5.5 medium (best Opus available on Task model allowlist).
- Worktrees disposable/isolated; V3.7 cert untouched.
