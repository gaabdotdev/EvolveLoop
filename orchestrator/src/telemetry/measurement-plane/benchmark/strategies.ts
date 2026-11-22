import type { StrategyId } from "../types.js";

export interface StrategyConfig {
  id: StrategyId;
  name: string;
  version: string;
  description: string;
  /** Explicit experiment config — does not mutate Core policy silently. */
  config: {
    delegation_enabled: boolean;
    hierarchy_enabled: boolean;
    max_spawn_depth: number;
    allow_subagents: boolean;
    single_agent_only: boolean;
  };
}

export const STRATEGY_CATALOG: StrategyConfig[] = [
  {
    id: "A_single_agent",
    name: "Single Agent Baseline",
    version: "1.0.0",
    description: "One agent executes without hierarchical delegation.",
    config: {
      delegation_enabled: false,
      hierarchy_enabled: false,
      max_spawn_depth: 0,
      allow_subagents: false,
      single_agent_only: true,
    },
  },
  {
    id: "B_evolveloop_no_delegation",
    name: "EvolveLoop without Delegation",
    version: "1.0.0",
    description: "Core/Engineering Loop on; delegation policy disabled for experiment.",
    config: {
      delegation_enabled: false,
      hierarchy_enabled: true,
      max_spawn_depth: 0,
      allow_subagents: false,
      single_agent_only: false,
    },
  },
  {
    id: "C_evolveloop_adaptive",
    name: "EvolveLoop Adaptive",
    version: "1.0.0",
    description: "Orchestrator may delegate and spawn subagents within budgets/policies.",
    config: {
      delegation_enabled: true,
      hierarchy_enabled: true,
      max_spawn_depth: 3,
      allow_subagents: true,
      single_agent_only: false,
    },
  },
];

export function getStrategy(id: StrategyId): StrategyConfig {
  const s = STRATEGY_CATALOG.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown strategy: ${id}`);
  return s;
}
