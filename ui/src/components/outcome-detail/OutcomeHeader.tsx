/**
 * OutcomeHeader — top of the outcome detail page.
 *
 * Title + a status pill the user can read in 2 seconds + the brief
 * collapsed by default behind a small "Show brief" toggle.
 *
 * Per VOICE.md: sentence case, no trailing periods on one-liners,
 * British, terse.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { OutcomeStatus } from "@orqestra/shared";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<OutcomeStatus, string> = {
  draft: "Draft",
  planning: "Planning the work",
  awaiting_clarification: "Waiting for your input",
  ready_to_execute: "Plan ready to approve",
  executing: "Work in progress",
  reviewing: "Reviewing quality",
  refining: "Refining the work",
  assembling: "Assembling the deliverable",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<OutcomeStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  planning: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  awaiting_clarification:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  ready_to_execute:
    "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  executing:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  reviewing:
    "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  refining:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  assembling:
    "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  delivered:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  failed: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  cancelled: "bg-muted text-muted-foreground",
};

interface OutcomeHeaderProps {
  title: string;
  brief: string;
  status: OutcomeStatus;
  /** Right-side actions (Generate plan / Approve / Cancel etc.). */
  actions?: React.ReactNode;
}

export function OutcomeHeader({
  title,
  brief,
  status,
  actions,
}: OutcomeHeaderProps) {
  const [briefOpen, setBriefOpen] = useState(false);

  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <span
            className={cn(
              "inline-flex text-xs font-medium px-2 py-0.5 rounded-full",
              STATUS_TONE[status],
            )}
          >
            {STATUS_LABEL[status]}
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>

      <button
        type="button"
        onClick={() => setBriefOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {briefOpen ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {briefOpen ? "Hide brief" : "Show brief"}
      </button>

      {briefOpen ? (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {brief}
          </p>
        </div>
      ) : null}
    </header>
  );
}
