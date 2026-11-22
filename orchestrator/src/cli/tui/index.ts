/**
 * Ink TUI entry for interactive TTY sessions.
 * Non-TTY / injected inputLines stay on the classic evolve-shell REPL.
 */

import React from "react";
import { render } from "ink";
import { EvolveInkApp } from "./App.js";
import type { EvolveShellOptions, EvolveShellResult } from "../../v3/evolve-shell/repl.js";
import { runEvolveShell } from "../../v3/evolve-shell/repl.js";

export { EvolveInkApp } from "./App.js";
export { MultilineInput } from "./MultilineInput.js";
export { pushInputHistory, INPUT_HISTORY_CAP } from "./input-history.js";
export {
  applyMultilineInput,
  createMultilineInputState,
  PASTE_START,
  PASTE_END,
} from "./multiline-input-logic.js";
export { FooterBar } from "./FooterBar.js";
export { GoalContractReview } from "./GoalContractReview.js";
export { GrillQuestionSelect } from "./GrillQuestionSelect.js";
export { ProviderSetup } from "./ProviderSetup.js";
export { ExecutionLive } from "./ExecutionLive.js";
export { DeliveryCard } from "./DeliveryCard.js";
export {
  buildDeliveryCardView,
  DELIVERY_SHORTCUTS,
  formatDeliveryTokens,
  formatDeliveryVerification,
  type DeliveryStatus,
} from "./delivery-card-view.js";
export {
  createActivityWindow,
  pushActivityEvent,
  isSilentTooLong,
  silenceMs,
  ACTIVITY_WINDOW_MAX,
  SILENCE_WARN_MS,
  formatElapsed,
  formatSilenceHint,
  phaseFromWriteLine,
  ringTerminalBell,
} from "./activity-window.js";
export {
  parseSlashCommand,
  isSlashMenuTrigger,
  SLASH_COMMANDS,
  type SlashCommandId,
} from "./slash-commands.js";
export {
  runSlashHandler,
  formatSlashStatus,
  gitDiffStatForSlash,
} from "./slash-handlers.js";
export {
  shortObjectiveTitle,
  distinctScopeItems,
  buildGoalDisplay,
  formatGoalDisplayLines,
} from "./goal-display.js";
export { renderCompactFooter } from "./footer-compact.js";
export { parseMdLiteLine, stripCrudeMarkdown } from "./markdown-lite.js";

/** True when we should mount the Ink TUI (real interactive terminal). */
export function shouldUseInkTui(opts: EvolveShellOptions = {}): boolean {
  if (opts.inputLines) return false;
  if (opts.disable_raw_mode) return false;
  if (!process.stdout.isTTY || !process.stdin.isTTY) return false;
  if (process.env.EVOLVELOOP_FORCE_CLASSIC_REPL === "1") return false;
  if (process.env.EVOLVELOOP_FORCE_INK === "0") return false;
  return true;
}

export async function runInkEvolveShell(
  opts: EvolveShellOptions = {},
): Promise<EvolveShellResult> {
  if (!shouldUseInkTui(opts)) {
    return runEvolveShell(opts);
  }

  const workspace = opts.workspace ?? process.cwd();

  return new Promise<EvolveShellResult>((resolvePromise) => {
    const instance = render(
      React.createElement(EvolveInkApp, {
        workspace,
        onDone: (result) => {
          instance.unmount();
          resolvePromise(result);
        },
      }),
    );
  });
}
