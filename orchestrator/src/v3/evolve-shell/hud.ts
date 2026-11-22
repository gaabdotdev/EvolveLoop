/**
 * HUD assembly: map Session/StateDb snapshot → banner/footer models.
 * Absent fields stay UNAVAILABLE (honest telemetry).
 */

import {
  renderBanner,
  shortenHomePath,
  type BannerMeta,
  type BannerRenderOptions,
  EVOLVELOOP_UX_VERSION,
} from "./banner.js";
import {
  buildFooterTelemetry,
  renderFooter,
  type BuildFooterExtras,
  type FooterRenderOptions,
  type FooterTelemetry,
} from "./footer.js";
import { resolvePanelMsoState } from "./status-panel.js";
import type { WorkspaceSessionSnapshot } from "./workspace-session.js";

export interface BuildBannerExtras {
  version?: string;
  mso_state?: string;
  daemon?: string;
  contract?: string;
  meta_progress?: string;
  tokens_mso?: string;
  tokens_workers?: string;
  sandbox?: string;
  providers?: string;
  shortcuts?: string;
  home?: string;
}

export function buildBannerMeta(
  session: WorkspaceSessionSnapshot,
  extras: BuildBannerExtras = {},
): BannerMeta {
  const contract = extras.contract
    ?? (session.latest_contract ? `v${session.latest_contract.version}` : "—");
  return {
    version: extras.version ?? EVOLVELOOP_UX_VERSION,
    mso_state: resolvePanelMsoState(session, extras.mso_state),
    daemon: extras.daemon ?? "UNAVAILABLE",
    workspace_display: shortenHomePath(session.workspace, extras.home),
    contract,
    meta_progress: extras.meta_progress ?? "UNAVAILABLE",
    tokens_mso: extras.tokens_mso ?? "UNAVAILABLE",
    tokens_workers: extras.tokens_workers ?? "UNAVAILABLE",
    sandbox: extras.sandbox ?? "UNAVAILABLE",
    providers: extras.providers ?? "UNAVAILABLE",
    shortcuts: extras.shortcuts,
  };
}

export function renderBootBanner(
  session: WorkspaceSessionSnapshot,
  extras: BuildBannerExtras = {},
  opts: BannerRenderOptions = {},
): string {
  return renderBanner(buildBannerMeta(session, extras), opts);
}

export function renderSessionFooter(
  session: WorkspaceSessionSnapshot,
  extras: BuildFooterExtras = {},
  opts: FooterRenderOptions = {},
): string {
  return renderFooter(buildFooterTelemetry(session, extras), opts);
}

export type { FooterTelemetry, BannerMeta };
