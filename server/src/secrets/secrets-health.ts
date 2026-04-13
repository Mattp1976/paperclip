/**
 * Secrets Health Check
 *
 * Phase 1 gate criteria: "A secret round-trips successfully through the
 * new provider." This module provides a health check endpoint and a
 * startup self-test that validates the configured secrets provider can
 * create and resolve a test secret without error.
 *
 * Exposed at GET /api/health/secrets for operational monitoring.
 */

import { getSecretProvider, getDefaultSecretProviderId } from "../secrets/provider-registry.js";

export interface SecretsHealthResult {
  status: "ok" | "degraded" | "error";
  provider: string;
  roundTripMs?: number;
  error?: string;
  legacyProviderAvailable: boolean;
}

/**
 * Run a round-trip test: create a version with a test value, then
 * resolve it back. For railway_env provider this requires a test
 * env var to exist; for local_encrypted it exercises the full
 * encrypt/decrypt path.
 */
export async function checkSecretsHealth(): Promise<SecretsHealthResult> {
  const providerId = getDefaultSecretProviderId();
  const result: SecretsHealthResult = {
    status: "ok",
    provider: providerId,
    legacyProviderAvailable: false,
  };

  // Check if legacy provider is still available (for migration)
  try {
    getSecretProvider("local_encrypted" as any);
    result.legacyProviderAvailable = true;
  } catch {
    result.legacyProviderAvailable = false;
  }

  // Round-trip test for the configured default provider
  const start = Date.now();
  try {
    const provider = getSecretProvider(providerId);

    if (providerId === ("railway_env" as any)) {
      // For railway_env, we test with a known env var
      // Use PAPERCLIP_SECRETS_HEALTH_TEST_VAR or fall back to DATABASE_URL
      // (which should always exist on Railway)
      const testVar = process.env.PAPERCLIP_SECRETS_HEALTH_TEST_VAR || "DATABASE_URL";
      if (!process.env[testVar]) {
        result.status = "degraded";
        result.error = `No test env var available (tried ${testVar})`;
        return result;
      }

      const created = await provider.createVersion({
        value: testVar,
        externalRef: null,
      });

      const resolved = await provider.resolveVersion({
        material: created.material,
        externalRef: null,
      });

      if (resolved !== process.env[testVar]) {
        result.status = "error";
        result.error = "Round-trip value mismatch";
        return result;
      }
    } else {
      // For other providers (local_encrypted, etc), test with a dummy value
      const testValue = `health-check-${Date.now()}`;
      const created = await provider.createVersion({
        value: testValue,
        externalRef: null,
      });

      const resolved = await provider.resolveVersion({
        material: created.material,
        externalRef: created.externalRef,
      });

      if (resolved !== testValue) {
        result.status = "error";
        result.error = "Round-trip value mismatch";
        return result;
      }
    }

    result.roundTripMs = Date.now() - start;
  } catch (err: any) {
    result.status = "error";
    result.error = err?.message ?? "Unknown error";
    result.roundTripMs = Date.now() - start;
  }

  return result;
}

/**
 * Run at server startup. Logs a warning if secrets health is not OK
 * but does NOT prevent the server from starting (so existing secrets
 * can still be read via the legacy provider during migration).
 */
export async function runSecretsStartupCheck(): Promise<void> {
  try {
    const health = await checkSecretsHealth();
    if (health.status === "ok") {
      console.log(
        `[secrets] Health check passed — provider="${health.provider}" roundTrip=${health.roundTripMs}ms`,
      );
    } else if (health.status === "degraded") {
      console.warn(
        `[secrets] Health check degraded — provider="${health.provider}" error="${health.error}"`,
      );
    } else {
      console.error(
        `[secrets] Health check FAILED — provider="${health.provider}" error="${health.error}"`,
      );
      console.error(
        `[secrets] The default secrets provider is not functioning. ` +
          `Existing secrets using "local_encrypted" may still resolve if PAPERCLIP_SECRETS_MASTER_KEY is set.`,
      );
    }

    if (health.legacyProviderAvailable) {
      console.log(`[secrets] Legacy provider "local_encrypted" is available for existing secrets.`);
    }
  } catch (err: any) {
    console.error(`[secrets] Startup check threw unexpectedly: ${err?.message}`);
  }
}
