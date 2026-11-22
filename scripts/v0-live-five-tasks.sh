#!/usr/bin/env bash
# V0-EXIT-02 / V0-TEST-F / V0-TEST-D — live five-task harness (real agents, no mocks).
# Worktrees only under repo/.evolveloop/ … Evidence under docs/v0/evidence/.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

export PATH="${HOME}/.local/bin:${PATH}"
export EVOLVELOOP_HARNESS_CONSENT=true

TS="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="${REPO_ROOT}/docs/v0/evidence/live-${TS}"
WORKTREE_BASE="${REPO_ROOT}/.evolveloop/live-wt/${TS}"
STATE_DB="${EVIDENCE_DIR}/state.db"
LOG="${EVIDENCE_DIR}/00-harness.log"
PASS_METRICS="${EVIDENCE_DIR}/05-pass-metrics.json"
SUMMARY="${EVIDENCE_DIR}/SUMMARY.md"

mkdir -p "${EVIDENCE_DIR}" "${WORKTREE_BASE}" "${REPO_ROOT}/.evolveloop/circuit-runs"
# latest pointer (file, not symlink-required)
echo "${EVIDENCE_DIR}" > "${REPO_ROOT}/docs/v0/evidence/LATEST_PATH.txt"
ln -sfn "live-${TS}" "${REPO_ROOT}/docs/v0/evidence/latest" 2>/dev/null || true

exec > >(tee -a "${LOG}") 2>&1

echo "=== V0 live five-tasks harness ==="
echo "ts=${TS}"
echo "repo=${REPO_ROOT}"
echo "evidence=${EVIDENCE_DIR}"
echo "worktree_base=${WORKTREE_BASE}"
echo "state_db=${STATE_DB}"
echo "consent=${EVOLVELOOP_HARNESS_CONSENT}"
echo "OPENROUTER=${OPENROUTER_API_KEY:+set}${EVOLVELOOP_OPENROUTER_API_KEY:+set}"
[[ -z "${OPENROUTER_API_KEY:-}${EVOLVELOOP_OPENROUTER_API_KEY:-}" ]] && echo "OPENROUTER=UNAVAILABLE"

command -v evolve >/dev/null
command -v cursor-agent >/dev/null || command -v agent >/dev/null
test -f "${REPO_ROOT}/orchestrator/dist/cli/evolve.js"

echo ""
echo "=== 01 probe (1+1+1) ==="
set +e
evolve circuit probe --workspace "${REPO_ROOT}" | tee "${EVIDENCE_DIR}/01-probe.json"
PROBE_EC=${PIPESTATUS[0]}
set -e
echo "probe_exit=${PROBE_EC}"

echo ""
echo "=== 02 fire-5 LIVE (pass@1 attempt) ==="
set +e
evolve circuit fire-5 \
  --workspace "${REPO_ROOT}" \
  --state-db "${STATE_DB}" \
  --worktree-base "${WORKTREE_BASE}" \
  --timeout 300000 \
  | tee "${EVIDENCE_DIR}/02-fire5-raw.json"
FIRE_EC=${PIPESTATUS[0]}
set -e
echo "fire5_exit=${FIRE_EC}"

# Copy per-run JSON artifacts into evidence (best-effort)
mkdir -p "${EVIDENCE_DIR}/circuit-runs"
if [[ -d "${REPO_ROOT}/.evolveloop/circuit-runs" ]]; then
  # copy newest ~20 run files
  find "${REPO_ROOT}/.evolveloop/circuit-runs" -maxdepth 1 -name '*.json' -type f -printf '%T@ %p\n' \
    | sort -nr | head -20 | awk '{print $2}' \
    | while read -r f; do cp -n "$f" "${EVIDENCE_DIR}/circuit-runs/" 2>/dev/null || cp "$f" "${EVIDENCE_DIR}/circuit-runs/"; done
fi

# Split concatenated JSON objects if present (summary + ledger dump).
# Strip ExperimentalWarning / non-JSON prefixes from node sqlite.
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
const raw = readFileSync('${EVIDENCE_DIR}/02-fire5-raw.json','utf8');
const objs = [];
let depth=0, start=-1;
for (let i=0;i<raw.length;i++){
  const c=raw[i];
  if (c==='{'){ if(depth===0) start=i; depth++; }
  else if (c==='}'){ depth--; if(depth===0 && start>=0){
    try { objs.push(JSON.parse(raw.slice(start,i+1))); } catch { /* skip */ }
    start=-1;
  } }
}
const summary = objs.find(o => o.kind==='FireFiveSummary') ?? objs[0] ?? {kind:'PARSE_FAIL', raw: raw.slice(0,500)};
const ledger = objs.find(o => o.ledger_tail || o.token_ledger) ?? null;
writeFileSync('${EVIDENCE_DIR}/02-fire5-summary.json', JSON.stringify(summary,null,2));
if (ledger) writeFileSync('${EVIDENCE_DIR}/03-ledger-from-fire5.json', JSON.stringify(ledger,null,2));
console.log(JSON.stringify({parsed_objects: objs.length, summary_kind: summary.kind, statuses: (summary.results||[]).map(r=>r.status)},null,2));
"

echo ""
echo "=== 02b pass^3 retries for any non-TRUE_FULL_PASS ==="
EVIDENCE_DIR="${EVIDENCE_DIR}" node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
const d = process.env.EVIDENCE_DIR;
const summary = JSON.parse(readFileSync(d + '/02-fire5-summary.json','utf8'));
const plan = (summary.results||[]).map(r => ({
  task_id: r.task_id,
  attempt1_status: r.status,
  needs_retry: r.status !== 'TRUE_FULL_PASS',
  attempts: [{n:1, status: r.status, reason: r.reason, run_id: r.run_id}],
}));
writeFileSync(d + '/02b-retry-plan.json', JSON.stringify({plan}, null, 2));
console.log(JSON.stringify({retries_needed: plan.filter(p=>p.needs_retry).map(p=>p.task_id)}, null, 2));
"

RETRY_TASKS="$(EVIDENCE_DIR="${EVIDENCE_DIR}" node -e "
const p=require('${EVIDENCE_DIR}/02b-retry-plan.json');
process.stdout.write((p.plan||[]).filter(x=>x.needs_retry).map(x=>x.task_id).join(' '));
")"

ATTEMPT_LOG="${EVIDENCE_DIR}/02c-retries.jsonl"
: > "${ATTEMPT_LOG}"

for attempt in 2 3; do
  for task_id in ${RETRY_TASKS:-}; do
    [[ -z "${task_id}" ]] && continue
    # Skip if already passed in a previous retry
    ALREADY="$(node -e "
      const fs=require('fs');
      const plan=JSON.parse(fs.readFileSync('${EVIDENCE_DIR}/02b-retry-plan.json','utf8'));
      const row=(plan.plan||[]).find(p=>p.task_id==='${task_id}');
      const ok=(row?.attempts||[]).some(a=>a.status==='TRUE_FULL_PASS');
      process.stdout.write(ok?'yes':'no');
    ")"
    [[ "${ALREADY}" == "yes" ]] && continue

    WT="${WORKTREE_BASE}/${task_id}-a${attempt}"
    MARKER_CONTENT="${task_id}"
    echo "--- retry attempt=${attempt} task=${task_id} wt=${WT}"
    set +e
    evolve circuit run \
      --workspace "${REPO_ROOT}" \
      --state-db "${STATE_DB}" \
      --worktree "${WT}" \
      --task-id "${task_id}" \
      --marker "${task_id}.txt" \
      --marker-content "${MARKER_CONTENT}" \
      --timeout 300000 \
      --intent "Criar marcador de circuito V0 task ${task_id} em .evolveloop/circuit-markers/${task_id}.txt" \
      | tee "${EVIDENCE_DIR}/02c-${task_id}-a${attempt}.json"
    REC=${PIPESTATUS[0]}
    set -e
    echo "retry_exit task=${task_id} attempt=${attempt} ec=${REC}"
    EVIDENCE_DIR="${EVIDENCE_DIR}" TASK_ID="${task_id}" ATTEMPT="${attempt}" node --input-type=module -e "
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const d=process.env.EVIDENCE_DIR, tid=process.env.TASK_ID, n=Number(process.env.ATTEMPT);
const raw=readFileSync(\`\${d}/02c-\${tid}-a\${n}.json\`,'utf8');
let obj; try { obj=JSON.parse(raw); } catch { obj={status:'PARSE_FAIL', reason: raw.slice(0,200)}; }
appendFileSync(\`\${d}/02c-retries.jsonl\`, JSON.stringify({task_id:tid, attempt:n, status:obj.status, reason:obj.reason, run_id:obj.run_id})+'\\n');
const plan=JSON.parse(readFileSync(\`\${d}/02b-retry-plan.json\`,'utf8'));
const row=(plan.plan||[]).find(p=>p.task_id===tid);
if (row){ row.attempts.push({n, status:obj.status, reason:obj.reason, run_id:obj.run_id}); row.needs_retry = obj.status !== 'TRUE_FULL_PASS'; }
writeFileSync(\`\${d}/02b-retry-plan.json\`, JSON.stringify(plan,null,2));
"
  done
  # refresh retry list
  RETRY_TASKS="$(node -e "
    const p=require('${EVIDENCE_DIR}/02b-retry-plan.json');
    process.stdout.write((p.plan||[]).filter(x=>x.needs_retry).map(x=>x.task_id).join(' '));
  ")"
done

echo ""
echo "=== 03 ledger query ==="
set +e
evolve circuit ledger --workspace "${REPO_ROOT}" --state-db "${STATE_DB}" \
  | tee "${EVIDENCE_DIR}/03-ledger.json"
LEDGER_EC=${PIPESTATUS[0]}
set -e
echo "ledger_exit=${LEDGER_EC}"

echo ""
echo "=== 04 token compare (V0-TEST-D) ==="
set +e
node "${REPO_ROOT}/scripts/v0-live-token-compare.mjs" "${EVIDENCE_DIR}" \
  | tee "${EVIDENCE_DIR}/04-token-compare.json"
TOK_EC=${PIPESTATUS[0]}
set -e
echo "token_compare_exit=${TOK_EC}"

echo ""
echo "=== 05 pass metrics (V0-TEST-F) ==="
EVIDENCE_DIR="${EVIDENCE_DIR}" node --input-type=module -e "
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const d = process.env.EVIDENCE_DIR;
const summary = JSON.parse(readFileSync(d + '/02-fire5-summary.json','utf8'));
const plan = existsSync(d + '/02b-retry-plan.json')
  ? JSON.parse(readFileSync(d + '/02b-retry-plan.json','utf8'))
  : { plan: (summary.results||[]).map(r => ({ task_id: r.task_id, attempts: [{n:1,status:r.status}] })) };

const tasks = (plan.plan || []).map((row) => {
  const attempts = row.attempts || [{ n: 1, status: row.attempt1_status }];
  const passAt1 = attempts[0]?.status === 'TRUE_FULL_PASS';
  const passPow3 = attempts.slice(0, 3).some((a) => a.status === 'TRUE_FULL_PASS');
  return {
    task_id: row.task_id,
    attempts: attempts.length,
    attempt_statuses: attempts.map((a) => a.status),
    pass_at_1: passAt1,
    pass_pow_3: passPow3,
  };
});
const n = tasks.length || 0;
const passAt1Rate = n ? tasks.filter((t) => t.pass_at_1).length / n : 0;
const passPow3Rate = n ? tasks.filter((t) => t.pass_pow_3).length / n : 0;
const metrics = {
  kind: 'V0LivePassMetrics',
  goals: ['V0-TEST-F', 'V0-EXIT-02'],
  stack: '1+1+1 (ollama local + openrouter remote slot + cursor adapter)',
  task_count: n,
  pass_at_1: { successes: tasks.filter((t) => t.pass_at_1).length, total: n, rate: passAt1Rate },
  pass_pow_3: { successes: tasks.filter((t) => t.pass_pow_3).length, total: n, rate: passPow3Rate },
  tasks,
  consecutive_true_full_pass_at_1: tasks.every((t) => t.pass_at_1),
  exit02_verdict: tasks.every((t) => t.pass_at_1)
    ? 'TRUE-FULL-PASS_x5_consecutive'
    : tasks.every((t) => t.pass_pow_3)
      ? 'PASS_POW3_ONLY_not_consecutive_at_1'
      : 'BLOCKED_or_partial',
};
writeFileSync(d + '/05-pass-metrics.json', JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
"

echo ""
echo "=== 06 git diff --stat (harness-only) ==="
git -C "${REPO_ROOT}" diff --stat -- bin/evolve scripts/v0-live-five-tasks.sh scripts/v0-live-token-compare.mjs orchestrator/package.json docs/v0/ 2>&1 \
  | tee "${EVIDENCE_DIR}/06-git-diff-stat.txt" || true
git -C "${REPO_ROOT}" status --short -- bin/evolve scripts/ docs/v0/ orchestrator/package.json 2>&1 \
  | tee -a "${EVIDENCE_DIR}/06-git-diff-stat.txt" || true

echo ""
echo "=== 07 SUMMARY.md ==="
EVIDENCE_DIR="${EVIDENCE_DIR}" TS="${TS}" PROBE_EC="${PROBE_EC}" FIRE_EC="${FIRE_EC}" LEDGER_EC="${LEDGER_EC}" TOK_EC="${TOK_EC}" \
node --input-type=module -e "
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const d = process.env.EVIDENCE_DIR;
const metrics = existsSync(d+'/05-pass-metrics.json') ? JSON.parse(readFileSync(d+'/05-pass-metrics.json','utf8')) : {};
const tok = existsSync(d+'/04-token-compare.json') ? JSON.parse(readFileSync(d+'/04-token-compare.json','utf8')) : {};
const probe = existsSync(d+'/01-probe.json') ? JSON.parse(readFileSync(d+'/01-probe.json','utf8')) : {};
const md = [
  '# V0 Live Five-Tasks Evidence',
  '',
  \`- ts: \${process.env.TS}\`,
  \`- goals: V0-EXIT-02, V0-TEST-F, V0-TEST-D\`,
  \`- evidence_dir: \${d}\`,
  '',
  '## Commands / exit codes',
  '',
  \`| step | exit |\`,
  \`|------|------|\`,
  \`| evolve circuit probe | \${process.env.PROBE_EC} |\`,
  \`| evolve circuit fire-5 (live) | \${process.env.FIRE_EC} |\`,
  \`| evolve circuit ledger | \${process.env.LEDGER_EC} |\`,
  \`| token-compare | \${process.env.TOK_EC} |\`,
  '',
  '## Stack probe (1+1+1)',
  '',
  '\\\`\\\`\\\`json',
  JSON.stringify({
    local: probe.local_model?.code,
    remote: probe.remote_provider?.code,
    adapter: probe.agent_adapter?.code,
  }, null, 2),
  '\\\`\\\`\\\`',
  '',
  '## Pass metrics',
  '',
  '\\\`\\\`\\\`json',
  JSON.stringify(metrics, null, 2),
  '\\\`\\\`\\\`',
  '',
  '## Token compare',
  '',
  '\\\`\\\`\\\`json',
  JSON.stringify({
    verdict: tok.verdict,
    combined: tok.combined_compare,
    claim_live_reduction: tok.claim_live_reduction,
    ledger_honesty: tok.ledger_honesty,
  }, null, 2),
  '\\\`\\\`\\\`',
  '',
].join('\\n');
writeFileSync(d + '/SUMMARY.md', md);
console.log(md);
"

echo ""
echo "DONE evidence=${EVIDENCE_DIR}"

# Final harness exit: 0 only if EXIT-02 consecutive pass@1
CONSEC="$(node -e "const m=require('${EVIDENCE_DIR}/05-pass-metrics.json'); process.stdout.write(m.consecutive_true_full_pass_at_1?'yes':'no');")"
if [[ "${CONSEC}" == "yes" ]]; then
  echo "HARNESS_VERDICT=TRUE-FULL-PASS_x5"
  exit 0
fi
echo "HARNESS_VERDICT=BLOCKED_or_partial — see ${EVIDENCE_DIR}/SUMMARY.md"
exit 2
