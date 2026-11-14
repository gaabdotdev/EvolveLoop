#!/usr/bin/env bash
# Multi-host E2E — Gate G17
# Requires TWO online Linux hosts with distinct machine identity.
# Containers / dual-process on one host do NOT satisfy this gate.
set -euo pipefail

json_out() {
  local state="$1"
  local reason="$2"
  shift 2 || true
  python3 -c '
import json, sys
state, reason = sys.argv[1], sys.argv[2]
extra = {}
for a in sys.argv[3:]:
    if "=" in a:
        k, v = a.split("=", 1)
        extra[k] = v
print(json.dumps({"state": state, "reason": reason, **extra}, sort_keys=True))
' "$state" "$reason" "$@"
}

WORKER_HOSTS="${WORKER_HOSTS:-}"
REQUIRE_SSH="${REQUIRE_SSH:-1}"
FABRIC_DIR="${FABRIC_DIR:-/tmp/evolveloop-fabric-e2e}"

if [[ -z "$WORKER_HOSTS" && "${AUTO_DETECT_TAILSCALE:-0}" == "1" ]]; then
  if command -v tailscale >/dev/null 2>&1; then
    mapfile -t ONLINE < <(tailscale status --json 2>/dev/null | python3 -c '
import json,sys
d=json.load(sys.stdin)
hosts=[]
self=d.get("Self") or {}
if self.get("Online") and str(self.get("OS") or "").lower().startswith("linux"):
    hosts.append(self.get("DNSName") or self.get("HostName") or "")
for v in (d.get("Peer") or {}).values():
    if v.get("Online") and str(v.get("OS") or "").lower().startswith("linux"):
        hosts.append(v.get("DNSName") or v.get("HostName") or "")
print("\n".join([h for h in hosts if h]))
')
    if [[ ${#ONLINE[@]} -ge 2 ]]; then
      WORKER_HOSTS=$(IFS=,; echo "${ONLINE[*]}")
    fi
  fi
fi

if [[ -z "$WORKER_HOSTS" ]]; then
  json_out "BLOCKED" "WORKER_HOSTS unset; need >=2 independent Linux hosts" "gaab1_hint=100.121.169.97"
  exit 2
fi

IFS=',' read -r -a HOSTS <<<"$WORKER_HOSTS"
# trim whitespace
for i in "${!HOSTS[@]}"; do HOSTS[$i]=$(echo "${HOSTS[$i]}" | xargs); done
if [[ ${#HOSTS[@]} -lt 2 ]]; then
  json_out "BLOCKED" "need >=2 hosts" "count=${#HOSTS[@]}"
  exit 2
fi

declare -a MACHINE_IDS=()
declare -a REACHABLE=()

for h in "${HOSTS[@]}"; do
  if [[ "$REQUIRE_SSH" == "1" ]]; then
    if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "$h" 'echo ok' >/dev/null 2>&1; then
      json_out "BLOCKED" "host_unreachable_or_no_ssh" "host=$h"
      exit 2
    fi
  fi
  mid=$(ssh -o BatchMode=yes -o ConnectTimeout=5 "$h" 'cat /etc/machine-id 2>/dev/null || hostname -f' 2>/dev/null || true)
  if [[ -z "$mid" ]]; then
    json_out "BLOCKED" "cannot_read_machine_identity" "host=$h"
    exit 2
  fi
  MACHINE_IDS+=("$mid")
  REACHABLE+=("$h")
done

uniq_count=$(printf '%s\n' "${MACHINE_IDS[@]}" | sort -u | wc -l)
if [[ "$uniq_count" -lt 2 ]]; then
  json_out "FAIL" "machine_identities_not_distinct_same_host_or_clone" "count=$uniq_count"
  exit 1
fi

ORCH_ROOT="${ORCHESTRATOR_ROOT:-}"
if [[ -z "$ORCH_ROOT" ]]; then
  HERE=$(cd "$(dirname "$0")/../.." && pwd)
  if [[ -f "$HERE/orchestrator/package.json" ]]; then
    ORCH_ROOT="$HERE/orchestrator"
  fi
fi

if [[ -z "$ORCH_ROOT" || ! -f "$ORCH_ROOT/dist/cli/evolve.js" ]]; then
  json_out "BLOCKED" "orchestrator_dist_missing_build_on_control_plane" "hosts=${REACHABLE[*]}"
  exit 2
fi

rm -rf "$FABRIC_DIR"
mkdir -p "$FABRIC_DIR"
REPORT=$(node "$ORCH_ROOT/dist/cli/evolve.js" fabric fleet-report --fabric-dir "$FABRIC_DIR" 2>/dev/null || true)
if [[ -z "$REPORT" ]]; then
  json_out "FAIL" "fleet_report_failed" "fabric_dir=$FABRIC_DIR"
  exit 1
fi

json_out "BLOCKED" "hosts_reachable_but_remote_worker_enrollment_not_automated_yet" \
  "hosts=${REACHABLE[*]}" \
  "machine_ids=$(IFS=,; echo "${MACHINE_IDS[*]}")" \
  "next=enroll workers on each host; re-run with EVOLVELOOP_MULTIHOST_LIVE=1"
exit 2
