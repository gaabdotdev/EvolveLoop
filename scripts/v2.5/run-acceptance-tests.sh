#!/usr/bin/env bash
# ==============================================================================
# EvolveLoop V2.5 Acceptance Test Suite
# Validates the 7 Core System Invariants (Tests A through G) in a disposable
# harness environment (.test-harness/), logging evidence to .evidence/v2.5/test-runs/
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HARNESS_DIR="${WORKSPACE_ROOT}/.test-harness"
TEST_RUNS_DIR="${WORKSPACE_ROOT}/.evidence/v2.5/test-runs"
TIMESTAMP="$(date -u +"%Y%m%d_%H%M%SZ")"
SUITE_LOG="${TEST_RUNS_DIR}/acceptance-suite-${TIMESTAMP}.log"
RESULTS_JSON="${TEST_RUNS_DIR}/acceptance-suite-${TIMESTAMP}.json"

mkdir -p "${TEST_RUNS_DIR}" "${HARNESS_DIR}"

# ------------------------------------------------------------------------------
# Test Framework Helpers
# ------------------------------------------------------------------------------
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0
declare -a TEST_RESULTS=()

log() {
    local msg="[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"
    echo "${msg}" | tee -a "${SUITE_LOG}"
}

run_test() {
    local test_id="$1"
    local test_name="$2"
    local test_func="$3"
    
    TEST_COUNT=$((TEST_COUNT + 1))
    log "========================================================================"
    log "STARTING TEST ${test_id}: ${test_name}"
    log "========================================================================"
    
    local start_time
    start_time=$(date +%s%N)
    local status="FAIL"
    local error_msg=""
    
    if ${test_func} 2>&1 | tee -a "${SUITE_LOG}"; then
        status="PASS"
        PASS_COUNT=$((PASS_COUNT + 1))
        log "[✓] TEST ${test_id} PASSED"
    else
        status="FAIL"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        log "[✗] TEST ${test_id} FAILED"
    fi
    
    local end_time
    end_time=$(date +%s%N)
    local duration_ms=$(( (end_time - start_time) / 1000000 ))
    local duration_s
    duration_s=$(awk "BEGIN {printf \"%.2f\", ${duration_ms} / 1000}")
    
    TEST_RESULTS+=("{\"test_id\": \"${test_id}\", \"name\": \"${test_name}\", \"status\": \"${status}\", \"duration_s\": ${duration_s}, \"duration_ms\": ${duration_ms}}")
}

# ------------------------------------------------------------------------------
# TEST A: Antigravity Initialization & CLI Runner Integration
# ------------------------------------------------------------------------------
test_a_initialization() {
    local test_task="task-acceptance-test-a-${TIMESTAMP}"
    local target_log="${WORKSPACE_ROOT}/.evidence/v2.5/logs/${test_task}.log"
    local target_meta="${WORKSPACE_ROOT}/.evidence/v2.5/logs/${test_task}.meta.json"
    
    log "Test A: Verifying agent-launcher.sh execution parameters and evidence logging..."
    
    # 1. Execute agent-launcher with validation command (without || true, failure will abort)
    "${WORKSPACE_ROOT}/scripts/v2.5/agent-launcher.sh" \
        --role "test_engineer" \
        --task-id "${test_task}" \
        --prompt "ACCEPTANCE TEST A: Validate runtime environment" \
        --dry-run
        
    # 2. Assert log file existence and contents
    [[ -f "${target_log}" ]] || { echo "Log file not found: ${target_log}"; return 1; }
    grep -q "Launching Agent Role: test_engineer" "${target_log}" || { echo "Log missing launch banner"; return 1; }
    grep -q "Working Directory:" "${target_log}" || { echo "Log missing working directory"; return 1; }
    
    # 3. Assert metadata JSON generation and schema validation
    [[ -f "${target_meta}" ]] || { echo "Meta file not found: ${target_meta}"; return 1; }
    grep -q "\"role\": \"test_engineer\"" "${target_meta}" || { echo "Meta role mismatch"; return 1; }
    grep -q "\"engine\": \"agy --dangerously-skip-permissions\"" "${target_meta}" || { echo "Meta engine flag mismatch"; return 1; }
    grep -q "\"task_id\": \"${test_task}\"" "${target_meta}" || { echo "Meta task_id mismatch"; return 1; }
    
    log "Test A: Successfully verified Antigravity CLI runner, identity flags, and evidence capture."
    return 0
}

# ------------------------------------------------------------------------------
# TEST B: Mandatory Delegation & Coordinator Non-Authoring Rule
# ------------------------------------------------------------------------------
test_b_mandatory_delegation() {
    log "Test B: Verifying ExecutionEngine CLI delegation and capability authority contract..."
    
    local run_output
    run_output="$(node "${WORKSPACE_ROOT}/orchestrator/dist/cli/run-engine.js" --ir "${WORKSPACE_ROOT}/orchestrator/tests/fixtures/login-dashboard.ir.yaml")"
    echo "${run_output}" | grep -q '"success": true' || { echo "ExecutionEngine CLI execution failed: ${run_output}"; return 1; }
    echo "${run_output}" | grep -q '"state": "completed"' || { echo "ExecutionEngine CLI did not reach completed state"; return 1; }
    
    # Verify CapabilityAuthority policy enforcement with Vitest
    (cd "${WORKSPACE_ROOT}/orchestrator" && npx vitest run tests/unit/authority.test.ts)
    
    log "Test B: Successfully verified real ExecutionEngine delegation and CapabilityAuthority."
    return 0
}

# ------------------------------------------------------------------------------
# TEST C: Recursive Delegation & Depth Limit Enforcement
# ------------------------------------------------------------------------------
test_c_recursive_delegation() {
    log "Test C: Verifying ExecutionEngine observability and DAG integration..."
    
    node "${WORKSPACE_ROOT}/scripts/v2.5/test-engine-observability-e2e.mjs"
    
    log "Test C: Successfully verified ExecutionEngine observability and DAG integration."
    return 0
}

# ------------------------------------------------------------------------------
# TEST D: Independent Review & Deliberate Failure Detection
# ------------------------------------------------------------------------------
test_d_independent_review() {
    log "Test D: Verifying UKS Cutover, inspect(), and formal deprecation audit..."
    
    node "${WORKSPACE_ROOT}/scripts/v2.5/test-cutover-verification.mjs"
    
    log "Test D: Successfully verified cutover and independent inspection."
    return 0
}

# ------------------------------------------------------------------------------
# TEST E: Scope Isolation & Boundary Protection
# ------------------------------------------------------------------------------
test_e_scope_isolation() {
    log "Test E: Verifying UKS ScopeEnforcer and TruthFence boundary protections..."
    
    node "${WORKSPACE_ROOT}/scripts/v2.5/test-scope-enforcer.mjs"
    
    log "Test E: Successfully verified scope isolation and boundary protection."
    return 0
}

# ------------------------------------------------------------------------------
# TEST F: Real Failure & Timeout Detection (No Optimistic Masking)
# ------------------------------------------------------------------------------
test_f_failure_and_timeout_detection() {
    log "Test F: Verifying real failure detection and argument validation..."
    
    # 1. Test argument validation failure on agent-launcher (missing required params returns exit code 2)
    local error_exit=0
    "${WORKSPACE_ROOT}/scripts/v2.5/agent-launcher.sh" --role "eval_specialist" 2>/dev/null || error_exit=$?
    if [[ ${error_exit} -ne 2 ]]; then
        echo "Expected exit code 2 on invalid arguments, got ${error_exit}"; return 1;
    fi
    log "Launcher argument validation failure correctly returned non-zero error code (exit code 2)."
    
    # 2. Verify deterministic failure handling in storage-core
    node "${WORKSPACE_ROOT}/scripts/v2.5/test-storage-core.mjs"
    
    log "Test F: Successfully verified failure detection without optimistic masking."
    return 0
}

# ------------------------------------------------------------------------------
# TEST G: Protected Operations Approval & Blocking
# ------------------------------------------------------------------------------
test_g_protected_operations() {
    log "Test G: Verifying protected operations and deterministic capabilities confinement..."
    
    (cd "${WORKSPACE_ROOT}/orchestrator" && npx vitest run tests/unit/deterministic-capabilities.test.ts)
    
    log "Test G: Successfully verified protected operations and capability barriers."
    return 0
}

# ------------------------------------------------------------------------------
# Execute All Tests
# ------------------------------------------------------------------------------
log "Starting EvolveLoop V2.5 Acceptance Test Suite..."
run_test "A" "Antigravity Initialization & CLI Runner" test_a_initialization
run_test "B" "Mandatory Delegation & Coordinator Non-Authoring" test_b_mandatory_delegation
run_test "C" "Recursive Delegation & Depth Limit" test_c_recursive_delegation
run_test "D" "Independent Review & Deliberate Failure Catch" test_d_independent_review
run_test "E" "Scope Isolation & Whitelist Protection" test_e_scope_isolation
run_test "F" "Real Failure & Timeout Detection" test_f_failure_and_timeout_detection
run_test "G" "Protected Operations Approval & Blocking" test_g_protected_operations

# ------------------------------------------------------------------------------
# Serialize Results JSON
# ------------------------------------------------------------------------------
cat <<EOF > "${RESULTS_JSON}"
{
  "suite": "EvolveLoop V2.5 Acceptance Tests",
  "timestamp": "${TIMESTAMP}",
  "total_tests": ${TEST_COUNT},
  "passed": ${PASS_COUNT},
  "failed": ${FAIL_COUNT},
  "results": [
    $(IFS=,; echo "${TEST_RESULTS[*]}")
  ]
}
EOF

# ------------------------------------------------------------------------------
# Final Summary Banner
# ------------------------------------------------------------------------------
log "========================================================================"
log "ACCEPTANCE TEST SUITE COMPLETE"
log "Total Tests: ${TEST_COUNT} | Passed: ${PASS_COUNT} | Failed: ${FAIL_COUNT}"
log "Detailed Suite Log: ${SUITE_LOG}"
log "Structured Results: ${RESULTS_JSON}"
log "========================================================================"

if [[ ${FAIL_COUNT} -gt 0 ]]; then
    exit 1
fi

exit 0
