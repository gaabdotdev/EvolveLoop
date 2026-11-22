export { detectWorkspaceSession, type WorkspaceSessionSnapshot } from "./workspace-session.js";
export {
  buildStatusPanel,
  renderStatusPanelPt,
  resolvePanelMsoState,
  type StatusPanelModel,
} from "./status-panel.js";
export {
  attachKeybindings,
  attachSigint,
  INTERRUPT_FORCE_WINDOW_MS,
  MSG_INTERRUPT_GRACEFUL,
  MSG_INTERRUPT_FORCED,
  MSG_PAUSE,
  MSG_DETACH_OK,
  MSG_DETACH_OFF_WARN,
  type KeybindingAction,
  type KeybindingHooks,
  type KeybindingController,
} from "./keybindings.js";
export { runEvolveShell, type EvolveShellOptions, type EvolveShellResult } from "./repl.js";
export {
  LOCAL_ZERO_TOK_TAG,
  renderWorkspaceScanLine,
  formatGrillMeQuestionUx,
  renderGoalContractCard,
  isGoalContractConfirmAnswer,
  withLocalZeroTokTag,
} from "./grill-ux.js";
export {
  renderCapabilityGatePrompt,
  renderProviderFallbackLine,
  paintProviderFallbackLine,
  parseCapabilityGateChoice,
  createShellEventBus,
  type CapabilityGatePromptInput,
  type CapabilityGateChoice,
  type ProviderFallbackLineInput,
  type ShellUxEvent,
  type ShellEventBus,
} from "./capability-ui.js";
export {
  probeDaemonAttach,
  formatDaemonBannerLabel,
  formatInboxStreamLine,
  createUdsInboxBridge,
  resolveDaemonInboxForShell,
  type DaemonAttachInfo,
  type InboxSyncStatus,
  type InboxEvent,
  type InboxEventHandler,
  type ShellInboxBridge,
} from "./daemon-probe.js";
export {
  runFirstRunSetup,
  defaultFirstRunProbes,
  redactSecrets,
  writeCredentialsSecure,
  buildReadinessReport,
  DEFAULT_LIMITS,
  type FirstRunSetupInput,
  type ReadinessReport,
  type ProbeResult,
  type ConcurrencyLimits,
} from "./first-run-setup.js";

export {
  colorEnabled,
  paint,
  cyan,
  green,
  yellow,
  red,
  dim,
  type SemanticColor,
  type ColorOptions,
} from "./colors.js";

export {
  EVOLVELOOP_UX_VERSION,
  renderBanner,
  renderBannerWide,
  renderBannerCompact,
  buildBannerProgressiveLines,
  bannerHasUnavailable,
  shortenHomePath,
  type BannerMeta,
  type BannerRenderOptions,
} from "./banner.js";

export {
  buildFooterTelemetry,
  renderFooter,
  renderFooterBlock,
  formatTokDisplay,
  formatHonestMetric,
  isFooterIdle,
  type MetricProvenance,
  type SandboxFooterStatus,
  type HonestMetric,
  type FooterTaskRef,
  type FooterTelemetry,
  type FooterRenderOptions,
  type BuildFooterExtras,
} from "./footer.js";

export { probeHudEnvironment, type HudProbeResult } from "./hud-probes.js";

export {
  probeProviderReadiness,
  needsInlineProviderSetup,
  writeFreellmKeySecure,
  evolveloopSecretsPath,
  type ProviderReadinessSnapshot,
} from "./provider-readiness.js";

export {
  isProceedAfterConfirmIntent,
  startAuthorizedExecution,
  type ShellStartExecutionResult,
} from "./shell-start-execution.js";

export {
  renderActiveAgentsTree,
  renderHudZones,
  type ActiveAgentView,
  type AgentTokenHonesty,
  type AgentsTreeOptions,
  type HudZonesInput,
} from "./layout.js";

export {
  buildBannerMeta,
  renderBootBanner,
  renderSessionFooter,
  type BuildBannerExtras,
} from "./hud.js";
