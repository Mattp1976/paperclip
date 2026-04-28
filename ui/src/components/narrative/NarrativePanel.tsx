/**
 * NarrativePanel — the shared shell every narrative surface uses.
 *
 * Render contract:
 *   - calm soft-card with the narrative text in plain language
 *   - small honesty footer when the system is using a fallback
 *     (LLM unavailable / out of credits) — never invents progress
 *
 * The two callsite components (DashboardNarrative, OutcomeNarrative,
 * DecisionNarrative) wrap this with their own data fetch + heading.
 */
import { Loader2, MessageSquare, Info } from "lucide-react";
import { SoftCard } from "@/components/SoftCard";
import type { NarrativeResult } from "@/api/narrative";

interface NarrativePanelProps {
  /** Optional eyebrow / header label. */
  heading?: string;
  /** The narrative result; null while fetching. */
  result: NarrativeResult | null | undefined;
  /** Loading flag from the data fetch. */
  loading?: boolean;
  /** Error from the data fetch. */
  error?: unknown;
  /** Optional inline action (e.g. "Refresh"). */
  action?: React.ReactNode;
}

export function NarrativePanel({
  heading = "What's happening",
  result,
  loading,
  error,
  action,
}: NarrativePanelProps) {
  return (
    <SoftCard className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{heading}</h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>

      {loading && !result ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Reading the room…
        </div>
      ) : error ? (
        <p className="text-sm text-muted-foreground">
          Couldn't load the narrative right now
        </p>
      ) : result ? (
        <>
          <p className="text-sm text-foreground/90 leading-relaxed">
            {result.summary || "Nothing to report"}
          </p>
          {result.source === "fallback" ? (
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Plain-English summary unavailable
                {result.fallbackReason
                  ? ` — ${result.fallbackReason.toLowerCase()}`
                  : ""}
                . Showing facts only
              </span>
            </div>
          ) : null}
        </>
      ) : null}
    </SoftCard>
  );
}
