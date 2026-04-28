/**
 * WorkProducts — list of completed step outputs for this outcome.
 *
 * For each step that has a linked issue, fetch its work products and
 * surface them as cards. Clicking one navigates to the work-product
 * route on the step's issue page (existing IssueDetail surface).
 *
 * Sprint 2 v1: minimal card per work product. Sprint 4+ may add
 * inline previews and source provenance once the assembler is richer.
 */
import { useQueries } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { FileText, ArrowRight } from "lucide-react";
import { issuesApi } from "@/api/issues";
import { queryKeys } from "@/lib/queryKeys";
import { SoftCard } from "@/components/SoftCard";
import type { IssueWorkProduct, OrchestraPlanStep } from "@orqestra/shared";
import { relativeTime } from "@/lib/utils";

interface WorkProductsProps {
  steps: OrchestraPlanStep[];
}

export function WorkProducts({ steps }: WorkProductsProps) {
  const issueSteps = steps.filter((s) => !!s.issueId) as Array<
    OrchestraPlanStep & { issueId: string }
  >;

  const queries = useQueries({
    queries: issueSteps.map((s) => ({
      queryKey: queryKeys.issues.workProducts(s.issueId),
      queryFn: () => issuesApi.listWorkProducts(s.issueId),
      enabled: !!s.issueId,
      refetchInterval: 12000,
    })),
  });

  type Row = {
    workProductId: string;
    title: string;
    issueId: string;
    stepTitle: string;
    createdAt: Date;
  };

  const rows: Row[] = [];
  queries.forEach((q, idx) => {
    const step = issueSteps[idx];
    const products = (q.data ?? []) as IssueWorkProduct[];
    for (const wp of products) {
      const wpRecord = wp as IssueWorkProduct & { title?: string };
      rows.push({
        workProductId: wp.id,
        title: wpRecord.title ?? `Output for ${step.title}`,
        issueId: step.issueId,
        stepTitle: step.title,
        createdAt: new Date(wp.createdAt),
      });
    }
  });

  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <SoftCard className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Work products</h2>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Outputs will appear here as steps complete
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.workProductId}>
              <Link
                to={`/issues/${r.issueId}`}
                className="group flex items-start justify-between gap-2 rounded-xl border border-border/60 bg-background/60 p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {r.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    From step:{" "}
                    <span className="text-foreground/80">{r.stepTitle}</span>
                    <span className="ml-1.5">
                      · {relativeTime(r.createdAt)}
                    </span>
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
