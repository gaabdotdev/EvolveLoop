# V3.5 Limitations (honest)

1. **Linux-first:** OS sandbox announced only for bubblewrap-backed Linux. No Windows/macOS claim.
2. **Not perfect isolation:** bubblewrap is rootless namespace isolation — not a guarantee against privileged local attackers or kernel bugs.
3. **IDE sessions:** Cursor Jobs / host agents are not fully controllable; cancel only for Core-owned PIDs.
4. **Harness real spawn:** requires CLI on PATH + `EVOLVELOOP_HARNESS_CONSENT=true` (+ provider credentials as needed). Without them: dry-run/probe/blocked.
5. **No exactly-once** (ADR-V3-0006).
6. **Power-off:** coordinator does not run while machine is off; recovery is on restart.
7. **systemd --user:** optional; degraded/absent → foreground/`service start` child.
8. **Wiki grounding:** this implementation run had `WIKI_ROOT` unset (GAP recorded).
9. **cgroup memory/CPU hard limits:** process timeout + bwrap session; full cgroup controllers may require extra privileges — documented as best-effort via timeout/pids profile fields.
10. **Benchmark System:** out of scope (not coupled to `feature/bench-obs-v1`).
