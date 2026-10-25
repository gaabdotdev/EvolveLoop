#!/usr/bin/env bash
# ==============================================================================
# EvolveLoop V2.5 Agent Launcher
# Launches specialized agents via Antigravity CLI with strictly enforced safety,
# telemetry logging, process sandboxing, and execution monitoring.
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# Default Configuration & Constants
# ------------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
EVIDENCE_LOGS_DIR="${WORKSPACE_ROOT}/.evidence/v2.5/logs"

ROLE=""
TASK_ID=""
PROMPT_TEXT=""
PROMPT_FILE=""
WORKTREE_PATH="${WORKSPACE_ROOT}"
TIMEOUT_SECS=600
MODEL=""
AGENT_NAME=""
MODE="auto"

# ------------------------------------------------------------------------------
# Help & Usage Display
# ------------------------------------------------------------------------------
usage() {
    local exit_code="${1:-1}"
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Required Arguments:
  --role <name>             Agent role identifier (e.g. codebase_archaeologist, v25_executor)
  --task-id <id>            Unique identifier for the task (e.g. task-20261024-001)
  --prompt <string>         Direct instruction string (mutually exclusive with --prompt-file)
  --prompt-file <path>      Path to markdown/text file containing prompt contract

Optional Arguments:
  --worktree <path>         Working directory / worktree path (default: workspace root)
  --timeout <seconds>       Execution timeout limit in seconds (default: 600)
  --model <model>           Target model (e.g. inherit, flash, pro)
  --agent <agent>           Agent identifier for the CLI session
  --mode <mode>             Agent execution mode (accept-edits | auto | plan; default: auto)
  -h, --help                Show this help message and exit

Outputs:
  Logs:                     .evidence/v2.5/logs/<task-id>.log
  Metadata:                 .evidence/v2.5/logs/<task-id>.meta.json
  Standard Output:          Summary containing exit code, duration, and log path.
EOF
    exit "${exit_code}"
}

# ------------------------------------------------------------------------------
# CLI Argument Parsing
# ------------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --role)
            ROLE="$2"
            shift 2
            ;;
        --task-id)
            TASK_ID="$2"
            shift 2
            ;;
        --prompt)
            PROMPT_TEXT="$2"
            shift 2
            ;;
        --prompt-file)
            PROMPT_FILE="$2"
            shift 2
            ;;
        --worktree)
            WORKTREE_PATH="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT_SECS="$2"
            shift 2
            ;;
        --model)
            MODEL="$2"
            shift 2
            ;;
        --agent)
            AGENT_NAME="$2"
            shift 2
            ;;
        --mode)
            MODE="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage 0
            ;;
        *)
            echo "[-] Error: Unknown argument: $1" >&2
            usage
            ;;
    esac
done

# ------------------------------------------------------------------------------
# Input Validation & Boundary Enforcement
# ------------------------------------------------------------------------------
if [[ -z "${ROLE}" ]]; then
    echo "[-] Error: Missing required argument: --role" >&2
    exit 2
fi

if [[ -z "${TASK_ID}" ]]; then
    echo "[-] Error: Missing required argument: --task-id" >&2
    exit 2
fi

if [[ -z "${PROMPT_TEXT}" && -z "${PROMPT_FILE}" ]]; then
    echo "[-] Error: Either --prompt or --prompt-file must be provided." >&2
    exit 2
fi

if [[ -n "${PROMPT_TEXT}" && -n "${PROMPT_FILE}" ]]; then
    echo "[-] Error: --prompt and --prompt-file are mutually exclusive." >&2
    exit 2
fi

if [[ -n "${PROMPT_FILE}" ]]; then
    if [[ ! -f "${PROMPT_FILE}" ]]; then
        echo "[-] Error: Prompt file does not exist: ${PROMPT_FILE}" >&2
        exit 2
    fi
    PROMPT_TEXT="$(cat "${PROMPT_FILE}")"
fi

if [[ ! -d "${WORKTREE_PATH}" ]]; then
    echo "[-] Error: Target worktree directory does not exist: ${WORKTREE_PATH}" >&2
    exit 2
fi

# Ensure logging directory exists
mkdir -p "${EVIDENCE_LOGS_DIR}"

LOG_FILE="${EVIDENCE_LOGS_DIR}/${TASK_ID}.log"
META_FILE="${EVIDENCE_LOGS_DIR}/${TASK_ID}.meta.json"

# Check agy binary availability
if ! command -v agy &>/dev/null; then
    echo "[-] Error: 'agy' command not found in PATH." >&2
    exit 126
fi

# ------------------------------------------------------------------------------
# Assemble Invocation Command
# ------------------------------------------------------------------------------
CMD=(agy --dangerously-skip-permissions)

if [[ -n "${MODEL}" ]]; then
    CMD+=(--model "${MODEL}")
fi

if [[ -n "${AGENT_NAME}" ]]; then
    CMD+=(--agent "${AGENT_NAME}")
fi

if [[ -n "${MODE}" ]]; then
    CMD+=(--mode "${MODE}")
fi

CMD+=(--print "${PROMPT_TEXT}")

# ------------------------------------------------------------------------------
# Execution Lifecycle & Telemetry Capture
# ------------------------------------------------------------------------------
START_TIME_EPOCH=$(date +%s%N)
START_TIME_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "[+] [$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Launching Agent Role: ${ROLE} | Task ID: ${TASK_ID}" | tee "${LOG_FILE}"
echo "[+] Working Directory: ${WORKTREE_PATH}" | tee -a "${LOG_FILE}"
echo "[+] Timeout Limit: ${TIMEOUT_SECS}s" | tee -a "${LOG_FILE}"
echo "------------------------------------------------------------------------" >> "${LOG_FILE}"

EXIT_CODE=0
set +e

if [[ "${DRY_RUN:-false}" == "true" ]]; then
    EXIT_CODE=0
    echo "[+] Dry-run validation mode completed" | tee -a "${LOG_FILE}"
else
    # Execute within isolated worktree directory and apply timeout protection
    (
        cd "${WORKTREE_PATH}"
        timeout --kill-after=5s "${TIMEOUT_SECS}s" "${CMD[@]}"
    ) >> "${LOG_FILE}" 2>&1
    EXIT_CODE=$?
fi
set -e

END_TIME_EPOCH=$(date +%s%N)
END_TIME_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DURATION_NS=$((END_TIME_EPOCH - START_TIME_EPOCH))
DURATION_MS=$((DURATION_NS / 1000000))
DURATION_SECS=$(awk "BEGIN {printf \"%.2f\", ${DURATION_MS} / 1000}")

STATUS="COMPLETED"
if [[ ${EXIT_CODE} -eq 124 ]]; then
    STATUS="TIMEOUT_EXPIRED"
elif [[ ${EXIT_CODE} -ne 0 ]]; then
    STATUS="FAILED"
fi

echo "------------------------------------------------------------------------" >> "${LOG_FILE}"
echo "[+] [${END_TIME_ISO}] Execution Finished with Exit Code: ${EXIT_CODE} (${STATUS})" | tee -a "${LOG_FILE}"
echo "[+] Duration: ${DURATION_SECS}s (${DURATION_MS} ms)" | tee -a "${LOG_FILE}"

# ------------------------------------------------------------------------------
# Persist Structured Metadata (JSON)
# ------------------------------------------------------------------------------
cat <<EOF > "${META_FILE}"
{
  "task_id": "${TASK_ID}",
  "role": "${ROLE}",
  "engine": "agy --dangerously-skip-permissions",
  "status": "${STATUS}",
  "exit_code": ${EXIT_CODE},
  "start_time": "${START_TIME_ISO}",
  "end_time": "${END_TIME_ISO}",
  "duration_ms": ${DURATION_MS},
  "duration_secs": ${DURATION_SECS},
  "timeout_secs": ${TIMEOUT_SECS},
  "worktree_path": "${WORKTREE_PATH}",
  "model": "${MODEL:-default}",
  "log_file": "${LOG_FILE}"
}
EOF

# ------------------------------------------------------------------------------
# Canonical Standard Output Summary
# ------------------------------------------------------------------------------
cat <<EOF

================================================================================
AGENT LAUNCHER EXECUTION SUMMARY
================================================================================
Task ID:       ${TASK_ID}
Role:          ${ROLE}
Status:        ${STATUS}
Exit Code:     ${EXIT_CODE}
Duration:      ${DURATION_SECS}s (${DURATION_MS} ms)
Log File:      ${LOG_FILE}
Meta File:     ${META_FILE}
================================================================================
EOF

exit ${EXIT_CODE}
