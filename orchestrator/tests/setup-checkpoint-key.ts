import { randomBytes } from "node:crypto";
/** M7 — keep vitest/orchestrator stderr free of node:sqlite ExperimentalWarning. */
import "../src/cli/silence-experimental-sqlite.js";

const KEY_ENV = "EVOLVELOOP_CHECKPOINT_HMAC_KEY";

if (!process.env[KEY_ENV]?.trim()) {
  process.env[KEY_ENV] = randomBytes(32).toString("base64");
}
