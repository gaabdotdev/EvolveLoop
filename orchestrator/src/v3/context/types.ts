/**
 * Context Views — disposable projections from canonical stores.
 * Regenerable; never the source of truth. Nomic hybrid retrieval is a GAP.
 */

import type { AgentRole } from "../agent-registry/types.js";

export type ContextViewRole =
  | "master"
  | "leader"
  | "planner"
  | "worker"
  | "auxiliary"
  | "verifier"
  | "coordinator"
  | "operator";

export interface ContextViewSection {
  id: string;
  title: string;
  included: boolean;
  reason?: string;
  content: Record<string, unknown>;
}

export interface ContextView {
  kind: "ContextView";
  work_id: string;
  role: ContextViewRole;
  agent_id?: string;
  generated_at: string;
  disposable: true;
  regenerable_from: string[];
  sections: ContextViewSection[];
  omitted: Array<{ id: string; reason: string }>;
  gaps: string[];
}

export function roleFromAgentRole(role: AgentRole): ContextViewRole {
  return role;
}
