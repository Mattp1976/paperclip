// Composite identifier helpers for task URLs and displays.
//
// Historically a task was addressed by bare identifier like `PAP-42`. That's
// the column we still uniquely index on, but it means URLs, PDF filenames and
// agent references read as "just numbers" with no hint what the task is
// about.
//
// This module adds a derived, deterministic URL key of the form
// `{PREFIX}-{NUMBER}-{title-slug}` (e.g. `PAP-42-hire-first-engineer`). The
// slug is computed from the title on demand — nothing is persisted, so there
// is no migration and existing bare identifiers still resolve via
// `extractIssueIdentifier`.
//
// Rules:
// - `{PREFIX}` is uppercase letters/digits
// - `{NUMBER}` is a positive integer
// - `{slug}` is lowercase kebab, max 40 chars, stripped of empty trailing
//   segments. Slug portion is optional in URLs (both short and long forms
//   must resolve to the same task).

const SLUG_SPLIT_RE = /[^a-z0-9]+/g;
const SLUG_TRIM_RE = /^-+|-+$/g;
const MAX_SLUG_LENGTH = 40;

/**
 * Turn a task title into a lowercase kebab slug capped at 40 chars. Returns
 * an empty string if the title is null/undefined or contains no slug-safe
 * characters — callers should treat empty-string as "no slug available" and
 * fall through to the bare identifier.
 */
export function normalizeIssueSlug(title: string | null | undefined): string {
  if (typeof title !== "string") return "";
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(SLUG_SPLIT_RE, "-")
    .replace(SLUG_TRIM_RE, "");
  if (normalized.length === 0) return "";
  // Truncate at char limit and trim any trailing partial-word hyphen.
  const sliced = normalized.slice(0, MAX_SLUG_LENGTH).replace(SLUG_TRIM_RE, "");
  return sliced;
}

/**
 * Build the canonical URL key for a task: `{identifier}-{slug}` when the
 * slug is derivable from the title, otherwise just `{identifier}`. Returns
 * `null` when the task has no identifier (pre-identifier-migration rows).
 */
export function deriveIssueUrlKey(
  issue: { identifier?: string | null; title?: string | null } | null | undefined,
): string | null {
  if (!issue) return null;
  const id = typeof issue.identifier === "string" ? issue.identifier.trim() : "";
  if (id.length === 0) return null;
  const slug = normalizeIssueSlug(issue.title);
  return slug.length > 0 ? `${id}-${slug}` : id;
}

/**
 * Pull the canonical `{PREFIX}-{NUMBER}` identifier out of a URL key that
 * may or may not carry a trailing slug. Matches case-insensitively and
 * returns the identifier uppercased (matching how it's stored).
 *
 * Returns `null` if the URL key doesn't look like a task identifier at all
 * (lets the caller fall back to UUID lookup).
 */
export function extractIssueIdentifier(urlKey: string | null | undefined): string | null {
  if (typeof urlKey !== "string") return null;
  const trimmed = urlKey.trim();
  if (trimmed.length === 0) return null;
  // Match `{prefix}-{number}` at the start. Prefix is 1+ alphanumerics,
  // number is 1+ digits. Anything after (another `-...`) is treated as the
  // optional slug suffix and ignored for lookup.
  const match = trimmed.match(/^([A-Za-z0-9]+)-(\d+)(?:-.*)?$/);
  if (!match) return null;
  return `${match[1].toUpperCase()}-${match[2]}`;
}
