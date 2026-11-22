# V0 Live Evidence (EXIT-02 / TEST-F / TEST-D)

## How to reproduce

```bash
export PATH="$HOME/.local/bin:$PATH"
export EVOLVELOOP_HARNESS_CONSENT=true
bash scripts/install-evolve-cli.sh   # once
bash scripts/v0-live-five-tasks.sh
# or: cd orchestrator && npm run test:v0-live
```

Worktrees: `repo/.evolveloop/live-wt/<ts>/fire-{1..5}`  
Evidence: `docs/v0/evidence/live-<ts>/` (pointer in `docs/v0/evidence/LATEST_PATH.txt`)

## Recorded run: `live-20261121T190707Z` (canonical for this close)

| Goal | Result |
|------|--------|
| V0-EXIT-02 | **TRUE-FULL-PASS ×5** consecutive (real `cursor-agent` / `agent`; Evidence Validator marker checks) |
| V0-TEST-F | pass@1 = **5/5 (1.0)**; pass^3 = **5/5 (1.0)**; stack 1+1+1 |
| V0-TEST-D | combined proxy reduction **58.35%** (≥50%); ledger costs **UNAVAILABLE** honest |

### Exit codes

| Step | Exit |
|------|------|
| `evolve circuit probe` | 0 |
| `evolve circuit fire-5` (live) | 0 |
| `evolve circuit ledger` | 0 |
| `v0-live-token-compare.mjs` | 0 |
| harness overall | 0 |

### Stack (1+1+1)

- Local: Ollama `bonsai-64k:latest` OK
- Remote: OpenRouter `MISSING_CREDENTIALS` (key absent)
- Agent: Cursor `cursor-agent` / `agent` OK with consent

### Per-task (this run)

| task | run_id | adapter | duration_ms | pid | validator |
|------|--------|---------|-------------|-----|-----------|
| fire-1 | cr-240647eb-dca1-4add-8bf2-d49435c4559e | cursor | 82120 | 1327867 | TRUE_FULL_PASS |
| fire-2 | cr-aa3cfb92-2fc9-44ea-8a13-e607ac70c11a | cursor | 81509 | 1354410 | TRUE_FULL_PASS |
| fire-3 | cr-75fd2577-1f03-4a76-bca1-6351499d0718 | cursor | 85790 | 1381072 | TRUE_FULL_PASS |
| fire-4 | cr-21e14572-a203-4ee5-90f7-f1a4e4b44284 | cursor | 83058 | 1408789 | TRUE_FULL_PASS |
| fire-5 | cr-35a99f70-95ca-4f8d-835c-741706fa2c78 | cursor | 81749 | 1435978 | TRUE_FULL_PASS |

### Artifacts

- `00-harness.log` — full tee log
- `01-probe.json`, `02-fire5-summary.json`, `03-ledger.json`
- `04-token-compare.json`, `05-pass-metrics.json`
- `07-raw-terminal-evidence.txt` — commands + ledger + metrics
- `SUMMARY.md` — operator digest

### Prior run (still kept)

`live-20261121T185643Z` — earlier same-day PASS (57.65% token proxy); superseded by `190707Z` as latest.
