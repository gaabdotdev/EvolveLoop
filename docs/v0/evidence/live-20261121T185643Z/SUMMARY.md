# V0 Live Five-Tasks Evidence

- ts: 20261121T185643Z
- goals: V0-EXIT-02, V0-TEST-F, V0-TEST-D
- evidence_dir: /home/gaab/orca/workspaces/EvolveLoop/seagrass/docs/v0/evidence/live-20261121T185643Z

## Commands / exit codes

| step | exit |
|------|------|
| evolve circuit probe | 0 |
| evolve circuit fire-5 (live) | 0 |
| evolve circuit ledger | 0 |
| token-compare | 0 |

## Stack probe (1+1+1)

```json
{
  "local": "OK",
  "remote": "MISSING_CREDENTIALS",
  "adapter": "OK"
}
```

## Pass metrics

```json
{
  "kind": "V0LivePassMetrics",
  "goals": [
    "V0-TEST-F",
    "V0-EXIT-02"
  ],
  "stack": "1+1+1 (ollama local + openrouter remote slot + cursor adapter)",
  "task_count": 5,
  "pass_at_1": {
    "successes": 5,
    "total": 5,
    "rate": 1
  },
  "pass_pow_3": {
    "successes": 5,
    "total": 5,
    "rate": 1
  },
  "tasks": [
    {
      "task_id": "fire-1",
      "attempts": 1,
      "attempt_statuses": [
        "TRUE_FULL_PASS"
      ],
      "pass_at_1": true,
      "pass_pow_3": true
    },
    {
      "task_id": "fire-2",
      "attempts": 1,
      "attempt_statuses": [
        "TRUE_FULL_PASS"
      ],
      "pass_at_1": true,
      "pass_pow_3": true
    },
    {
      "task_id": "fire-3",
      "attempts": 1,
      "attempt_statuses": [
        "TRUE_FULL_PASS"
      ],
      "pass_at_1": true,
      "pass_pow_3": true
    },
    {
      "task_id": "fire-4",
      "attempts": 1,
      "attempt_statuses": [
        "TRUE_FULL_PASS"
      ],
      "pass_at_1": true,
      "pass_pow_3": true
    },
    {
      "task_id": "fire-5",
      "attempts": 1,
      "attempt_statuses": [
        "TRUE_FULL_PASS"
      ],
      "pass_at_1": true,
      "pass_pow_3": true
    }
  ],
  "consecutive_true_full_pass_at_1": true,
  "exit02_verdict": "TRUE-FULL-PASS_x5_consecutive"
}
```

## Token compare

```json
{
  "verdict": "PASS_LIVE_REDUCTION_57.65pct",
  "combined": {
    "baseline_total": 11487,
    "phase_total": 4865,
    "reduction_pct": 57.647775746496045,
    "meets_target": true,
    "target_min_pct": 50
  },
  "claim_live_reduction": true,
  "ledger_honesty": [
    "ledger_rows=10",
    "cost_provenance_UNAVAILABLE=10/10",
    "rows_with_token_counts=0",
    "PROVIDER_REPORTED tokens absent (cursor-agent CLI does not emit usage) — estimates used for reduction %"
  ]
}
```
