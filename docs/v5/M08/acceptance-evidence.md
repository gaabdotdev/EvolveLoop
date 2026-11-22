# M08 — Acceptance evidence

```bash
cd orchestrator
npm run build
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v5-m08-extensions.test.ts
find ../docs/v5/M08 -type f | sort
git diff --check
```

| Criterion | Evidence |
|-----------|----------|
| contracts versioned | `EXTENSION_CONTRACTS_VERSION` + `extensionContractsManifest()` |
| registry ops | `ExtensionRegistryStore.register/list/enable/disable` |
| reference stub | `installReferenceExtension` |
| LIMITATION | `LIMITATION-sdk.md` |
