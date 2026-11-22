# M08 — SDK sketch (not published)

## Package (future)

```text
@evolveloop/extensions  (or @evolveloop/sdk)
  contracts.ts   — AgentAdapter, ModelProvider, Tool, Verifier
  registry API   — register / list / enable / disable
```

## Today (in-repo)

```text
orchestrator/src/v3/extensions/
  contracts.ts          EXTENSION_CONTRACTS_VERSION = 1.0.0
  registry.ts           ExtensionRegistryStore
  reference-stub.ts     installReferenceExtension()
```

## Consumer sketch

```ts
import {
  EXTENSION_CONTRACTS_VERSION,
  ExtensionRegistryStore,
  installReferenceExtension,
  type CustomVerifier,
} from "../v3/extensions/index.js";

const result = installReferenceExtension({ dataDir, withTool: true });
// result.custom_verifier implements CustomVerifier (public contract)
```

## Honesty

- Permissions are declarative; Core does not grant secret access
- CustomVerifier must never upgrade attestation → local_execution
- Full publish deferred — see `LIMITATION-sdk.md`
