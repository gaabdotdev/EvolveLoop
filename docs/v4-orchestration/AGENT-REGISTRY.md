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
| A-M00-4 | M00 | Cursor Task `generalPurpose` | `cursor-grok-4.6-high-fast` | same | Task `768f1aa4-…` | YIELD — not single-writer |
| A-M00-5 | M00 | `cursor-agent` CLI | `composer-2.5` | same | killed pid 344434 | STOPPED — avoid dual-write |
| A-M00-6 | M00 | Cursor Task `generalPurpose` | `gemini-4-hydrogen-high` | same | Task `532fab4b-…` | FAILED — Gemini quota |
| A-M00-* | M00 | — | — | tip `1dea128` | — | Package ACCEPTED; no further M00 impl agents; freeze-review blocked on quota |
| A-M00-4 | note | Likely completed package under quota churn | grok?/composer? | `0a88109`–`1dea128` | — | Artifacts validated by orchestrator; Gemini `532fab4b` failed after |
| A-M18-1 | M18 | Cursor Task `generalPurpose` | `claude-opus-5-5-medium` | `/home/gaab/Downloads/EvolveLoop-v4-m18` | Task `bd6eecf1-9665-452f-ad08-55df9e01de55` | COMPLETE — Wave 1 ACCEPTED by orchestrator |

### Runtime notes

- `cursor-agent` CLI verified working (`gpt-5.3-codex`, stream-json ping → `M00_PING_OK`).
- First Wave-1 launches via `nohup` + large argv / `claude-opus-5-thinking-high` produced **empty logs and silent exit** — treated as non-viable for this host until investigated.
- Mission allows native subagents; Task tool used with explicit worktree isolation instructions.
- `agy` requires `-p='prompt'` (flag eats following `--model` if ordered wrong).

### Justification

- M00/M18 need high reasoning for contracts/threat modeling → Opus 5.5 medium (best Opus available on Task model allowlist).
- Worktrees disposable/isolated; V3.7 cert untouched.
