/**
 * OutcomeEventTimeline — the chronological log of system events for an
 * outcome (factual, no interpretation).
 *
 * Sits underneath the LLM-backed OutcomeNarrative on the outcome detail
 * page. Narrative tells the user what's happening; timeline shows the
 * receipts.
 */
import { History } from "lucide-react";
import { SoftCard } from "@/components/SoftCard";
import { relativeTime } from "@/lib/utils";

interface OutcomeEventTimelineProps {
  events: Array<{
    id: string;
    kind: string;
    summary: string;
    occurredAt: string;
  }>;
}

export function OutcomeEventTimeline({ events }: OutcomeEventTimelineProps) {
  if (events.length === 0) {
    return (
      <SoftCard className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Event log</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          The event log will fill in as work happens
        </p>
      </SoftCard>
    );
  }

  // Newest first feels more useful for active outcomes.
  const ordered = [...events].sort((a, b) =>
    a.occurredAt < b.occurredAt ? 1 : -1,
  );

  return (
    <SoftCard className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Event log</h2>
      </div>
      <ol className="space-y-2.5">
        {ordered.map((e) => (
          <li key={e.id} className="flex gap-3 text-sm">
            <span className="text-foreground/40 select-none mt-0.5">·</span>
            <div className="min-w-0 flex-1">
              <p className="text-foreground/90 leading-relaxed">{e.summary}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {relativeTime(new Date(e.occurredAt))}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </SoftCard>
  );
}
