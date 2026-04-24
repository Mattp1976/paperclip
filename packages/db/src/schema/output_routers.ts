/**
 * output_routers — "when a run finishes, where should the output go?"
 *
 * Each row declares a destination. After a run completes successfully the
 * server consults this table for matching routers (filtered by company /
 * project / provider-specific rules in `filter`), invokes the provider
 * sender with the run's result, and records the delivery as an
 * issue_work_product row.
 *
 * Providers for v0.1:
 *   - "slack_webhook"  — POST a formatted message to an incoming webhook.
 *                        Simplest to ship because it only needs a URL in
 *                        company_secrets, no OAuth dance.
 *   - "google_drive"   — stubbed; needs OAuth + Drive API. Lives in the
 *                        schema so UI/service can show it as "coming soon"
 *                        without a later migration.
 *   - "gmail"          — stubbed; needs OAuth + Gmail send scope.
 *
 * Config shape is provider-specific and validated in the service layer
 * (see output-routers.ts). The jsonb column stores whatever the provider
 * needs — a secret ref, a channel override, folder IDs, recipient lists.
 *
 * Filter shape is a coarse allowlist:
 *   { agentIds?: string[], statuses?: ("succeeded" | "failed")[], minCostUsd?: number }
 * Absent / null filter = fire for every successful run in scope.
 */
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";

export const OUTPUT_ROUTER_PROVIDERS = [
  "slack_webhook",
  "google_drive",
  "gmail",
] as const;
export type OutputRouterProvider = (typeof OUTPUT_ROUTER_PROVIDERS)[number];

export const outputRouters = pgTable(
  "output_routers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    /** null = applies to every project in the company. Non-null = scoped. */
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    /** Human-readable label shown in the UI ("Eng channel", "Finance folder"). */
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    /** Provider-specific config — shape validated in the service. */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    /** Coarse filter; null = no filter. */
    filter: jsonb("filter").$type<Record<string, unknown> | null>(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyEnabledIdx: index("output_routers_company_enabled_idx").on(
      table.companyId,
      table.enabled,
    ),
    companyProjectIdx: index("output_routers_company_project_idx").on(
      table.companyId,
      table.projectId,
    ),
  }),
);

export type OutputRouterRow = typeof outputRouters.$inferSelect;
export type OutputRouterInsert = typeof outputRouters.$inferInsert;
