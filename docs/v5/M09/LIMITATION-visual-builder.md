# LIMITATION — Visual builder / templates marketplace deferred (M09)

**Status:** deferred  
**Why:** Agent Studio UI and marketplace would pretend product completeness. M09 ships declarative schemas + validation only.

## What exists instead

- YAML/JSON AgentConfig / TeamComposition / WorkflowModel
- Capability-aware validation against adapter catalog
- Single workflow model (no parallel visual engine)

## Forbidden claims

- Do not claim a drag-and-drop Studio shipped
- Do not claim template marketplace
- Do not introduce a second workflow engine “for the UI”
