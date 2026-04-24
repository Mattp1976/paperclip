/**
 * electron-builder `afterSign` hook — macOS notarization.
 *
 * Submits the signed .app to Apple's notary service via `notarytool`. The tool
 * uploads the app, Apple checks for malware/entitlement issues, staples the
 * approval ticket back onto the bundle, and — if all's well — returns a
 * stapled .app that passes Gatekeeper without the "unidentified developer"
 * prompt.
 *
 * Required env vars (set in GitHub Actions via repo secrets):
 *   APPLE_ID                      — your Apple Developer Account email
 *   APPLE_APP_SPECIFIC_PASSWORD   — app-specific password from appleid.apple.com
 *   APPLE_TEAM_ID                 — 10-char Team ID from Apple Developer portal
 *
 * If any of those are unset the hook no-ops with a warning. This lets local
 * unsigned dev builds (`pnpm package:desktop`) still produce a .dmg without
 * needing Apple creds on every machine.
 *
 * NOTE: `.cjs` (not `.js`) because electron-builder loads hooks with `require`
 * and the desktop package is `"type": "module"`.
 */
const { notarize } = require("@electron/notarize");

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") return;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.log(
      "[notarize] APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not all set — skipping notarization. " +
        "The resulting .dmg will trigger Gatekeeper's 'unidentified developer' prompt on first open.",
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;
  console.log(`[notarize] Submitting ${appPath} to Apple notary service…`);

  const started = Date.now();
  await notarize({
    tool: "notarytool",
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
  console.log(
    `[notarize] Done in ${Math.round((Date.now() - started) / 1000)}s. Ticket stapled.`,
  );
};
