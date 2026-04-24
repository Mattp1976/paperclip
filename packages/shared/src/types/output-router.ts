/**
 * Shared types for output routers.
 *
 * Kept UI-agnostic so both the server API and the UI can import them.
 * Config types are per-provider discriminated unions — add a new provider
 * by extending `OutputRouterProvider` and `OutputRouterConfig` together.
 */

export const OUTPUT_ROUTER_PROVIDERS = [
  "slack_webhook",
  "google_drive",
  "gmail",
] as const;
export type OutputRouterProvider = (typeof OUTPUT_ROUTER_PROVIDERS)[number];

export interface SlackWebhookRouterConfig {
  /** Secret id (from company_secrets) holding the webhook URL. */
  webhookSecretId: string;
  /** Optional channel override if the webhook is app-scoped. */
  channel?: string | null;
  /** Optional prefix for the posted message. Falls back to agent + run. */
  messagePrefix?: string | null;
}

export interface GoogleDriveRouterConfig {
  /** Folder ID under which to create delivery files. */
  folderId: string;
  /** OAuth token secret id once Drive provider ships. */
  authSecretId: string;
}

export interface GmailRouterConfig {
  /** Recipients separated by commas. */
  to: string;
  cc?: string | null;
  bcc?: string | null;
  /** OAuth token secret id once Gmail provider ships. */
  authSecretId: string;
}

export type OutputRouterConfig =
  | ({ provider: "slack_webhook" } & SlackWebhookRouterConfig)
  | ({ provider: "google_drive" } & GoogleDriveRouterConfig)
  | ({ provider: "gmail" } & GmailRouterConfig);

export interface OutputRouterFilter {
  /** Only fire for runs from these agents. Absent = any agent. */
  agentIds?: string[];
  /** Terminal statuses that trigger dispatch. Default: ["succeeded"]. */
  statuses?: Array<"succeeded" | "failed" | "timed_out" | "cancelled">;
  /** Skip runs cheaper than this threshold (USD). Useful to filter noise. */
  minCostUsd?: number;
}

export interface OutputRouter {
  id: string;
  companyId: string;
  /** null = company-wide (every project). */
  projectId: string | null;
  name: string;
  provider: OutputRouterProvider;
  /** Provider-specific config — shape validated in the service layer. */
  config: Record<string, unknown>;
  filter: OutputRouterFilter | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OutputRouterCreateRequest {
  name: string;
  provider: OutputRouterProvider;
  projectId?: string | null;
  config: Record<string, unknown>;
  filter?: OutputRouterFilter | null;
  enabled?: boolean;
}

export interface OutputRouterUpdateRequest {
  name?: string;
  projectId?: string | null;
  config?: Record<string, unknown>;
  filter?: OutputRouterFilter | null;
  enabled?: boolean;
}

/**
 * Result a provider returns after attempting to deliver a run's output.
 * The service translates this into an issue_work_product row.
 */
export interface OutputRouterDeliveryResult {
  /** Stable external identifier for the delivered artifact, if any. */
  externalId: string | null;
  /** Link back to the delivered artifact (Slack message, Drive file, …). */
  url: string | null;
  /** Human-readable one-liner shown in the work-product card. */
  summary: string;
  /** "active" on success; "failed" when delivery errored. */
  status: "active" | "failed";
  /** Arbitrary provider metadata (timestamps, API response IDs, error info). */
  metadata?: Record<string, unknown> | null;
}
