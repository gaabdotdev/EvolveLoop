/**
 * EvolveLoop V3.7 — Adaptive Distributed Agent Fabric domain types.
 * worker_node_id ≠ agent_id ≠ GraphStore/MP node_id.
 */

export const FABRIC_PROTOCOL_VERSION = "1.0" as const;
export const EXECUTION_CONTRACT_SCHEMA = "1.0" as const;

export type WorkerNodeState =
  | "PENDING_ENROLLMENT"
  | "ONLINE"
  | "DEGRADED"
  | "DRAINING"
  | "OFFLINE"
  | "QUARANTINED"
  | "REVOKED";

export type TrustState = "untrusted" | "pending" | "trusted" | "revoked" | "quarantined";

export type ProtocolChannel = "control" | "task" | "telemetry" | "artifact" | "health";

export type InventoryProvenance =
  | "OBSERVED"
  | "PROVIDER_REPORTED"
  | "HARNESS_REPORTED"
  | "ESTIMATED"
  | "DERIVED"
  | "UNAVAILABLE"
  | "UNKNOWN";

export interface WorkerNodeIdentity {
  worker_node_id: string;
  public_key_spki_b64: string;
  key_alg: "Ed25519";
  created_at: string;
}

export interface ResourceInventorySample {
  sampled_at: string;
  provenance: InventoryProvenance;
  cpu_cores: number;
  cpu_load_1m: number;
  memory_mb_total: number;
  memory_mb_available: number;
  storage_mb_available: number;
  gpu_count: number;
  gpu_vram_mb?: number;
  slots_total: number;
  slots_free: number;
  network_ok: boolean;
}

export interface CapabilityInventory {
  observed_at: string;
  provenance: InventoryProvenance;
  os: string;
  kernel: string;
  arch: string;
  runtime: string;
  sandbox_backends: string[];
  harnesses: string[];
  providers: string[];
  local_models: string[];
  toolchains: string[];
  gpu_stack: string[];
  mcp_tools_authorized: string[];
  filesystem_roots: string[];
  network_policy: string;
  data_policy: string;
  /** Probe results: capability → {ok, detail, provenance} */
  probes: Record<string, { ok: boolean; detail: string; provenance: InventoryProvenance }>;
}

export interface WorkerNodeRecord {
  kind: "WorkerNodeRecord";
  identity: WorkerNodeIdentity;
  owner: string;
  fleet: string;
  protocol_versions: string[];
  capabilities: CapabilityInventory;
  resources: ResourceInventorySample;
  status: WorkerNodeState;
  trust: TrustState;
  credential: {
    cert_fingerprint?: string;
    session_token_id?: string;
    expires_at?: string;
    rotated_at?: string;
  };
  last_heartbeat_at?: string;
  version: string;
  enrolled_at?: string;
  revoked_at?: string;
  quarantine_reason?: string;
  updated_at: string;
  /** Never primary identity */
  advertise_endpoints: string[];
}

export interface EnrollmentRequest {
  kind: "EnrollmentRequest";
  request_id: string;
  public_key_spki_b64: string;
  owner: string;
  fleet: string;
  protocol_versions: string[];
  version: string;
  capabilities: CapabilityInventory;
  resources: ResourceInventorySample;
  advertise_endpoints: string[];
  requested_at: string;
}

export interface EnrollmentDecision {
  kind: "EnrollmentDecision";
  request_id: string;
  approved: boolean;
  worker_node_id?: string;
  reason?: string;
  session_token?: string;
  session_expires_at?: string;
  decided_at: string;
}

export interface DistributedLease {
  kind: "DistributedLease";
  lease_id: string;
  resource_key: string;
  task_id?: string;
  owner_worker_node_id: string;
  owner_agent_id?: string;
  fencing_epoch: number;
  issued_at: string;
  expires_at: string;
  allowed_operations: string[];
  budget?: Record<string, number>;
  renew_policy: { max_renewals: number; renewals_used: number; min_renew_interval_ms: number };
  status: "active" | "expired" | "revoked" | "released";
}

export interface ExecutionContract {
  kind: "ExecutionContract";
  schema_version: typeof EXECUTION_CONTRACT_SCHEMA;
  contract_id: string;
  contract_hash: string;
  workflow_id: string;
  task_id: string;
  goal_id?: string;
  inputs: Record<string, unknown>;
  dependency_refs: string[];
  artifact_refs: string[];
  required_capabilities: string[];
  permissions: string[];
  budget: Record<string, number>;
  deadline_at: string;
  sandbox_profile: string;
  network_policy: string;
  worker_node_id: string;
  lease_id: string;
  fencing_epoch: number;
  evidence_requirements: string[];
  retry_policy: { max_retries: number; backoff_ms: number };
  cancel_policy: { graceful_ms: number; force_after_ms: number };
  protocol_version: typeof FABRIC_PROTOCOL_VERSION;
  issued_at: string;
}

export interface WorkerPool {
  kind: "WorkerPool";
  pool_id: string;
  name: string;
  selectors: {
    capabilities_all?: string[];
    capabilities_any?: string[];
    fleets?: string[];
    statuses?: WorkerNodeState[];
  };
  constraints: Record<string, unknown>;
  max_concurrency: number;
  budget: Record<string, number>;
  priority: number;
  draining: boolean;
  member_worker_node_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface PlacementDecision {
  kind: "PlacementDecision";
  decision_id: string;
  task_id: string;
  selected_worker_node_id?: string;
  pool_id?: string;
  hard_rejects: Array<{ worker_node_id: string; reason: string }>;
  soft_ranking: Array<{ worker_node_id: string; score: number; rationale: string }>;
  decided_at: string;
}

export interface ArtifactRecord {
  kind: "ArtifactRecord";
  artifact_id: string;
  content_hash_sha256: string;
  size_bytes: number;
  content_type: string;
  origin_worker_node_id: string;
  origin_task_id?: string;
  origin_agent_id?: string;
  provenance: InventoryProvenance;
  access_policy: { project_ids: string[]; allow_cross_project: boolean };
  created_at: string;
  transfer_state: "local" | "uploading" | "available" | "failed" | "purged";
  integrity_status: "verified" | "unverified" | "mismatch";
  storage_path?: string;
}

export type TeamTopology =
  | "hierarchical"
  | "parallel_fanout"
  | "pipeline"
  | "competitive"
  | "recursive";

export interface AgentTeam {
  kind: "AgentTeam";
  team_id: string;
  objective: string;
  member_agent_ids: string[];
  task_ids: string[];
  topology: TeamTopology;
  topology_version: number;
  owner: string;
  budgets: Record<string, number>;
  policies: Record<string, unknown>;
  state: "forming" | "active" | "reconfiguring" | "draining" | "done" | "failed";
  evidence_refs: string[];
  parent_team_id?: string;
  depth: number;
  created_at: string;
  updated_at: string;
}

export interface FabricCorrelationIds {
  control_plane_id?: string;
  control_plane_epoch?: number;
  worker_node_id?: string;
  node_session_id?: string;
  pool_id?: string;
  lease_id?: string;
  fencing_epoch?: number;
  artifact_transfer_id?: string;
  remote_trace_id?: string;
  remote_span_id?: string;
  workflow_id?: string;
  task_id?: string;
  agent_id?: string;
  session_id?: string;
  /** Legacy GraphStore/MP scheduler UUID — do not reinterpret as worker_node_id */
  engine_node_run_id?: string;
}
