# V1-GATE-TOK Evidence

- ts: 20261121T205122Z
- goal: V1-GATE-TOK (attempt 1/3)
- evidence_dir: /home/gaab/orca/workspaces/EvolveLoop/seagrass/docs/v1/evidence/gate-tok-20261121T205122Z
- estimation: chars/4 proxy (**estimated**, not provider billing)
- live_llm_savings: UNAVAILABLE

## Verdict

**V1-GATE-TOK_PASS_75.54pct**

```json
{
  "kind": "V1GateTokVerdict",
  "pass": true,
  "label": "V1-GATE-TOK_PASS_75.54pct",
  "reasons": [
    "OK_REDUCTION: measured 75.54% >= 75%",
    "OK_CRYSTALLIZER: 0-token path proven",
    "OK_O1_SNAPSHOT: stable across 5 iterations"
  ],
  "target_min_pct": 75,
  "measured_reduction_pct": 75.53740326741186
}
```

## PASS criteria

| criterion | required | measured | ok |
|-----------|----------|----------|----|
| combined reduction_pct | >= 75% | 75.54% | OK_REDUCTION: measured 75.54% >= 75% |
| crystallizer 0-token | proven | true | true |
| O(1) snapshot | ≥5 iters stable | iters=5 proven=true | true |

## V0 baseline reference

- file: `/home/gaab/orca/workspaces/EvolveLoop/seagrass/docs/v0/evidence/latest/04-token-compare.json`
- V0 combined baseline: 11630
- V0 combined phase: 4844
- V0 reduction: 58.349097162510745

## Combined gate (thin vs V0 baseline — PASS basis)

Same prompt+stdout surface as V0 `04-token-compare.json` baseline.
V1 phase applies telegraphic + nl-compress + prefix pin reuse + stdout filter + crystallizer 0-token (tasks 4–5).

```json
{
  "baseline_total": 11630,
  "phase_total": 2845,
  "reduction_pct": 75.53740326741186,
  "meets_target": true,
  "target_min_pct": 75,
  "honesty": "estimated",
  "notes": [
    "Same prompt+stdout surface as V0 compare",
    "V1 adds pin reuse + nl-compress + crystallizer 0-token on tasks 4-5"
  ]
}
```

## Supplemental: extended TRUE-FULL-PASS (file + RAG + history)

Not used for PASS/FAIL (would inflate %). Reported for outline/prune/tombstone/snapshot measurability.

```json
{
  "baseline_total": 53170,
  "phase_total": 3247,
  "reduction_pct": 93.8931728418281,
  "meets_target": true,
  "target_min_pct": 75,
  "honesty": "estimated",
  "notes": [
    "Baseline = V0 uncompressed prompt+stdout + naive full-file + RAG + growing history",
    "Phase = V1 pin/nl/telegraphic/crystallizer + outline/read_lines + prune + O(1) snapshot + filtered stdout"
  ],
  "baseline_breakdown": {
    "v0_prompt": 10805,
    "v0_stdout": 825,
    "naive_full_file": 37060,
    "naive_rag": 2200,
    "naive_history": 2280
  },
  "phase_breakdown": {
    "prompts_with_v1_stack": 2941,
    "stdout_filtered": 306,
    "pin_cache_hits": 2
  },
  "phase_samples": [
    {
      "label": "v1_fire-1",
      "total_tokens": 1027,
      "subsystem": "v1.pin_full+slice+prune+snapshot+nl",
      "cache_hit": false
    },
    {
      "label": "v1_fire-2",
      "total_tokens": 957,
      "subsystem": "v1.pin_cache_hit+slice+prune+snapshot+nl",
      "cache_hit": true
    },
    {
      "label": "v1_fire-3",
      "total_tokens": 957,
      "subsystem": "v1.pin_cache_hit+slice+prune+snapshot+nl",
      "cache_hit": true
    },
    {
      "label": "v1_fire-4",
      "total_tokens": 0,
      "subsystem": "crystallizer.zero_token_script",
      "cache_hit": false
    },
    {
      "label": "v1_fire-5",
      "total_tokens": 0,
      "subsystem": "crystallizer.zero_token_script",
      "cache_hit": false
    }
  ],
  "thin_samples": [
    {
      "label": "thin_fire-1",
      "total_tokens": 895,
      "cache_hit": false
    },
    {
      "label": "thin_fire-2",
      "total_tokens": 822,
      "cache_hit": true
    },
    {
      "label": "thin_fire-3",
      "total_tokens": 822,
      "cache_hit": true
    },
    {
      "label": "thin_fire-4",
      "total_tokens": 0
    },
    {
      "label": "thin_fire-5",
      "total_tokens": 0
    }
  ]
}
```

## Technique snapshots

- prefix pin cache_hits: 4/4 after turn1; identical_prefix=true
- context slicing reduction_pct: 98.41%
- prune reduction_pct: 92.27%
- tombstone reduction_pct: 49.40%
- nl_compress reduction_pct: 38.82%
- fast_apply reduction_pct: 43.64%
- speculative local_resolution_rate: 0.8
- constrained parse_failure_pct: 0% (n=100, ollama=UNAVAILABLE_offline_grammar_validate_loop)

## Honesty

- All reduction figures above are **estimated** (chars/4).
- PROVIDER_REPORTED live LLM token savings: **UNAVAILABLE**
- Constrained decoding used offline grammar validate loop (Ollama not required).
