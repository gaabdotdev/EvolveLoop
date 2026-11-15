# Blockers

| ID | Severity | Type | Description | Status | Impact on V4 |
|----|----------|------|-------------|--------|--------------|
| B-V37-G17 | CRITICAL (external) | Baseline | V3.7 multi-host G17 BLOCKED (`gaab-1` offline). Global cert tip `03937c1` not APPROVED. | OPEN | Final V4 APPROVED forbidden until certified hash exists |
| B-DISK | HIGH (ops) | Environment | Root FS ~99% full (~2.4 GiB). Limits worktrees/`npm install`. | OPEN | Constrain parallelism; reuse symlinked `node_modules` |
| B-WIKI | MEDIUM | Grounding | `WIKI_ROOT` unset | OPEN | Knowledge grounding GAP for all waves |
| B-LINEAGE | MEDIUM | Baseline | Historical V3.5/V3.6 tips diverge from bench-obs; V4 uses cert tip as provisional spine | MITIGATED | Provisional baseline documented |
| B-QUOTA-M00 | HIGH (ops) | Agent quota | Pro limits exhausted mid-flight (Opus/Sol/Sonnet/Codex/Gemini) | OPEN | M00 package completed anyway (tip `1dea128`); blocks **separate-context freeze review** + Wave 2 agents until Spend Limit / reset 2026-12-04 |
| B-M00-FREEZE-REVIEW | HIGH | Process | Freeze re-review after B1–B3 rework | **CLOSED** | `FREEZE_APPROVED_WITH_RESERVATIONS` → stamp `e4fb8ad`; Wave 2 unblocked |

M18 Wave 1 ACCEPTED. M00 FROZEN. Wave 2 implementers ACCEPTED; M19 integrate in flight.
