# Blockers

| ID | Severity | Type | Description | Status | Impact on V4 |
|----|----------|------|-------------|--------|--------------|
| B-V37-G17 | CRITICAL (external) | Baseline | V3.7 multi-host G17 BLOCKED (`gaab-1` offline). Global cert tip `03937c1` not APPROVED. | OPEN | Final V4 APPROVED forbidden until certified hash exists |
| B-DISK | HIGH (ops) | Environment | Root FS ~99% full (~2.4 GiB). Limits worktrees/`npm install`. | OPEN | Constrain parallelism; reuse symlinked `node_modules` |
| B-WIKI | MEDIUM | Grounding | `WIKI_ROOT` unset | OPEN | Knowledge grounding GAP for all waves |
| B-LINEAGE | MEDIUM | Baseline | Historical V3.5/V3.6 tips diverge from bench-obs; V4 uses cert tip as provisional spine | MITIGATED | Provisional baseline documented |

No product blockers internal to V4 yet (Wave 1 just started).
