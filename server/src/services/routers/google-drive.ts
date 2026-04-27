/**
 * Google Drive sender — stub.
 *
 * The schema, service layer, and UI surface treat Drive as a supported
 * provider from day one, but delivery itself is not wired yet. Building
 * this out requires:
 *
 *   1. OAuth flow — we need refresh tokens per company stored in
 *      companySecrets. The existing secrets service handles the storage;
 *      we need a new "oauth_refresh" provider type plus redirect handlers.
 *   2. Drive API client — `googleapis` or a slim fetch-based wrapper.
 *      Whichever, it must respect the company's rate limits.
 *   3. Format choice — markdown for the summary, plus the run's artifacts
 *      (any files in the execution workspace flagged as outputs) uploaded
 *      alongside.
 *
 * Until that's done this sender throws with a clear "not yet enabled"
 * message so a misconfigured router surfaces an explicit error rather
 * than silently swallowing runs.
 */
import type { OutputRouterDeliveryResult } from "@orqestra/shared";
import type { SenderArgs } from "./slack.js";

export async function sendViaGoogleDrive(
  args: SenderArgs,
): Promise<OutputRouterDeliveryResult> {
  // Intentionally no-op so TypeScript / linting is happy with the arg.
  void args;
  throw new Error(
    "Google Drive output router is not yet enabled. See server/src/services/routers/google-drive.ts for the remaining work.",
  );
}
