import { useQuery } from "@tanstack/react-query";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { relativeTime, cn } from "../lib/utils";
import { StatusBadge } from "./StatusBadge";
import {
  ExternalLink,
  FileCode2,
  GitBranch,
  GitPullRequest,
  Globe,
  Package,
  FileText,
  Eye,
  Server,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import type { IssueWorkProduct } from "@mattparrytfc/shared";

/* ── Types & helpers ───────────────────────────────────────────── */

const TYPE_META: Record<
  string,
  { icon: typeof Globe; label: string; color: string }
> = {
  preview_url: {
    icon: Globe,
    label: "Preview",
    color: "text-blue-500",
  },
  runtime_service: {
    icon: Server,
    label: "Service",
    color: "text-violet-500",
  },
  pull_request: {
    icon: GitPullRequest,
    label: "Pull Request",
    color: "text-sage-ink",
  },
  branch: {
    icon: GitBranch,
    label: "Branch",
    color: "text-orange-500",
  },
  commit: {
    icon: FileCode2,
    label: "Commit",
    color: "text-cyan-500",
  },
  artifact: {
    icon: Package,
    label: "Artifact",
    color: "text-amber-500",
  },
  document: {
    icon: FileText,
    label: "Document",
    color: "text-pink-500",
  },
};

const REVIEW_BADGE: Record<
  string,
  { icon: typeof CheckCircle2; label: string; className: string }
> = {
  needs_board_review: {
    icon: Eye,
    label: "Needs Review",
    className:
      "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  approved: {
    icon: CheckCircle2,
    label: "Approved",
    className:
      "text-sage-ink bg-[#8FA781]/10 border-[#8FA781]/20",
  },
  changes_requested: {
    icon: AlertCircle,
    label: "Changes Requested",
    className:
      "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/20",
  },
};

/* ── Single artifact card ──────────────────────────────────────── */

function ArtifactCard({ wp }: { wp: IssueWorkProduct }) {
  const meta = TYPE_META[wp.type] ?? {
    icon: Package,
    label: wp.type,
    color: "text-muted-foreground",
  };
  const TypeIcon = meta.icon;
  const review =
    wp.reviewState !== "none" ? REVIEW_BADGE[wp.reviewState] : null;
  const ReviewIcon = review?.icon ?? null;

  return (
    <div
      className={cn(
        "group rounded-lg border transition-all hover:shadow-md",
        wp.isPrimary
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card hover:border-primary/20",
      )}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Type icon */}
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
            meta.color,
            "bg-background border-border",
          )}
        >
          <TypeIcon className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{wp.title}</span>
            {wp.isPrimary && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 rounded px-1.5 py-0.5">
                Primary
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-[10px] font-medium uppercase tracking-wider", meta.color)}>
              {meta.label}
            </span>
            <StatusBadge status={wp.status} />
            {review && ReviewIcon && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  review.className,
                )}
              >
                <ReviewIcon className="h-2.5 w-2.5" />
                {review.label}
              </span>
            )}
          </div>

          {wp.summary && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {wp.summary}
            </p>
          )}

          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>{wp.provider}</span>
            <span>{relativeTime(wp.createdAt)}</span>
          </div>
        </div>

        {/* External link */}
        {wp.url && (
          <a
            href={wp.url}
            target="_blank"
            rel="noreferrer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors opacity-0 group-hover:opacity-100"
            title="Open in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

/* ── Main OutputArtifacts component ────────────────────────────── */

export function OutputArtifacts({
  issueId,
  className,
}: {
  issueId: string;
  className?: string;
}) {
  const { data: workProducts } = useQuery({
    queryKey: queryKeys.issues.workProducts(issueId),
    queryFn: () => issuesApi.listWorkProducts(issueId),
    enabled: !!issueId,
  });

  if (!workProducts || workProducts.length === 0) return null;

  // Sort: primary first, then by creation date
  const sorted = [...workProducts].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return (
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-muted-foreground">
          Outputs & Artifacts
        </h3>
        <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 tabular-nums">
          {workProducts.length}
        </span>
      </div>
      <div className="grid gap-2">
        {sorted.map((wp) => (
          <ArtifactCard key={wp.id} wp={wp} />
        ))}
      </div>
    </div>
  );
}
