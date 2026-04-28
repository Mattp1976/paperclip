/**
 * OutcomeDecisionQueue — pending approvals scoped to this outcome's
 * step issues.
 *
 * Sprint 2 v1: minimal card per pending approval, links into the
 * existing approval detail page. Sprint 5 enriches with trade-offs,
 * recommendations, and cost/risk implications.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { CheckCircle2, ArrowRight, ListTodo } from "lucide-react";
import { approvalsApi } from "@/api/approvals";
import { queryKeys } from "@/lib/queryKeys";
import { SoftCard } from "@/components/SoftCard";
import type { Approval, OrchestraPlanStep } from "@orqestra/shared";
import { relativeTime } from "@/lib/utils";

interface OutcomeDecisionQueueProps {
  companyId: string;
  steps: OrchestraPlanStep[];
}

export function OutcomeDecisionQueue({
  companyId,
  steps,
}: OutcomeDecisionQueueProps) {
  const issueIds = new Set(
    steps.map((s) => s.issueId).filter((x): x is string => !!x),
  );

  const approvalsQuery = useQuery({
    queryKey: queryKeys.approvals.list(companyId, "pending"),
    queryFn: () => approvalsApi.list(companyId, "pending"),
    enabled: !!companyId,
    refetchInterval: 8000,
  });

  // Filter to approvals tied to one of this outcome's step issues.
  // The link is via approval.payload.issueId by convention; we also keep
  // any approval where the payload references the outcomeId directly.
  const scoped = (approvalsQuery.data ?? []).filter((a) =>
    isScopedToOutcome(a, issueIds, steps),
  );

  return (
    <SoftCard className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <ListTodo className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          Decisions waiting on you
        </h2>
        {scoped.length > 0 ? (
          <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {scoped.length}
          </span>
        ) : null}
      </div>

      {scoped.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600/80" />
          Nothing waiting on you right now
        </div>
      ) : (
        <ul className="space-y-2">
          {scoped.map((a) => (
            <li key={a.id}>
              <Link
                to={`/approvals/${a.id}`}
                className="group flex items-start justify-between gap-2 rounded-xl border border-border/60 bg-background/60 p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {labelForApproval(a)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Requested {relativeTime(new Date(a.createdAt))}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground/80 mt-0.5 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SoftCard>
  );
}

function isScopedToOutcome(
  approval: Approval,
  issueIds: Set<string>,
  steps: OrchestraPlanStep[],
): boolean {
  const payload = approval.payload as Record<string, unknown> | null;
  if (!payload) return false;
  const issueId = typeof payload.issueId === "string" ? payload.issueId : null;
  if (issueId && issueIds.has(issueId)) return true;
  const outcomeId =
    typeof payload.outcomeId === "string" ? payload.outcomeId : null;
  if (outcomeId && steps.length > 0 && steps[0].outcomeId === outcomeId) {
    return true;
  }
  return false;
}

function labelForApproval(approval: Approval): string {
  // Approvals carry domain-specific payload fields. Try a few common
  // shapes; fall back to the type label.
  const p = approval.payload as Record<string, unknown> | null;
  if (p) {
    if (typeof p.title === "string" && p.title.trim()) return p.title;
    if (typeof p.summary === "string" && p.summary.trim()) {
      return String(p.summary).slice(0, 120);
    }
  }
  return prettyType(approval.type);
}

function prettyType(type: string): string {
  return type
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
