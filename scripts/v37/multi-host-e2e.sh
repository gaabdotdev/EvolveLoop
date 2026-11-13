#!/usr/bin/env bash
# Multi-host E2E scaffold — requires TWO online Linux hosts.
# Containers on one host do NOT satisfy Gate E2E.
set -euo pipefail
WORKER_HOSTS="${WORKER_HOSTS:-}"
if [[ -z "$WORKER_HOSTS" ]]; then
  echo '{"state":"BLOCKED","reason":"WORKER_HOSTS unset; need >=2 independent Linux hosts"}'
  exit 2
fi
IFS=',' read -r -a HOSTS <<<"$WORKER_HOSTS"
if [[ ${#HOSTS[@]} -lt 2 ]]; then
  echo '{"state":"BLOCKED","reason":"need >=2 hosts"}'
  exit 2
fi
echo "TODO: enroll workers on ${HOSTS[*]} against CP; run concurrent harness tasks"
exit 1
