# ADR-V36-0003 — Priority, fairness, aging

**Status:** Accepted  
**Date:** 2026-11-12

## Decision

Effective priority = inverted base priority + service-class weight + aging boost + deadline boost. Fairness window reorders when one project dominates recent admits. Deterministic and unit-tested.

## Non-claims

Not a real-time OS scheduler; not multi-host.
