# ADR-V36-0007 — Quality gates discovery and versioning

**Status:** Accepted  
**Date:** 2026-11-12

## Decision

Discover commands from real manifests (package.json/scripts, pytest, cargo). Never invent npm for non-node repos. Low-confidence discoveries require confirm. Required gate failure blocks integration. Unavailable required gate cannot pass as success. Results bind to artifact hash when provided.
