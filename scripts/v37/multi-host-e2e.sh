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
EVOLVE="node $ORCH_ROOT/dist/cli/evolve.js"
REPORT=$($EVOLVE fabric fleet-report --fabric-dir "$FABRIC_DIR" 2>/dev/null || true)
if [[ -z "$REPORT" ]]; then
  json_out "FAIL" "fleet_report_failed" "fabric_dir=$FABRIC_DIR"
  exit 1
fi

if [[ "${EVOLVELOOP_MULTIHOST_LIVE:-0}" != "1" ]]; then
  json_out "BLOCKED" "hosts_reachable_set_EVOLVELOOP_MULTIHOST_LIVE=1_to_run_full_battery" \
    "hosts=${REACHABLE[*]}" \
    "machine_ids=$(IFS=,; echo "${MACHINE_IDS[*]}")" \
    "automation=ready"
  exit 2
fi

# Full live battery — requires SSH to distinct hosts and a reachable CP bind address.
CP_HOST="${CP_BIND_HOST:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
CP_HOST="${CP_HOST:-127.0.0.1}"
CP_PORT="${CP_PORT:-9743}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$FABRIC_DIR/evidence}"
mkdir -p "$EVIDENCE_DIR"

# Prefer Tailscale IP when available for cross-host reachability.
if command -v tailscale >/dev/null 2>&1; then
  TS_IP=$(tailscale ip -4 2>/dev/null || true)
  if [[ -n "$TS_IP" ]]; then
    CP_HOST="$TS_IP"
  fi
fi

$EVOLVE fabric cp-start --fabric-dir "$FABRIC_DIR" --host "$CP_HOST" --port "$CP_PORT" --serve true \
  >"$EVIDENCE_DIR/cp-start.log" 2>&1 &
CP_PID=$!
cleanup() {
  kill "$CP_PID" 2>/dev/null || true
  wait "$CP_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for listen
for _ in $(seq 1 30); do
  if [[ -f "$FABRIC_DIR/tls.json" ]]; then
    break
  fi
  sleep 0.2
done
if [[ ! -f "$FABRIC_DIR/tls.json" ]]; then
  json_out "FAIL" "control_plane_did_not_publish_tls_json" "cp_host=$CP_HOST" "cp_port=$CP_PORT"
  exit 1
fi

declare -a WORKER_IDS=()
for h in "${REACHABLE[@]}"; do
  REMOTE_DIR="${REMOTE_FABRIC_DIR:-/tmp/evolveloop-fabric-worker-$h}"
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$h" "mkdir -p '$REMOTE_DIR' && rm -rf '$REMOTE_DIR'/*" >/dev/null
  # Copy evolve dist + package for remote worker-serve (minimal)
  scp -o BatchMode=yes -q -r "$ORCH_ROOT/dist" "$ORCH_ROOT/package.json" "$h:$REMOTE_DIR/orch/" 2>/dev/null || {
    json_out "FAIL" "scp_orchestrator_dist_failed" "host=$h"
    exit 1
  }
  # Local enroll then ship credentials
  ENROLL=$($EVOLVE fabric enroll-request --fabric-dir "$FABRIC_DIR" --worker-dir "$FABRIC_DIR/workers-pending/$h" --owner "g17" --fleet "multihost")
  WID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["decision"]["worker_node_id"])' <<<"$ENROLL")
  APPROVE=$($EVOLVE fabric enroll-approve --fabric-dir "$FABRIC_DIR" --worker-node-id "$WID" --worker-dir "$FABRIC_DIR/workers/$WID")
  scp -o BatchMode=yes -q -r "$FABRIC_DIR/workers/$WID" "$FABRIC_DIR/tls.json" "$FABRIC_DIR/ca-cert.pem" \
    "$h:$REMOTE_DIR/" >/dev/null
  WORKER_IDS+=("$WID")
  # Start remote worker-serve (insecure only if tls.json says plaintext — production path uses mTLS)
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$h" \
    "cd '$REMOTE_DIR' && nohup node orch/dist/cli/evolve.js fabric worker-serve \
      --fabric-dir '$REMOTE_DIR' --worker-dir '$REMOTE_DIR/$WID' --worker-node-id '$WID' \
      --host '$CP_HOST' --port '$CP_PORT' --once true --serve-ms 20000 \
      >'$REMOTE_DIR/worker.log' 2>&1 &" || true
  echo "$ENROLL" >"$EVIDENCE_DIR/enroll-$h.json"
  echo "$APPROVE" >"$EVIDENCE_DIR/approve-$h.json"
done

sleep 3
DISPATCH=$($EVOLVE fabric dispatch --fabric-dir "$FABRIC_DIR" --deliver true --caps git --objective "g17-live" 2>"$EVIDENCE_DIR/dispatch.err" || true)
echo "$DISPATCH" >"$EVIDENCE_DIR/dispatch.json"
# AUD-G17-02: ack alone is insufficient — require result_accepted
if ! grep -q '"result_accepted"' <<<"$DISPATCH"; then
  json_out "FAIL" "deliver_did_not_result_accept" "dispatch=$(echo "$DISPATCH" | tr '\n' ' ' | cut -c1-240)"
  exit 1
fi

# Revoke first worker and assert subsequent deliver cannot use it (AUD-G17-01)
REVOKED="${WORKER_IDS[0]}"
$EVOLVE fabric revoke --fabric-dir "$FABRIC_DIR" --worker-node-id "$REVOKED" --reason g17_revoke \
  >"$EVIDENCE_DIR/revoke.json"
sleep 1

POST_REVOKE=$($EVOLVE fabric dispatch --fabric-dir "$FABRIC_DIR" --deliver true --caps git --objective "g17-post-revoke" 2>"$EVIDENCE_DIR/post-revoke.err" || true)
echo "$POST_REVOKE" >"$EVIDENCE_DIR/post-revoke-dispatch.json"
# If placement still selects revoked node, that is FAIL
if grep -q "\"selected_worker_node_id\": \"$REVOKED\"" <<<"$POST_REVOKE"; then
  json_out "FAIL" "revoked_worker_still_selected" "revoked=$REVOKED"
  exit 1
fi
# Must not accept a completed delivery owned by the revoked worker.
if grep -q "\"worker_node_id\": \"$REVOKED\"" <<<"$POST_REVOKE" && grep -q '"result_accepted"' <<<"$POST_REVOKE"; then
  json_out "FAIL" "revoked_worker_still_accepted_delivery" "revoked=$REVOKED"
  exit 1
fi
# Remaining host must still complete a delivery (AUD-V37B-03): ack alone insufficient.
if ! grep -q '"result_accepted"' <<<"$POST_REVOKE"; then
  json_out "FAIL" "post_revoke_deliver_did_not_result_accept" \
    "revoked=$REVOKED" \
    "post_revoke=$(echo "$POST_REVOKE" | tr '\n' ' ' | cut -c1-240)"
  exit 1
fi

json_out "PASS" "multi_host_live_battery_completed" \
  "hosts=${REACHABLE[*]}" \
  "machine_ids=$(IFS=,; echo "${MACHINE_IDS[*]}")" \
  "workers=$(IFS=,; echo "${WORKER_IDS[*]}")" \
  "cp_host=$CP_HOST" \
  "cp_port=$CP_PORT" \
  "evidence_dir=$EVIDENCE_DIR" \
  "revoked=$REVOKED" \
  "pre_revoke_delivery=result_accepted" \
  "post_revoke_delivery=result_accepted"
exit 0
