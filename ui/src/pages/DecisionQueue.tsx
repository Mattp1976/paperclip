/**
 * DecisionQueue — the new approvals surface.
 *
 * Sprint 5 of the Product Maturity Phase. Replaces the flat list at
 * /approvals (which still works for power users — see "View all
 * approvals" link) with a richer trade-off-led queue.
 *
 * Lives at /{COMPANY_PREFIX}/decisions.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { CheckCircle2, ArrowRight, ListTodo } from "lucide-react";
import { approvalsApi } from "@/api/approvals";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { queryKeys } from "@/lib/queryKeys";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { DecisionCard } from "@/components/decisions/DecisionCard";

export function DecisionQueue() {
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Decisions" }]);
  }, [setBreadcrumbs]);

  const companyId = selectedCompany?.id ?? null;

  const pendingQuery = useQuery({
    queryKey: queryKeys.approvals.list(companyId ?? "_", "pending"),
    queryFn: () => approvalsApi.list(companyId!, "pending"),
    enabled: !!companyId,
    refetchInterval: 10_000,
  });

  if (!companyId) {
    return (
      <div className="px-4">
        <EmptyState
          icon={ListTodo}
          message="Select a company to see decisions"
        />
      </div>
    );
  }

  if (pendingQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <PageSkeleton />
      </div>
    );
  }

  const pending = pendingQuery.data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Decisions waiting on you
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Each card is one decision. We show what is being asked, why it
          matters, what it might cost, and a recommendation you can take or
          ignore. Nothing runs and no money is spent until you approve
        </p>
      </header>

      {pending.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/60 p-8 text-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">
            Nothing waiting on you right now
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            We will surface decisions here the moment an agent needs your
            sign-off
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((a) => (
            <DecisionCard key={a.id} approval={a} companyId={companyId} />
          ))}
        </div>
      )}

      <div className="flex justify-center pt-4">
        <Link
          to="/approvals"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          View all approvals (legacy view)
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
