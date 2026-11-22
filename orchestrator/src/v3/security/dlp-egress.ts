/**
 * V3-SEC-02 — DLP de saída no Credential Proxy.
 *
 * Inspects outbound HTTP/HTTPS payloads (body + headers) and blocks
 * exfiltration of secrets or proprietary-code markers. Fail-closed on hit.
 */

export const DLP_EGRESS_SCHEMA_VERSION = "1";

export type DlpEgressVerdict = "ALLOW" | "BLOCK";

export type DlpEgressFindingKind = "secret" | "proprietary_marker";

export type DlpEgressLocation = "body" | "header";

export interface DlpEgressFinding {
  kind: DlpEgressFindingKind;
  /** Machine-stable reason token (e.g. secret:bearer_token). */
  reason: string;
  location: DlpEgressLocation;
  header_name?: string;
  /** Truncated match for audit — never the full secret material. */
  matched_preview: string;
}

export interface DlpEgressDecision {
  kind: "DlpEgressDecision";
  schema_version: typeof DLP_EGRESS_SCHEMA_VERSION;
  verdict: DlpEgressVerdict;
  allowed: boolean;
  blocked: boolean;
  /** Flat reason strings for gate logs / CredentialProxy.reason. */
  reasons: string[];
  findings: DlpEgressFinding[];
}

export interface InspectEgressInput {
  body?: string | Buffer | Uint8Array | null;
  headers?: Record<string, string | string[] | undefined | null> | null;
}

export interface InspectEgressOptions {
  /** Extra proprietary marker regex sources (case-insensitive by default). */
  extra_proprietary_markers?: RegExp[];
  /** Extra secret regexes. */
  extra_secret_patterns?: RegExp[];
  /** Max body bytes scanned (DoS guard). Default 1 MiB. */
  max_body_bytes?: number;
  /** Preview truncation for findings. */
  preview_max?: number;
}

const DEFAULT_MAX_BODY = 1_048_576;
const DEFAULT_PREVIEW = 48;

/**
 * Secret material patterns (tokens, keys, PEM, assignment forms).
 * Aligned with federated-sanitize secret hygiene; kept local to avoid
 * coupling security egress to memory federation.
 */
export const DLP_SECRET_PATTERNS: readonly { id: string; pattern: RegExp }[] = [
  {
    id: "pem_private_key",
    pattern:
      /-----BEGIN[A-Z0-9 \-]*PRIVATE KEY-----[\s\S]*?-----END[A-Z0-9 \-]*PRIVATE KEY-----/gi,
  },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi },
  {
    id: "sk_pk_rk_key",
    pattern: /\b(?:sk|pk|rk)[-_](?:live|test|proj)?[-_]?[A-Za-z0-9]{16,}\b/gi,
  },
  { id: "sk_api_blob", pattern: /\b(?:sk|api)[-_]?[A-Za-z0-9]{16,}\b/gi },
  { id: "github_pat_classic", pattern: /\bghp_[A-Za-z0-9]{20,}\b/g },
  { id: "github_pat_fine", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { id: "slack_token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gi },
  { id: "aws_access_key", pattern: /\bAKIA[0-9A-Z]{16,}\b/g },
  { id: "google_api_key", pattern: /\bAIza[0-9A-Za-z\-_]{20,}\b/g },
  {
    id: "env_secret_assignment",
    pattern:
      /(?<=^|[\s"'`])[A-Z][A-Z0-9_]{2,}(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE[_-]?KEY)\s*[=:]\s*[^\s#'"`]+/gm,
  },
];

/**
 * Proprietary / confidential code markers that must not leave the sandbox.
 * Deterministic literals + common license/copyright stamps.
 */
export const DLP_PROPRIETARY_MARKERS: readonly { id: string; pattern: RegExp }[] = [
  { id: "proprietary_keyword", pattern: /\bPROPRIETARY\b/gi },
  { id: "confidential_keyword", pattern: /\bCONFIDENTIAL\b/gi },
  { id: "internal_only", pattern: /\bINTERNAL[_\s-]?ONLY\b/gi },
  { id: "do_not_distribute", pattern: /\bDO[_\s-]?NOT[_\s-]?DISTRIBUTE\b/gi },
  { id: "trade_secret", pattern: /\bTRADE[_\s-]?SECRET\b/gi },
  { id: "at_proprietary", pattern: /\/\/\s*@proprietary\b/gi },
  { id: "spdx_proprietary", pattern: /SPDX-License-Identifier:\s*Proprietary\b/gi },
  {
    id: "copyright_all_rights",
    pattern: /Copyright\s+(?:\(c\)|©)\s+\d{4}[\s\S]{0,80}\bAll\s+Rights\s+Reserved\b/gi,
  },
  {
    id: "company_confidential_banner",
    pattern: /\b(?:COMPANY|CORP|INC|LLC)\s+CONFIDENTIAL\b/gi,
  },
];

function truncatePreview(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function bodyToString(
  body: InspectEgressInput["body"],
  maxBytes: number,
): { text: string; truncated: boolean } {
  if (body == null) return { text: "", truncated: false };
  let buf: Buffer;
  if (typeof body === "string") {
    buf = Buffer.from(body, "utf8");
  } else if (Buffer.isBuffer(body)) {
    buf = body;
  } else {
    buf = Buffer.from(body);
  }
  const truncated = buf.length > maxBytes;
  const slice = truncated ? buf.subarray(0, maxBytes) : buf;
  return { text: slice.toString("utf8"), truncated };
}

function flattenHeaders(
  headers: InspectEgressInput["headers"],
): Array<{ name: string; value: string }> {
  if (!headers) return [];
  const out: Array<{ name: string; value: string }> = [];
  for (const [name, raw] of Object.entries(headers)) {
    if (raw == null) continue;
    if (Array.isArray(raw)) {
      for (const v of raw) {
        if (v != null && String(v).length > 0) out.push({ name, value: String(v) });
      }
    } else if (String(raw).length > 0) {
      out.push({ name, value: String(raw) });
    }
  }
  return out;
}

function scanText(
  text: string,
  location: DlpEgressLocation,
  headerName: string | undefined,
  secretPatterns: readonly { id: string; pattern: RegExp }[],
  proprietaryPatterns: readonly { id: string; pattern: RegExp }[],
  previewMax: number,
  findings: DlpEgressFinding[],
): void {
  if (!text) return;

  for (const { id, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    const m = pattern.exec(text);
    if (m?.[0]) {
      findings.push({
        kind: "secret",
        reason: `secret:${id}`,
        location,
        header_name: headerName,
        matched_preview: truncatePreview(m[0], previewMax),
      });
      // One finding per pattern id is enough for gate reasons.
    }
  }

  for (const { id, pattern } of proprietaryPatterns) {
    pattern.lastIndex = 0;
    const m = pattern.exec(text);
    if (m?.[0]) {
      findings.push({
        kind: "proprietary_marker",
        reason: `proprietary_marker:${id}`,
        location,
        header_name: headerName,
        matched_preview: truncatePreview(m[0], previewMax),
      });
    }
  }
}

function allowDecision(): DlpEgressDecision {
  return {
    kind: "DlpEgressDecision",
    schema_version: DLP_EGRESS_SCHEMA_VERSION,
    verdict: "ALLOW",
    allowed: true,
    blocked: false,
    reasons: [],
    findings: [],
  };
}

/**
 * Inspect outbound HTTP/HTTPS body + headers for secret / proprietary exfil.
 * Empty payload → ALLOW. Any finding → BLOCK (fail-closed).
 */
export function inspectEgress(
  input: InspectEgressInput = {},
  opts: InspectEgressOptions = {},
): DlpEgressDecision {
  const maxBody = opts.max_body_bytes ?? DEFAULT_MAX_BODY;
  const previewMax = opts.preview_max ?? DEFAULT_PREVIEW;

  const secretPatterns: { id: string; pattern: RegExp }[] = [
    ...DLP_SECRET_PATTERNS.map((p) => ({ id: p.id, pattern: new RegExp(p.pattern.source, p.pattern.flags) })),
  ];
  for (const [i, re] of (opts.extra_secret_patterns ?? []).entries()) {
    secretPatterns.push({ id: `extra_secret_${i}`, pattern: new RegExp(re.source, re.flags) });
  }

  const proprietaryPatterns: { id: string; pattern: RegExp }[] = [
    ...DLP_PROPRIETARY_MARKERS.map((p) => ({
      id: p.id,
      pattern: new RegExp(p.pattern.source, p.pattern.flags),
    })),
  ];
  for (const [i, re] of (opts.extra_proprietary_markers ?? []).entries()) {
    proprietaryPatterns.push({
      id: `extra_proprietary_${i}`,
      pattern: new RegExp(re.source, re.flags || "i"),
    });
  }

  const findings: DlpEgressFinding[] = [];
  const { text: bodyText } = bodyToString(input.body, maxBody);
  scanText(bodyText, "body", undefined, secretPatterns, proprietaryPatterns, previewMax, findings);

  for (const { name, value } of flattenHeaders(input.headers)) {
    scanText(value, "header", name, secretPatterns, proprietaryPatterns, previewMax, findings);
  }

  if (findings.length === 0) {
    return allowDecision();
  }

  const reasons = [...new Set(findings.map((f) => f.reason))];
  return {
    kind: "DlpEgressDecision",
    schema_version: DLP_EGRESS_SCHEMA_VERSION,
    verdict: "BLOCK",
    allowed: false,
    blocked: true,
    reasons,
    findings,
  };
}

/** True when verdict is ALLOW. */
export function isEgressAllowed(decision: DlpEgressDecision): boolean {
  return decision.verdict === "ALLOW" && !decision.blocked;
}
