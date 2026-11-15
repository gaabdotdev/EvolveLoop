# M00 single-writer lock

**Active owner (orchestrator-assigned):** Task `532fab4b-0a94-4503-bf51-27161334ec49` (`gemini-4-hydrogen-high`)

If you are any other M00 agent (Grok `768f1aa4…`, Composer CLI, prior Opus/Sonnet sessions): **STOP immediately** without writing. Do not commit. Exit with status `YIELD_TO_ACTIVE_OWNER`.

Reason: Pro quota caused multiple relaunches; concurrent writers on `feature/v4/m00-architecture` risk corruption.

Lock released when orchestrator deletes this file or marks M00 ACCEPTED/REWORK.
