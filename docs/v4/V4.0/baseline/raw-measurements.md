# EvolveLoop V4.0 — Baseline raw measurements

**Commit:** `577b63cdc986eecd4c7943cf627ad1672cfeb935`  
**Captured (UTC):** 2026-11-22T16:37Z–16:44Z  
**Spec:** V4-Tests-and-Benchmarks.md §2 (baseline obrigatória)  
**Rule:** measure or mark **LIMITATION** — no invented targets.

Dispersion reported as **MAD** (median absolute deviation) unless noted. Units: milliseconds wall clock; RSS in kB (Linux).

---

## 1. Tempo de inicialização da CLI

**Operational definition used:** wall clock of a fresh process `./bin/evolve --help` (bash wrapper → `node orchestrator/dist/cli/evolve.js`), N=7, after one warmup.

| Metric | Value |
|--------|-------|
| Raw wall_ms | 462.327, 456.799, 473.336, 471.773, 461.120, 465.542, 504.519 |
| Median | **465.542 ms** |
| MAD | 6.231 ms |
| Min / Max | 456.799 / 504.519 ms |
| `ru_maxrss` median (`os.wait4`) | 124764 kB |
| `ru_utime` median | 0.514011 s |
| Exit codes | all 0 |

**Note:** A narrower in-process probe that imports only `runEvolveShell` (~85 ms process wall) is **not** the public CLI cold start — full `evolve.js` import graph dominates ~0.46–0.50 s.

---

## 2. Tempo até a interface aceitar input

### 2a. Classic path (measured)

**Definition:** spawn `./bin/evolve` with `EVOLVELOOP_FORCE_CLASSIC_REPL=1`, `NO_COLOR=1`, non-TTY stdin/stdout; stream stdout until first `evolve>` then send `sair\n`. N=7.

| Metric | Value |
|--------|-------|
| Raw to `evolve>` (ms) | 520.440, 508.267, 513.149, 532.513, 532.912, 523.754, 520.273 |
| Median | **520.440 ms** |
| MAD | 7.291 ms |
| to `Digite a intenção…` median | 520.239 ms (MAD 7.278) |
| Exits after `sair` | all 0 |

### 2b. Ink interactive TTY path

**LIMITATION:** `shouldUseInkTui` requires real stdin/stdout TTY. No Ink harness in this baseline. Do **not** treat 520 ms classic numbers as Ink first-keystroke latency.

### 2c. In-process `on_ready` (diagnostic only)

`runEvolveShell({ inputLines:['sair'], on_ready })` ready median **21.795–24.039 ms** — excludes Node + `evolve.js` load. Useful for shell-internal boot only.

---

## 3. Tempo de resposta de comandos comuns

Method: Python `perf_counter` + `/proc` peak RSS sampler (and `os.wait4` for help/status). Warmup: one `--help`.

| Command | N | Median wall ms | MAD | Peak/rss note | Exits |
|---------|---|----------------|-----|---------------|-------|
| `evolve --help` | 7 | 465.542 (wait4) / 505.928 (sampler run) | 6.231 / 9.142 | ru_maxrss med 124764 kB | 0 |
| `evolve status` | 7 | 482.783 (wait4) / 513.597 (sampler) | 2.065 / 3.695 | ru_maxrss med 128760 kB | 0 |
| `evolve resume` | 7 | 483.837 | 17.790 | peak RSS med 124208 kB | 0 |
| `evolve pause` | 5 | 507.273 | 21.833 | peak RSS med 125924 kB | 0 |
| `evolve adapters list` | 5 | 498.762 | 5.400 | peak RSS med 126300 kB | 0 |
| `evolve daemon status` | 5 | 486.373 | 5.010 | peak RSS med 121792 kB | **1** (daemon not running) |
| `evolve progress` | 3 | 495.974 | 8.022 | peak RSS med 121560 kB | **1** |
| `evolve version` | 3 | 495.568 | 0.287 | peak RSS med 124684 kB | **1** |

### Observations (not failures of measurement)

- **`evolve progress`:** advertised in `--help` groups, but CLI router does **not** handle `group === "progress"` — falls through to usage JSON + stderr `Unknown command: evolve progress help`, exit 1. Response time still measured.
- **`evolve version` / `--version`:** no dedicated version command; treated as unknown group → prints usage, exit 1. Version string only appears inside `--help` JSON (`0.1.0-v0-cli`).
- Two timing passes (wait4 vs sampler) differ by ~30–40 ms absolute level; **use wait4 medians for help/status** when citing a single number; keep both raw sets in `.tmp/v4-baseline/`.

`status` sample body (workspace had 0 contracts): bypassed trivial status, `tokens_used: 0`, message includes `[local · 0 tok]`.

---

## 4. Latência de atualização de estado durante execução

**LIMITATION:** No execution harness was run that streams live TaskGraph/EventBus updates while sampling UI refresh. Doing so would require starting an agent/provider task and mutating workspace state beyond observational baseline. No figure reported.

---

## 5. CPU / memória idle e durante tarefa

### Idle (host)

5 samples of `/proc/meminfo` while **not** spawning new baseline commands:

| Sample | MemAvailable_kB | MemFree_kB | Notes |
|--------|-----------------|------------|-------|
| 0 | 17435244 | 9202224 | ambient `evolve.js` PID 42277 present |
| 1 | 17414656 | 9181636 | same |
| 2–4 | 17425524–17425548 | ~9192500 | same |

**LIMITATION:** Not a clean idle of “no evolve processes”. Long-lived PID 42277 sampled separately: RSS **149016 kB**, pCPU ~**0.3%**, elapsed ~3h.

**LIMITATION:** GNU `/usr/bin/time` not installed — CPU time from `os.wait4` rusage (`ru_utime`/`ru_stime`) and RSS from rusage/`/proc`, not `%CPU` time-average of a multi-second task.

### During short CLI commands (proxy for “during task”)

| Command | ru_utime median (s) | ru_maxrss median (kB) |
|---------|---------------------|------------------------|
| `--help` | 0.514011 | 124764 |
| `status` | 0.524717 | 128760 |

**LIMITATION:** No multi-second agent “common task” CPU/RSS profile (would need live provider execution). Short commands finish in ~0.5 s wall; `%CPU` via `ps` during the window was empty (process already exited).

---

## 6. Número de ações/comandos para iniciar tarefa comum

**Method:** static inspection of documented + code path (not a timed usability study).

### Path A — conversational shell (default `evolve`)

From `docs/v3/EVOLVELOOP_V3_MASTER_DOCUMENT_v0.6.md` §6.3 + `orchestrator/src/v3/evolve-shell/repl.ts` + `grill-me/adaptive.ts`:

| Step | Action | Count |
|------|--------|-------|
| 1 | Start CLI (`evolve`) | 1 |
| 2 | Type natural-language intent | 1 |
| 3 | Grill-Me interview | **0** if `detailed_review`; else **2–3** questions (`grillInterviewBudget`) |
| 4 | Confirm Goal Contract (interactive) | 1 |
| 5 | `continuar` / `ok` to kick MSO execution | 1 |
| 6 | Optional harness consent prompt | 0–1 |

**Totals (code-derived):**

- Detailed intent, consent already granted: **4** actions  
- Vague intent (3 Qs) + consent: **up to 7** actions  
- Vague (2 Qs), no consent prompt: **6** actions  

### Path B — non-interactive intent

- Minimum: **1** command: `evolve intent --text "…"` (optional `--answers-json`, `--confirm-mso`).  
- Starting authorized execution afterward is a **separate** step (`continuar` in shell or other exec/circuit/hierarchy commands) — not collapsed into the intent command.

### Path C — Cursor `/evolve` (AGENT.md)

Different product surface (Cursor command + skills). **LIMITATION:** action count for `/evolve` orchestration cycles not instrumented in this CLI baseline.

---

## 7. Tempo para identificar se tarefa está executando / bloqueada / aguardando aprovação

**LIMITATION:** Workspace had **0** Goal Contracts / no active TaskGraph run during baseline. `evolve status` returns empty-contract trivial status in ~483 ms, but that does **not** measure human time-to-classify blocked vs waiting-approval on a live task. No approval UI scenario exercised.

---

## 8. Tempo e passos para localizar e retomar tarefa anterior

| Item | Result |
|------|--------|
| Command | `evolve resume` |
| Measured latency | median **483.837 ms** (N=7, MAD 17.790) |
| Observed payload | `initialized: false`, state DB exists, **0** contracts — message: estado presente sem contratos/sessões |
| Steps (code/docs) | 1 command (`resume`) **or** re-run `evolve` in same cwd (auto-detect session per CLI notes) |

**LIMITATION:** No historical resumable task present; cannot measure “find previous task among many” or successful resume-to-running.

---

## 9. Quantidade de documentação necessária para concluir o fluxo

**Inspection count (minimal paths), not a user study:**

| Path | Docs reasonably required | Count |
|------|--------------------------|-------|
| CLI shell | `README.md` + `docs/v0/CLI-KEYBINDINGS.md` (+ optional master doc §6) | **2–3** |
| Install/setup | `AGENT.md` / `AGENTS.md` + `README.md` + `docs/getting-started/README.md` | **3** |
| Full conceptual flow | + `docs/v3/EVOLVELOOP_V3_MASTER_DOCUMENT_v0.6.md` §6 | **+1** |

**LIMITATION:** “Necessary to conclude” without help was **not** measured with participants — counts are inventory of entry docs, not completion proof.

---

## 10. Taxa de conclusão e erros em tarefas de usabilidade

**LIMITATION:** No usability cohort / scripted user tasks were run in M8. Only CLI smoke exits above. Do not invent a completion rate.

---

## Cross-cutting limitations

1. Ambient long-lived `evolve.js` (PID 42277) during capture.  
2. No GNU `time(1)`.  
3. Ink TTY and live execution state-update latency unmeasured.  
4. `progress` / dedicated `version` commands broken or absent relative to help text.  
5. Wiki grounding scout for EvolveLoop returned `no_hits` / `confidence=low` — contracts taken from repo docs + code, not wiki pack.
