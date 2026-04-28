/**
 * Clipmart — the marketplace of pre-built autonomous companies.
 *
 * Sprint 3 of the Product Maturity Phase. Replaces "templates" the user
 * has to think about with "companies you can install in one click".
 *
 * Lives at /{COMPANY_PREFIX}/clipmart. The brief asks for 6 launch
 * templates; we ship 7 (the 6 named in the brief plus the legacy
 * Agent Collective demo team).
 *
 * Flow:
 *   1. Browse cards → see team size, typical outcomes, setup time, adapters.
 *   2. Open a detail drawer for the deeper read.
 *   3. Click "Install company" → POST /companies/:id/fleet-templates/:tid/install.
 *   4. After install, optionally one-tap launch a starter outcome via /start.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import { Sparkles, Wand2 } from "lucide-react";
import { fleetTemplatesApi } from "@/api/fleetTemplates";
import type { FleetTemplateListItem } from "@/api/fleetTemplates";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { queryKeys } from "@/lib/queryKeys";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { CompanyTemplateCard } from "@/components/clipmart/CompanyTemplateCard";
import { TemplateDetailDrawer } from "@/components/clipmart/TemplateDetailDrawer";

export function Clipmart() {
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "Clipmart" }]);
  }, [setBreadcrumbs]);

  const companyId = selectedCompany?.id ?? null;

  const templatesQuery = useQuery({
    queryKey: ["clipmart", "templates"] as const,
    queryFn: () => fleetTemplatesApi.list(),
  });

  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [pendingStarterOutcome, setPendingStarterOutcome] = useState<
    FleetTemplateListItem["starterOutcomes"][number] | null
  >(null);

  const installMutation = useMutation({
    mutationFn: async (templateId: string) => {
      if (!companyId) throw new Error("Select a company first");
      return fleetTemplatesApi.install(companyId, templateId);
    },
    onMutate: (templateId) => setInstallingId(templateId),
    onSettled: () => setInstallingId(null),
    onSuccess: (_data, templateId) => {
      setInstalledIds((prev) => new Set(prev).add(templateId));
      if (companyId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.list(companyId),
        });
      }
      // If a starter outcome was teed up, hop straight to /start with
      // the brief pre-filled via location state.
      if (pendingStarterOutcome) {
        navigate("/start", {
          state: {
            outcomeBriefPrefill: pendingStarterOutcome,
          },
        });
        setPendingStarterOutcome(null);
      }
    },
  });

  const openTemplate = useMemo(
    () =>
      (templatesQuery.data ?? []).find((t) => t.id === openTemplateId) ?? null,
    [openTemplateId, templatesQuery.data],
  );

  if (!companyId) {
    return (
      <div className="px-4">
        <EmptyState
          icon={Sparkles}
          message="Select a company to install a Clipmart team"
        />
      </div>
    );
  }

  if (templatesQuery.isLoading) {
    return (
      <div className="px-4 pb-12 max-w-6xl mx-auto pt-6">
        <PageSkeleton />
      </div>
    );
  }

  const templates = templatesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 space-y-8">
      {/* Hero */}
      <header className="space-y-3">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Wand2 className="h-3.5 w-3.5" />
          Clipmart
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Install a company in one click
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          Browse pre-built AI companies. Each one comes with a team, starter
          projects, and a handful of outcomes you can run on day one. Install
          one into your workspace and start delegating
        </p>
      </header>

      {/* Catalogue */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <CompanyTemplateCard
            key={t.id}
            template={t}
            onOpen={() => setOpenTemplateId(t.id)}
            onInstall={() => installMutation.mutate(t.id)}
            installing={installingId === t.id}
          />
        ))}
      </section>

      {/* Detail drawer */}
      <TemplateDetailDrawer
        template={openTemplate}
        open={!!openTemplate}
        onClose={() => setOpenTemplateId(null)}
        installing={!!openTemplate && installingId === openTemplate.id}
        installed={!!openTemplate && installedIds.has(openTemplate.id)}
        onInstall={() => {
          if (openTemplate) installMutation.mutate(openTemplate.id);
        }}
        onPickStarterOutcome={(o) => {
          // Tee the starter outcome up so the install handler navigates
          // to /start with the brief pre-filled. If already installed,
          // jump straight to /start.
          if (openTemplate && installedIds.has(openTemplate.id)) {
            navigate("/start", {
              state: { outcomeBriefPrefill: o },
            });
            return;
          }
          setPendingStarterOutcome(o);
          if (openTemplate) installMutation.mutate(openTemplate.id);
        }}
      />

      {/* Error surfacing */}
      {installMutation.error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-300">
          {installMutation.error instanceof Error
            ? installMutation.error.message
            : "Install failed"}
        </div>
      ) : null}
    </div>
  );
}
