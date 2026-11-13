# V3.5 Limitations (honest)

1. **Linux-first:** OS sandbox announced only for bubblewrap-backed Linux. No Windows/macOS claim.
2. **Not perfect isolation:** bubblewrap is rootless namespace isolation — not a guarantee against privileged local attackers or kernel bugs.
3. **IDE sessions:** Cursor Jobs / host agents are not fully controllable; cancel only for Core-owned PIDs.
4. **Harness real spawn:** requires CLI on PATH + `EVOLVELOOP_HARNESS_CONSENT=true` (+ session auth or provider API key). Without them: dry-run/probe/blocked.
5. **No exactly-once** (ADR-V3-0006).
6. **Power-off:** coordinator does not run while machine is off; recovery is on restart.
7. **systemd --user:** optional; degraded/absent → foreground/`service start` child.
8. **Wiki grounding:** V3.5 notes not yet indexed in vault (`GAP: no_hits`); ADRs + live evidence used.
9. **Resource limits:** timeout + output caps always; `prlimit` RLIMIT_AS/CPU when set. **`max_pids` is NOT applied via RLIMIT_NPROC** (user-wide hazard). cgroup v2 controllers not wired.
10. **Benchmark System:** out of scope (not coupled to `feature/bench-obs-v1`).
11. **Harness provider vs sandbox:** cursor-agent uses host HOME/network for provider auth; engineering confinement is via bubblewrap `agent-workspace` (network deny). Harness is not claimed to run *inside* bwrap with remapped HOME.
12. **Debian merged-/usr:** sandbox must use `/usr` bind + symlinks for `/bin`/`/lib`; incorrect mounts fail closed.
13. **Claude Code:** still available as alternate adapter but was `loggedIn=false` during live E2E; Gate H passed via cursor-agent session.
