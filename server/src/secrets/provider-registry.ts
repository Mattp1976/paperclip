import type { SecretProvider, SecretProviderDescriptor } from "@mattparrytfc/shared";
import { localEncryptedProvider } from "./local-encrypted-provider.js";
import { railwayEnvProvider } from "./railway-env-provider.js";
import {
  awsSecretsManagerProvider,
  gcpSecretManagerProvider,
  vaultProvider,
} from "./external-stub-providers.js";
import type { SecretProviderModule } from "./types.js";
import { unprocessable } from "../errors.js";

const providers: SecretProviderModule[] = [
  railwayEnvProvider,        // New default — env-var based, no encryption
  localEncryptedProvider,    // Legacy — kept for reading existing secrets
  awsSecretsManagerProvider,
  gcpSecretManagerProvider,
  vaultProvider,
];

const providerById = new Map<SecretProvider, SecretProviderModule>(
  providers.map((provider) => [provider.id, provider]),
);

export function getSecretProvider(id: SecretProvider): SecretProviderModule {
  const provider = providerById.get(id);
  if (!provider) throw unprocessable(`Unsupported secret provider: ${id}`);
  return provider;
}

export function listSecretProviders(): SecretProviderDescriptor[] {
  return providers.map((provider) => provider.descriptor);
}

/**
 * Returns the provider ID that should be used for new secrets.
 * Reads from PAPERCLIP_SECRETS_PROVIDER env var, defaulting to "railway_env".
 */
export function getDefaultSecretProviderId(): SecretProvider {
  const configured = process.env.PAPERCLIP_SECRETS_PROVIDER;
  if (configured && providerById.has(configured as SecretProvider)) {
    return configured as SecretProvider;
  }
  return "railway_env" as SecretProvider;
}
