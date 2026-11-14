# Worker Runtime

Validates ExecutionContract (schema, protocol, node match, deadline, lease, contract_hash) before slots/workspace/process. Publishes outbox results; CP enforces fencing on `task.result`.
