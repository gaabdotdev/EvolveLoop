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
| A-M00-1 | M00 | `cursor-agent` | `claude-opus-5-thinking-high` (fallback: `gpt-5.6-sol-xhigh`) | `/home/gaab/Downloads/EvolveLoop-v4-m00` | `--yolo --trust --workspace` | LAUNCHING |
| A-M18-1 | M18 | `cursor-agent` | `claude-opus-5-thinking-high` (fallback: `gpt-5.6-sol-high`) | `/home/gaab/Downloads/EvolveLoop-v4-m18` | `--yolo --trust --workspace` | LAUNCHING |

### Justification

- M00/M18 require high reasoning for contracts, invariants, threat modeling.
- Disposable worktrees only for `--yolo`.
- Subagents expected inside each leader for review independence.

### Launch commands (record actual after start)

```bash
# M00
cd /home/gaab/Downloads/EvolveLoop-v4-m00
cursor-agent --yolo --trust --workspace /home/gaab/Downloads/EvolveLoop-v4-m00 \
  --model claude-opus-5-thinking-high \
  -p --output-format text "$(cat docs/v4-orchestration/prompts/M00-MISSION.md)"

# M18
cd /home/gaab/Downloads/EvolveLoop-v4-m18
cursor-agent --yolo --trust --workspace /home/gaab/Downloads/EvolveLoop-v4-m18 \
  --model claude-opus-5-thinking-high \
  -p --output-format text "$(cat docs/v4-orchestration/prompts/M18-MISSION.md)"
```

Updates appended as sessions complete.
