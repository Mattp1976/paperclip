/**
 * Zod schemas for output router requests.
 *
 * We validate the envelope (name, provider, enabled, filter) tightly and
 * accept `config` as an opaque record. Provider-specific config shape is
 * enforced in the server-side sender modules, where the failure mode is
 * a clean "misconfigured router" error rather than an API-layer 400.
 */
import { z } from "zod";
import { OUTPUT_ROUTER_PROVIDERS } from "../types/output-router.js";

export const outputRouterProviderSchema = z.enum(
  OUTPUT_ROUTER_PROVIDERS as unknown as [string, ...string[]],
);

export const outputRouterFilterSchema = z.object({
  agentIds: z.array(z.string().uuid()).optional(),
  statuses: z
    .array(z.enum(["succeeded", "failed", "timed_out", "cancelled"]))
    .optional(),
  minCostUsd: z.number().nonnegative().optional(),
});

export const createOutputRouterSchema = z.object({
  name: z.string().min(1).max(120),
  provider: outputRouterProviderSchema,
  projectId: z.string().uuid().nullable().optional(),
  config: z.record(z.string(), z.unknown()),
  filter: outputRouterFilterSchema.nullable().optional(),
  enabled: z.boolean().optional(),
});

export type CreateOutputRouter = z.infer<typeof createOutputRouterSchema>;

export const updateOutputRouterSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    projectId: z.string().uuid().nullable().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    filter: outputRouterFilterSchema.nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateOutputRouter = z.infer<typeof updateOutputRouterSchema>;
