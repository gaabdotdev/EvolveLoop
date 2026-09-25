/**
 * SEC-006 — redact secret-looking substrings before memory persistence.
 * Fail-closed: store redacted content; never write raw secret-looking strings.
 */

const REDACTED = "[REDACTED]";

/** Patterns matched case-insensitively; replacements preserve structure where useful. */
const SECRET_PATTERNS: RegExp[] = [
  // api_key=... / api-key: ...
  /\bapi[_-]?key\s*[=:]\s*\S+/gi,
  // OpenAI-style sk-... tokens
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  // password=... / password: ...
  /\bpassword\s*[=:]\s*\S+/gi,
  // Authorization Bearer tokens
  /\bBearer\s+[A-Za-z0-9._\-+=/]+/gi,
  // AWS access key id (AKIA...)
  /\bAKIA[0-9A-Z]{16}\b/g,
  // AWS secret access key rough (40-char base64-ish after aws_secret / secretAccessKey)
  /\b(?:aws[_-]?secret[_-]?(?:access[_-]?)?key|secretAccessKey)\s*[=:]\s*\S+/gi,
];

/**
 * Replace secret-looking substrings in free-text content.
 * Idempotent on already-redacted segments that no longer match patterns.
 */
export function redactSecretLikeContent(content: string): string {
  if (typeof content !== "string" || content.length === 0) return content;
  let out = content;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, REDACTED);
  }
  return out;
}

export const SECRET_REDACTION_TOKEN = REDACTED;
