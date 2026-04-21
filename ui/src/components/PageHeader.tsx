/**
 * PageHeader — the canonical top-of-page orientation block.
 *
 * Every page-level route should lead with this so users always know where
 * they are and why in plain language. The pattern was already present on
 * Dashboard / Goals / Approvals / Inbox / Activity / Fleet but re-inlined
 * on each page, which is why the detail pages (IssueDetail, ApprovalDetail,
 * RoutineDetail, ProjectDetail, GoalDetail) and all the settings surfaces
 * drifted out of pattern.
 *
 * Keep this dumb on purpose — title + subtitle + optional right-aligned
 * actions. Anything fancier (tabs, filters, pills) can compose below.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** The page title. Rendered as an h1 at text-3xl. Accepts a string or
   * inline ReactNode so pages can include lightweight qualifiers (eg. a Beta
   * chip) adjacent to the heading. Keep this restrained — anything larger
   * than a small badge belongs in `actions` or below the header. */
  title: ReactNode;
  /** Plain-language sentence under the title. Keep it conversational. */
  subtitle?: string;
  /** Tiny uppercase label above the title (rare — use sparingly). */
  eyebrow?: string;
  /** Right-aligned content — typically a primary CTA or a filter group. */
  actions?: ReactNode;
  /** Extra className on the wrapper. */
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-sm text-muted-foreground/70">{subtitle}</p>
        )}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
