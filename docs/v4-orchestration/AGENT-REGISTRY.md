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
| A-M00-1 | M00 | Cursor Task `generalPurpose` | `claude-opus-5-5-medium` | `/home/gaab/Downloads/EvolveLoop-v4-m00` | background Task `95cf20e3-24bd-4a3f-9036-585bfd085457` | RUNNING |
| A-M18-1 | M18 | Cursor Task `generalPurpose` | `claude-opus-5-5-medium` | `/home/gaab/Downloads/EvolveLoop-v4-m18` | background Task `bd6eecf1-9665-452f-ad08-55df9e01de55` | RUNNING |

### Runtime notes

- `cursor-agent` CLI verified working (`gpt-5.3-codex`, stream-json ping → `M00_PING_OK`).
- First Wave-1 launches via `nohup` + large argv / `claude-opus-5-thinking-high` produced **empty logs and silent exit** — treated as non-viable for this host until investigated.
- Mission allows native subagents; Task tool used with explicit worktree isolation instructions.
- `agy` requires `-p='prompt'` (flag eats following `--model` if ordered wrong).

### Justification

- M00/M18 need high reasoning for contracts/threat modeling → Opus 5.5 medium (best Opus available on Task model allowlist).
- Worktrees disposable/isolated; V3.7 cert untouched.
