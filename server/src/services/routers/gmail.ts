/**
 * Gmail sender — stub.
 *
 * Same story as Drive: the schema supports it, the service dispatches to
 * it, but actually sending requires OAuth with the `gmail.send` scope
 * (or an app-password / SMTP fallback for self-hosted users who don't
 * want Google OAuth). To keep the v0.1 surface simple we ship this as a
 * clear "not enabled yet" error so users know to pick Slack for now.
 *
 * To finish this:
 *   1. Add an "oauth_refresh" secret provider type for Google.
 *   2. Wire an OAuth redirect handler for the gmail.send scope.
 *   3. Build a minimal MIME composer or import `nodemailer` / `gmail-send`.
 *   4. Handle threading / `In-Reply-To` when the router is attached to an
 *      issue that already has a Gmail conversation thread.
 */
import type { OutputRouterDeliveryResult } from "@mattparrytfc/shared";
import type { SenderArgs } from "./slack.js";

export async function sendViaGmail(args: SenderArgs): Promise<OutputRouterDeliveryResult> {
  void args;
  throw new Error(
    "Gmail output router is not yet enabled. See server/src/services/routers/gmail.ts for the remaining work.",
  );
}
