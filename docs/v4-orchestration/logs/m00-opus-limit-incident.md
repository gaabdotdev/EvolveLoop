# Incident — M00 agent quota exhaustion

**When:** 2026-11-15 ~13:05Z  
**Impact:** Wave 1 M00 blocked temporarily; M18 Wave 1 unaffected (already ACCEPTED).

## Failed agents

| Agent | Role | Model | Error |
|-------|------|-------|-------|
| `95cf20e3-24bd-4a3f-9036-585bfd085457` | M00 leader | claude-opus-5-5-medium | Opus Pro usage limit |
| `d3d244f4-e776-4b74-ba19-19425f7b3678` | M00 contracts subagent | Opus | Opus usage limit |
| `1ee521ac-0ec6-43a7-ae9f-f482caa45eaf` | M00 ADR subagent | Opus | Opus usage limit |
| `0376e09f-86a1-4534-b4aa-48d56fcc34d2` | M00 follow-up | gpt-5.6-sol-medium | Model usage limit |

## Partial artifacts retained on `feature/v4/m00-architecture`

- `55a810a` — versioned TS contracts under `orchestrator/src/v4/contracts/`
- `bb9988b` — orchestrator directive for M18 §9
- Uncommitted/untracked drafts: `docs/v4/architecture/ARCHITECTURE.md`, dirty `evidence.ts`

## Mitigation

- Relaunch M00 with non-Opus model: Task `ec2e2c6f-e19a-46da-acb1-6bf9dc557272` (`claude-sonnet-5-5-high`)
- Do not resume exhausted Opus sessions
- Prefer CLI `cursor-agent` with alternate models if Task quotas recur
- Contracts freeze remains blocked until M00 ACCEPTED
