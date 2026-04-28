/**
 * DecisionCard — one decision waiting on the user, rendered as a
 * proper trade-off card rather than a list row.
 *
 * Shows: what is being requested · why it matters · trade-offs ·
 * recommendation · primary actions (approve / reject) + view-detail.
 *
 * Approve / reject mutate via the existing approvalsApi. View detail
 * navigates to the existing /approvals/:id surface for the full
 * conversation thread.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { Loader2, Check, X, ArrowRight, Clock } from "lucide-react";
import type { Approval } from "@orqestra/shared";
import { approvalsApi } from "@/api/approvals";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { SoftCard } from "@/components/SoftCard";
import { relativeTime } from "@/lib/utils";
import { DecisionTradeOffs } from "./DecisionTradeOffs";
import { ApprovalRecommendation } from "./ApprovalRecommendation";
import { DecisionNarrative } from "@/components/narrative/DecisionNarrative";

interface DecisionCardProps {
  approval: Approval;
  companyId: string;
}

export function DecisionCard({ approval, companyId }: DecisionCardProps) {
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: () => approvalsApi.approve(approval.id),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.list(companyId, "pending"),
      }),
  });

  const rejectMutation = useMutation({
    mutationFn: () => approvalsApi.reject(approval.id),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.approvals.list(companyId, "pending"),
      }),
  });

  const busy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <SoftCard className="p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Decision needed
          </p>
          <h3 className="text-base font-semibold text-foreground leading-tight">
            {decisionTitle(approval)}
          </h3>
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Requested {relativeTime(new Date(approval.createdAt))}
          </p>
        </div>
        <Link
          to={`/approvals/${approval.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Open
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <DecisionNarrative approval={approval} />

      <DecisionTradeOffs approval={approval} />

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <ApprovalRecommendation approval={approval} />

        <div className="flex items-center gap-2 ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => rejectMutation.mutate()}
            className="gap-1.5"
          >
            {rejectMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            Reject
          </Button>
          <Button
            type="button"
            variant="sage"
            size="sm"
            disabled={busy}
            onClick={() => approveMutation.mutate()}
            className="gap-1.5"
          >
            {approveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Approve
          </Button>
        </div>
      </div>

      {(approveMutation.error || rejectMutation.error) ? (
        <p className="text-xs text-destructive">
          {(
            (approveMutation.error ?? rejectMutation.error) as Error
          ).message}
        </p>
      ) : null}
    </SoftCard>
  );
}

function decisionTitle(approval: Approval): string {
  const p = (approval.payload ?? {}) as Record<string, unknown>;
  if (typeof p.title === "string" && p.title.trim()) return p.title;
  if (typeof p.summary === "string" && p.summary.trim()) {
    return String(p.summary).slice(0, 140);
  }
  return prettyType(approval.type);
}

function prettyType(type: string): string {
  return type
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
