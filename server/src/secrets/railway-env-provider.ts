/**
 * Railway Environment Variable Secret Provider
 *
 * Secrets are stored as references to Railway environment variable names.
 * At resolve time, the provider reads the value from `process.env`.
 *
 * This eliminates the encryption-at-rest pattern that breaks when
 * Railway's ephemeral filesystem loses the master key between deploys.
 *
 * ## How it works
 *
 * - `createVersion()`: Stores the env var NAME (not the value) as material.
 *   The actual secret value lives in Railway env vars.
 *
 * - `resolveVersion()`: Reads `process.env[envVarName]` and returns
 *   the plaintext value. Fails fast if the env var is missing.
 *
 * ## Migration
 *
 * Existing secrets encrypted with `local_encrypted` provider continue
 * to work through the legacy provider. New secrets default to this
 * provider when `PAPERCLIP_SECRETS_PROVIDER=railway_env`.
 */

import { createHash } from "node:crypto";
import type { SecretProviderModule, StoredSecretVersionMaterial } from "./types.js";
import { badRequest } from "../errors.js";

// ---------------------------------------------------------------------------
// Material shape
// ---------------------------------------------------------------------------

interface RailwayEnvMaterial extends StoredSecretVersionMaterial {
  scheme: "railway_env_v1";
  /** The environment variable name to read at resolve time. */
  envVarName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENV_VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isEnvVarName(value: string): boolean {
  return ENV_VAR_NAME_RE.test(value);
}

function asRailwayEnvMaterial(
  value: StoredSecretVersionMaterial,
): RailwayEnvMaterial {
  if (
    value &&
    typeof value === "object" &&
    value.scheme === "railway_env_v1" &&
    typeof value.envVarName === "string"
  ) {
    return value as RailwayEnvMaterial;
  }
  throw badRequest("Invalid railway_env secret material");
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const railwayEnvProvider: SecretProviderModule = {
  id: "railway_env" as any,
  descriptor: {
    id: "railway_env" as any,
    label: "Railway Environment Variable",
    requiresExternalRef: false,
  },

  async createVersion(input) {
    const envVarName = input.value.trim();

    if (!isEnvVarName(envVarName)) {
      throw badRequest(
        `Secret value must be a valid environment variable name (got: "${envVarName}"). ` +
          `Add the actual secret value to Railway env vars, then reference the var name here.`,
      );
    }

    // Verify the env var actually exists at creation time
    const currentValue = process.env[envVarName];
    if (currentValue === undefined) {
      throw badRequest(
        `Environment variable "${envVarName}" is not set. ` +
          `Add it to Railway environment variables before creating the secret reference.`,
      );
    }

    return {
      material: {
        scheme: "railway_env_v1" as const,
        envVarName,
      },
      // Hash the *current* value for audit trail / drift detection
      valueSha256: sha256Hex(currentValue),
      externalRef: null,
    };
  },

  async resolveVersion(input) {
    const material = asRailwayEnvMaterial(input.material);
    const value = process.env[material.envVarName];

    if (value === undefined) {
      throw badRequest(
        `Environment variable "${material.envVarName}" is not set. ` +
          `Ensure it exists in Railway environment configuration.`,
      );
    }

    return value;
  },
};
