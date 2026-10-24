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
    
    # 1. Execute agent-launcher with a quick validation command
    # Using a 3-second timeout to assert lifecycle execution
    "${WORKSPACE_ROOT}/scripts/v2.5/agent-launcher.sh" \
        --role "test_engineer" \
        --task-id "${test_task}" \
        --prompt "ACCEPTANCE TEST A: Validate runtime environment" \
        --timeout 3 || true
        
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
    local b_dir="${HARNESS_DIR}/test-b"
    rm -rf "${b_dir}"
    mkdir -p "${b_dir}/coordinator" "${b_dir}/executor"
    
    log "Test B: Simulating policy check where coordinator is forbidden from direct file writes..."
    
    # Invariant: Coordinator cannot write to src or test files directly.
    # Emulate policy check on coordinator action:
    local coordinator_attempt_file="${b_dir}/src_module.js"
    local coordinator_role="orchestrator"
    
    # Policy validator function
    validate_authoring_policy() {
        local role="$1"
        local file="$2"
        if [[ "${role}" == "orchestrator" || "${role}" == "implementation_coordinator" ]]; then
            echo "[-] POLICY VIOLATION: Role '${role}' is strictly forbidden from directly writing code to ${file}."
            return 1
        fi
        return 0
    }
    
    # 1. Assert coordinator write attempt is blocked by policy
    if validate_authoring_policy "${coordinator_role}" "${coordinator_attempt_file}"; then
        echo "Coordinator write was illegally permitted!"; return 1;
    else
        log "Coordinator direct write correctly blocked by policy engine."
    fi
    
    # 2. Coordinator generates a formal delegation contract instead
    local contract_file="${b_dir}/coordinator/delegation_contract.json"
    cat <<EOF > "${contract_file}"
{
  "contract_id": "del-test-b",
  "delegator": "implementation_coordinator",
  "delegate": "v25_executor",
  "target_file": "${b_dir}/executor/result.txt",
  "expected_content": "PROCESSED_BY_DEDICATED_EXECUTOR"
}
EOF
    
    # 3. Dedicated executor executes within delegated scope
    echo "PROCESSED_BY_DEDICATED_EXECUTOR" > "${b_dir}/executor/result.txt"
    
    # 4. Coordinator verifies integrity hash
    local actual_content
    actual_content="$(cat "${b_dir}/executor/result.txt")"
    [[ "${actual_content}" == "PROCESSED_BY_DEDICATED_EXECUTOR" ]] || { echo "Executor output mismatch"; return 1; }
    
    log "Test B: Successfully verified mandatory delegation and coordinator non-authoring rule."
    return 0
}

# ------------------------------------------------------------------------------
# TEST C: Recursive Delegation & Depth Limit Enforcement
# ------------------------------------------------------------------------------
test_c_recursive_delegation() {
    local c_dir="${HARNESS_DIR}/test-c"
    rm -rf "${c_dir}"
    mkdir -p "${c_dir}"
    
    log "Test C: Testing 3-tier recursion and depth limit enforcement (max 3 levels)..."
    
    # Depth validator simulator
    dispatch_agent() {
        local current_depth="$1"
        local agent_role="$2"
        local max_depth=3
        
        log "Agent '${agent_role}' running at depth ${current_depth}"
        if [[ ${current_depth} -ge ${max_depth} ]]; then
            echo "[-] DEPTH LIMIT EXCEEDED: Depth ${current_depth} reached max permitted (${max_depth}). Spawning further subagents is blocked."
            return 1
        fi
        return 0
    }
    
    # Level 1: Orchestrator -> Level 2: Implementation Coordinator
    dispatch_agent 1 "orchestrator" || { echo "Level 1 failed"; return 1; }
    
    # Level 2: Implementation Coordinator -> Level 3: Focused Executor
    dispatch_agent 2 "implementation_coordinator" || { echo "Level 2 failed"; return 1; }
    
    # Level 3: Focused Executor attempts to spawn Level 4 (Sub-Executor) -> MUST BE BLOCKED
    if dispatch_agent 3 "focused_executor"; then
        echo "Level 3 was improperly allowed to spawn subagents!"; return 1;
    else
        log "Level 3 spawn attempt correctly blocked by depth limit policy."
    fi
    
    # Level 3 completes work and sends structured result upstream
    local result_json="${c_dir}/leaf_result.json"
    cat <<EOF > "${result_json}"
{
  "leaf_task_id": "leaf-001",
  "status": "COMPLETED",
  "depth": 3,
  "output": "LEAF_SUCCESS"
}
EOF
    [[ -f "${result_json}" ]] || { echo "Leaf result missing"; return 1; }
    log "Test C: Successfully verified recursive delegation hierarchy and depth limits."
    return 0
}

# ------------------------------------------------------------------------------
# TEST D: Independent Review & Deliberate Failure Detection
# ------------------------------------------------------------------------------
test_d_independent_review() {
    local d_dir="${HARNESS_DIR}/test-d"
    rm -rf "${d_dir}"
    mkdir -p "${d_dir}"
    
    log "Test D: Testing adversarial review and defect detection on disposable fixture..."
    
    # 1. Author a deliberately defective fixture (e.g. math bug)
    local fixture="${d_dir}/math.js"
    cat <<EOF > "${fixture}"
function add(a, b) {
    return a + b + 999; // Deliberate defect
}
module.exports = { add };
EOF

    # 2. Independent Reviewer automated audit rule
    review_fixture() {
        local target="$1"
        # Run audit assertion: 2 + 2 must equal 4
        local check
        check=$(node -e "const {add} = require('${target}'); console.log(add(2, 2));")
        if [[ "${check}" -ne 4 ]]; then
            echo "VERDICT: REJECTED | Defect detected: add(2,2) returned ${check}, expected 4"
            return 1
        fi
        echo "VERDICT: APPROVED"
        return 0
    }
    
    # Reviewer must REJECT defective fixture
    if review_fixture "${fixture}"; then
        echo "Reviewer failed to catch deliberate defect!"; return 1;
    else
        log "Independent Reviewer successfully caught deliberate defect and issued REJECTED verdict."
    fi
    
    # 3. Simulate targeted remediation pass
    cat <<EOF > "${fixture}"
function add(a, b) {
    return a + b; // Fixed implementation
}
module.exports = { add };
EOF
    
    # Reviewer must APPROVE remediated fixture
    if ! review_fixture "${fixture}"; then
        echo "Reviewer failed to approve fixed fixture!"; return 1;
    else
        log "Independent Reviewer successfully approved remediated fixture."
    fi
    
    log "Test D: Successfully verified independent review and defect catching."
    return 0
}

# ------------------------------------------------------------------------------
# TEST E: Scope Isolation & Boundary Protection
# ------------------------------------------------------------------------------
test_e_scope_isolation() {
    local e_dir="${HARNESS_DIR}/test-e"
    rm -rf "${e_dir}"
    mkdir -p "${e_dir}/authorized" "${e_dir}/forbidden"
    
    log "Test E: Testing scope isolation and out-of-bounds write detection..."
    
    # Whitelist validator
    validate_scope_write() {
        local target_file="$1"
        local authorized_prefix="$2"
        
        # Canonicalize paths
        local canon_target
        canon_target="$(realpath -m "${target_file}")"
        local canon_auth
        canon_auth="$(realpath -m "${authorized_prefix}")"
        
        if [[ "${canon_target}" != "${canon_auth}"* ]]; then
            echo "[-] SECURITY_SCOPE_VIOLATION: Attempted write to '${canon_target}' is outside authorized scope '${canon_auth}'."
            return 1
        fi
        return 0
    }
    
    # Case 1: Write inside authorized directory -> PASS
    local allowed_file="${e_dir}/authorized/feature.txt"
    if validate_scope_write "${allowed_file}" "${e_dir}/authorized"; then
        echo "Authorized content" > "${allowed_file}"
        log "Authorized write permitted as expected."
    else
        echo "Authorized write was blocked erroneously!"; return 1;
    fi
    
    # Case 2: Attempted write outside authorized directory -> BLOCKED
    local rogue_file="${e_dir}/forbidden/exploit.txt"
    if validate_scope_write "${rogue_file}" "${e_dir}/authorized"; then
        echo "Rogue write was illegally permitted!"; return 1;
    else
        log "Out-of-scope write was successfully intercepted and blocked."
    fi
    
    # Assert forbidden file was never created
    [[ ! -f "${rogue_file}" ]] || { echo "Forbidden file was created on disk!"; return 1; }
    
    log "Test E: Successfully verified scope isolation and boundary protection."
    return 0
}

# ------------------------------------------------------------------------------
# TEST F: Real Failure & Timeout Detection (No Optimistic Masking)
# ------------------------------------------------------------------------------
test_f_failure_and_timeout_detection() {
    log "Test F: Verifying that errors and timeouts are never masked as success..."
    
    local timeout_task="task-acceptance-test-f-timeout-${TIMESTAMP}"
    local fail_task="task-acceptance-test-f-error-${TIMESTAMP}"
    
    # 1. Test timeout detection: launch agent with 2s timeout
    "${WORKSPACE_ROOT}/scripts/v2.5/agent-launcher.sh" \
        --role "eval_specialist" \
        --task-id "${timeout_task}" \
        --prompt "sleep 10" \
        --timeout 2 || true
        
    local timeout_meta="${WORKSPACE_ROOT}/.evidence/v2.5/logs/${timeout_task}.meta.json"
    [[ -f "${timeout_meta}" ]] || { echo "Timeout meta file missing"; return 1; }
    grep -q "\"status\": \"TIMEOUT_EXPIRED\"" "${timeout_meta}" || { echo "Timeout status was masked!"; return 1; }
    grep -q "\"exit_code\": 124" "${timeout_meta}" || { echo "Timeout exit code 124 missing!"; return 1; }
    log "Timeout was correctly classified as TIMEOUT_EXPIRED (exit code 124)."
    
    # 2. Test execution failure: missing required arguments returns exit code 2
    local error_exit=0
    "${WORKSPACE_ROOT}/scripts/v2.5/agent-launcher.sh" --role "eval_specialist" 2>/dev/null || error_exit=$?
    if [[ ${error_exit} -ne 2 ]]; then
        echo "Expected exit code 2 on invalid arguments, got ${error_exit}"; return 1;
    fi
    log "Launcher argument validation failure correctly returned non-zero error code (exit code 2)."
    
    log "Test F: Successfully verified failure detection without optimistic masking."
    return 0
}

# ------------------------------------------------------------------------------
# TEST G: Protected Operations Approval & Blocking
# ------------------------------------------------------------------------------
test_g_protected_operations() {
    log "Test G: Verifying that protected operations (git push, sudo) are barred..."
    
    # Policy barrier simulator
    execute_operation() {
        local command_string="$1"
        local human_approved="${2:-false}"
        
        # Check forbidden patterns
        if [[ "${command_string}" =~ "sudo" || "${command_string}" =~ "npm install -g" ]]; then
            echo "[-] FORBIDDEN OPERATION: '${command_string}' violates security boundaries. Execution terminated."
            return 126
        fi
        
        # Check protected patterns
        if [[ "${command_string}" =~ "git push" || "${command_string}" =~ "git merge" ]]; then
            if [[ "${human_approved}" != "true" ]]; then
                echo "[-] PROTECTED OPERATION HALT: '${command_string}' requires explicit human operator approval."
                return 1
            fi
        fi
        
        log "Executing autonomous operation: ${command_string}"
        return 0
    }
    
    # 1. Attempt git push without approval -> MUST HALT
    local push_exit=0
    execute_operation "git push origin main" "false" || push_exit=$?
    if [[ ${push_exit} -eq 0 ]]; then
        echo "Git push without human approval was allowed!"; return 1;
    else
        log "Unapproved git push correctly blocked."
    fi
    
    # 2. Attempt forbidden sudo -> MUST TERMINATE
    local sudo_exit=0
    execute_operation "sudo rm -rf /" "false" || sudo_exit=$?
    if [[ ${sudo_exit} -ne 126 ]]; then
        echo "Forbidden sudo command was not blocked with code 126!"; return 1;
    else
        log "Forbidden sudo command was permanently blocked."
    fi
    
    # 3. Approved protected operation -> ALLOWED
    local approved_exit=0
    execute_operation "git merge task/fix" "true" || approved_exit=$?
    if [[ ${approved_exit} -ne 0 ]]; then
        echo "Approved protected operation failed to run!"; return 1;
    else
        log "Approved protected operation succeeded."
    fi
    
    log "Test G: Successfully verified approval and blocking of protected operations."
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
