/**
 * V5-M09 — Team composition JSON load/save.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  AGENT_STUDIO_SCHEMA_VERSION,
  type TeamComposition,
} from "./schema.js";
import { AgentStudioError, stripSecrets } from "./config-io.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function parseTeamComposition(raw: unknown): TeamComposition {
  if (!isPlainObject(raw)) {
    throw new AgentStudioError("INVALID", "TeamComposition must be an object");
  }
  const { cleaned } = stripSecrets(raw);
  const o = cleaned as Record<string, unknown>;
  const name = String(o.name ?? "").trim();
  if (!name) throw new AgentStudioError("INVALID", "team name required");

  const agentsRaw = o.agents;
  if (!Array.isArray(agentsRaw)) {
    throw new AgentStudioError("INVALID", "agents[] required");
  }
  const agents = agentsRaw.map((a, i) => {
    if (!isPlainObject(a)) {
      throw new AgentStudioError("INVALID", `agents[${i}] must be object`);
    }
    const an = String(a.name ?? "").trim();
    const role = String(a.role ?? "").trim();
    if (!an || !role) {
      throw new AgentStudioError(
        "INVALID",
        `agents[${i}] requires name and role`,
      );
    }
    return {
      name: an,
      role,
      agent_config_ref:
        typeof a.agent_config_ref === "string"
          ? a.agent_config_ref
          : typeof a.agentConfigRef === "string"
            ? a.agentConfigRef
            : undefined,
    };
  });

  const rolesRaw = o.roles;
  const roles = Array.isArray(rolesRaw)
    ? rolesRaw.map(String)
    : [...new Set(agents.map((a) => a.role))];

  return {
    kind: "TeamComposition",
    schema_version: String(o.schema_version ?? AGENT_STUDIO_SCHEMA_VERSION),
    name,
    agents,
    roles,
    notes: Array.isArray(o.notes) ? o.notes.map(String) : undefined,
  };
}

export function loadTeamComposition(filePath: string): TeamComposition {
  const path = resolve(filePath);
  if (!existsSync(path)) throw new AgentStudioError("NOT_FOUND", path);
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  return parseTeamComposition(raw);
}

export function saveTeamComposition(
  filePath: string,
  team: TeamComposition,
): string {
  const path = resolve(filePath);
  mkdirSync(dirname(path), { recursive: true });
  const { cleaned } = stripSecrets(team);
  writeFileSync(path, JSON.stringify(cleaned, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
  return path;
}

export function teamCompositionPath(studioDir: string, name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return join(studioDir, "teams", `${safe}.json`);
}
