/**
 * V5-M09 — Agent Studio (declarative config slice — NOT full UI product).
 */

export {
  AGENT_STUDIO_SCHEMA_VERSION,
  SECRET_FIELD_NAMES,
  type AgentConfig,
  type AgentLimitsConfig,
  type TeamComposition,
  type TeamAgentRef,
  type WorkflowModel,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowNodeType,
} from "./schema.js";

export {
  AgentStudioError,
  stripSecrets,
  parseAgentConfig,
  loadAgentConfig,
  saveAgentConfig,
  importAgentConfig,
  exportAgentConfig,
  agentConfigPath,
} from "./config-io.js";

export {
  parseTeamComposition,
  loadTeamComposition,
  saveTeamComposition,
  teamCompositionPath,
} from "./team.js";

export {
  parseWorkflowModel,
  loadWorkflowYaml,
  saveWorkflow,
  workflowPath,
} from "./workflow.js";

export {
  validateAgentConfigCapabilities,
  assertAgentConfigCapabilities,
  type CapabilityValidationIssue,
  type AgentConfigValidationResult,
} from "./validate.js";
