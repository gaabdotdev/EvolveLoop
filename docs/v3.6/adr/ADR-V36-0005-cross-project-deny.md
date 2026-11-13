# ADR-V36-0005 — Cross-project deny-by-default

**Status:** Accepted  
**Date:** 2026-11-12

## Decision

ProjectIsolationGuard realpath-checks targets. Paths under another registered project denied unless both policies allow cross-project artifacts and an explicit artifact ref is provided. Dependency edges across projects follow the same rule. Access attempts append JSONL audit.

## Consequences

Dependency ≠ filesystem authority.
