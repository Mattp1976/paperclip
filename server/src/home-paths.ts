import os from "node:os";
import path from "node:path";

const DEFAULT_INSTANCE_ID = "default";
const INSTANCE_ID_RE = /^[a-zA-Z0-9_-]+$/;
const PATH_SEGMENT_RE = /^[a-zA-Z0-9_-]+$/;
const FRIENDLY_PATH_SEGMENT_RE = /[^a-zA-Z0-9._-]+/g;

function expandHomePrefix(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.resolve(os.homedir(), value.slice(2));
  return value;
}

export function resolvePaperclipHomeDir(): string {
  const envHome = process.env.PAPERCLIP_HOME?.trim();
  if (envHome) return path.resolve(expandHomePrefix(envHome));
  return path.resolve(os.homedir(), ".paperclip");
}

export function resolvePaperclipInstanceId(): string {
  const raw = process.env.PAPERCLIP_INSTANCE_ID?.trim() || DEFAULT_INSTANCE_ID;
  if (!INSTANCE_ID_RE.test(raw)) {
    throw new Error(`Invalid PAPERCLIP_INSTANCE_ID '${raw}'.`);
  }
  return raw;
}

export function resolvePaperclipInstanceRoot(): string {
  return path.resolve(resolvePaperclipHomeDir(), "instances", resolvePaperclipInstanceId());
}

export function resolveDefaultConfigPath(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "config.json");
}

export function resolveDefaultEmbeddedPostgresDir(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "db");
}

export function resolveDefaultLogsDir(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "logs");
}

export function resolveDefaultSecretsKeyFilePath(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "secrets", "master.key");
}

export function resolveDefaultStorageDir(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "data", "storage");
}

export function resolveDefaultBackupDir(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "data", "backups");
}

export function resolveDefaultAgentWorkspaceDir(agentId: string): string {
  const trimmed = agentId.trim();
  if (!PATH_SEGMENT_RE.test(trimmed)) {
    throw new Error(`Invalid agent id for workspace path '${agentId}'.`);
  }
  return path.resolve(resolvePaperclipInstanceRoot(), "workspaces", trimmed);
}

function sanitizeFriendlyPathSegment(value: string | null | undefined, fallback = "_default"): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return fallback;
  const sanitized = trimmed
    .replace(FRIENDLY_PATH_SEGMENT_RE, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || fallback;
}

/**
 * Canonical on-disk layout for everything owned by a single project:
 *
 *   <instance>/projects/<company>/<project>/
 *     workspace/<repo>/     git checkout + agent scratch for the codebase
 *     runs/<runId>/         per-run logs, artifacts, exports (see below)
 *     exports/              project-level exports not tied to a single run
 *
 *   <instance>/projects/<company>/<project>/runs/<runId>/
 *     logs.ndjson           appended agent stream log
 *     artifacts/            files the agent wrote during the run
 *     exports/              rendered deliverables (pdf, docx, ...)
 *
 * All helpers below derive from a single root so callers never need to
 * know the instance-level path shape.
 */
export function resolveProjectRootDir(input: {
  companyId: string;
  projectId: string;
}): string {
  const companyId = input.companyId.trim();
  const projectId = input.projectId.trim();
  if (!companyId || !projectId) {
    throw new Error("Project root path requires companyId and projectId.");
  }
  return path.resolve(
    resolvePaperclipInstanceRoot(),
    "projects",
    sanitizeFriendlyPathSegment(companyId, "company"),
    sanitizeFriendlyPathSegment(projectId, "project"),
  );
}

export function resolveProjectWorkspaceDir(input: {
  companyId: string;
  projectId: string;
  repoName?: string | null;
}): string {
  return path.resolve(
    resolveProjectRootDir(input),
    "workspace",
    sanitizeFriendlyPathSegment(input.repoName, "_default"),
  );
}

export function resolveProjectRunDir(input: {
  companyId: string;
  projectId: string;
  runId: string;
}): string {
  const runId = input.runId.trim();
  if (!runId) {
    throw new Error("Project run path requires runId.");
  }
  return path.resolve(
    resolveProjectRootDir(input),
    "runs",
    sanitizeFriendlyPathSegment(runId, "run"),
  );
}

export function resolveProjectRunArtifactsDir(input: {
  companyId: string;
  projectId: string;
  runId: string;
}): string {
  return path.resolve(resolveProjectRunDir(input), "artifacts");
}

export function resolveProjectRunExportsDir(input: {
  companyId: string;
  projectId: string;
  runId: string;
}): string {
  return path.resolve(resolveProjectRunDir(input), "exports");
}

export function resolveProjectRunLogPath(input: {
  companyId: string;
  projectId: string;
  runId: string;
}): string {
  return path.resolve(resolveProjectRunDir(input), "logs.ndjson");
}

/**
 * Legacy layout used before the per-project consolidation:
 *   <instance>/projects/<company>/<project>/<repo>
 * Kept as a fallback so existing checkouts still resolve without a
 * data migration. New clones land at resolveProjectWorkspaceDir().
 */
export function resolveLegacyManagedProjectWorkspaceDir(input: {
  companyId: string;
  projectId: string;
  repoName?: string | null;
}): string {
  return path.resolve(
    resolveProjectRootDir(input),
    sanitizeFriendlyPathSegment(input.repoName, "_default"),
  );
}

export function resolveManagedProjectWorkspaceDir(input: {
  companyId: string;
  projectId: string;
  repoName?: string | null;
}): string {
  return resolveProjectWorkspaceDir(input);
}

export function resolveHomeAwarePath(value: string): string {
  return path.resolve(expandHomePrefix(value));
}
