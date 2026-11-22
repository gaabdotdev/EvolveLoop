/**
 * V0-ORCH-07 — persistent inbox_messages during MSO execution.
 * Thin facade over StateDb so callers inject messages without touching SQL.
 */

import type { StateDb } from "../state-db/store.js";
import type { InboxMessageRow } from "../state-db/types.js";

export type InboxKind =
  | "user"
  | "status_query"
  | "operational_directive"
  | "priority_change"
  | "scope_change"
  | "system";

export interface InboxReceiveInput {
  workspace_id: string;
  session_id?: string;
  kind: InboxKind | string;
  body?: Record<string, unknown>;
  message_id?: string;
}

/** Persist a message while the MSO is running (survives process restart). */
export function receiveInboxMessage(db: StateDb, input: InboxReceiveInput): InboxMessageRow {
  return db.appendInboxMessage({
    message_id: input.message_id,
    workspace_id: input.workspace_id,
    session_id: input.session_id,
    kind: input.kind,
    body: {
      ...(input.body ?? {}),
      received_during_execution: true,
      received_at: new Date().toISOString(),
    },
  });
}

export function listInbox(db: StateDb, workspaceId: string): InboxMessageRow[] {
  return db.listInboxMessages(workspaceId);
}
