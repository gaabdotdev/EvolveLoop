# EvolveLoop V4.0 — Baseline reproduction script

**Commit pin:** `577b63cdc986eecd4c7943cf627ad1672cfeb935`  
**Workdir:** repository root only.  
**Do not** invent numbers — re-run and replace tables in `raw-measurements.md` / `benchmark-log.md`.

## 0. Preconditions

```bash
cd /path/to/seagrass   # this repository
git rev-parse HEAD    # expect 577b63cdc986eecd4c7943cf627ad1672cfeb935 for this baseline
test -f orchestrator/dist/cli/evolve.js || (cd orchestrator && npm run build)
test -x bin/evolve
node -v               # baseline used v22.15.0
uname -a
```

Optional: note ambient processes (`pgrep -af 'dist/cli/evolve.js'`) — they affect “idle”.

Record: OS, CPU model (`lscpu`), RAM (`free -b` / `/proc/meminfo`), `$SHELL`, `$TERM`, `$TERM_PROGRAM`.

## 1. Environment block

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
git rev-parse HEAD
git log -1 --format='%ci %s'
uname -a
lscpu | grep -E 'Model name|Nome do modelo|CPU\(s\)|Architecture|Arquitetura'
free -b
node -v
echo "SHELL=$SHELL TERM=$TERM TERM_PROGRAM=${TERM_PROGRAM:-}"
command -v /usr/bin/time || echo 'GNU time absent'
```

## 2. CLI response times (commands)

Prefer **Python `os.wait4`** when GNU `time` is missing:

```bash
mkdir -p .tmp/v4-baseline
python3 << 'PY'
import os, statistics, subprocess, time, json
from pathlib import Path
ROOT = Path('.').resolve()
EVOLVE = str(ROOT / 'bin/evolve')
env = os.environ.copy()

def run(cmd, reps=7):
    rows = []
    for i in range(reps):
        t0 = time.perf_counter()
        p = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=ROOT, env=env)
        pid, status, ru = os.wait4(p.pid, 0)
        wall = (time.perf_counter() - t0) * 1000
        out, err = p.stdout.read(), p.stderr.read()
        exit_code = os.WEXITSTATUS(status) if os.WIFEXITED(status) else status
        rows.append({
            'wall_ms': round(wall, 3),
            'exit': exit_code,
            'ru_utime_s': ru.ru_utime,
            'ru_stime_s': ru.ru_stime,
            'ru_maxrss_kb': ru.ru_maxrss,
            'out_bytes': len(out),
            'err_bytes': len(err),
        })
    walls = [r['wall_ms'] for r in rows]
    return {
        'cmd': cmd,
        'wall_ms_raw': walls,
        'wall_ms_median': statistics.median(walls),
        'wall_ms_mad': statistics.median([abs(x - statistics.median(walls)) for x in walls]),
        'ru_maxrss_kb_median': statistics.median([r['ru_maxrss_kb'] for r in rows]),
        'ru_utime_s_median': statistics.median([r['ru_utime_s'] for r in rows]),
        'exits': [r['exit'] for r in rows],
        'rows': rows,
    }

subprocess.run([EVOLVE, '--help'], capture_output=True, cwd=ROOT)  # warmup
out = {
    'help': run([EVOLVE, '--help']),
    'status': run([EVOLVE, 'status']),
    'resume': run([EVOLVE, 'resume']),
    'pause': run([EVOLVE, 'pause'],),
}
# also: adapters list, daemon status, progress, version — expect non-zero exits where noted in raw-measurements.md
Path('.tmp/v4-baseline/repro-commands.json').write_text(json.dumps(out, indent=2))
print(json.dumps({k: {kk: out[k][kk] for kk in ('wall_ms_median','wall_ms_mad','ru_maxrss_kb_median','exits')} for k in out}, indent=2))
PY
```

Repeat N≥5 (baseline used 5–7). Report **median + MAD**, not best run.

## 3. Time until classic shell accepts input

```bash
python3 << 'PY'
import os, select, statistics, subprocess, time, json
from pathlib import Path
ROOT = Path('.').resolve()
EVOLVE = str(ROOT / 'bin/evolve')
env = os.environ.copy()
env['EVOLVELOOP_FORCE_CLASSIC_REPL'] = '1'
env['NO_COLOR'] = '1'
env['TERM'] = 'dumb'

def one(timeout=15):
    t0 = time.perf_counter()
    p = subprocess.Popen([EVOLVE], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         cwd=ROOT, env=env, bufsize=0)
    buf = b''
    prompt_ms = None
    deadline = t0 + timeout
    while time.perf_counter() < deadline and prompt_ms is None:
        r, _, _ = select.select([p.stdout], [], [], 0.05)
        if not r:
            if p.poll() is not None:
                break
            continue
        chunk = os.read(p.stdout.fileno(), 4096)
        if not chunk:
            break
        buf += chunk
        if b'evolve>' in buf:
            prompt_ms = (time.perf_counter() - t0) * 1000
            break
    try:
        p.stdin.write(b'sair\n'); p.stdin.close()
    except Exception:
        pass
    try:
        p.stdout.read(); p.wait(timeout=5)
    except Exception:
        p.kill(); p.wait()
    return prompt_ms

subprocess.run([EVOLVE, '--help'], capture_output=True, cwd=ROOT, env=env)
xs = [one() for _ in range(7)]
xs = [x for x in xs if x is not None]
print({'raw': xs, 'median': statistics.median(xs), 'mad': statistics.median([abs(x-statistics.median(xs)) for x in xs])})
PY
```

**LIMITATION:** does not measure Ink TTY. For Ink, a real TTY harness is required (not provided here).

## 4. Idle memory sample

```bash
for i in 1 2 3 4 5; do
  awk '/MemTotal:|MemAvailable:|MemFree:/ {print}' /proc/meminfo
  pgrep -af 'dist/cli/evolve.js' || true
  sleep 0.2
done
```

## 5. Action-count inspection (static)

Do **not** estimate usability times. Re-read:

1. `orchestrator/src/v3/evolve-shell/repl.ts` (intent → Grill-Me → confirm → `continuar`)
2. `orchestrator/src/v3/grill-me/adaptive.ts` (`grillInterviewBudget`: 0 or 2–3)
3. `docs/v3/EVOLVELOOP_V3_MASTER_DOCUMENT_v0.6.md` §6.3
4. `docs/v0/CLI-KEYBINDINGS.md`

Recount steps; update §6 in `raw-measurements.md` if code changed.

## 6. What not to run for baseline-only capture

- Live provider agent tasks that mutate the workspace for “during task” CPU (unless a dedicated harness + consent is explicitly in scope).
- Usability cohorts (completion rate) — mark LIMITATION.
- State-update latency without an EventBus/TUI refresh harness — mark LIMITATION.

## 7. Fill §8 log

Copy each scenario into `benchmark-log.md` using the template in V4-Tests-and-Benchmarks.md §8. Attach paths under `.tmp/v4-baseline/*.json` as artefatos.
