/**
 * OutcomeNarrative — plain-English rendering of what's happened so far.
 *
 * Sprint 2 v1: structured rendering of the outcome's event timeline,
 * grouped sensibly. Sprint 4 will replace the internals with an LLM-
 * generated narrative service. The component contract stays stable:
 * receives a list of events, renders sentences.
 *
 * Rules: factual, concise, never invents progress. If nothing's happened
 * yet, say so honestly.
 */
import { History, MessageSquare } from "lucide-react";
import { SoftCard } from "@/components/SoftCard";
import { relativeTime } from "@/lib/utils";

interface OutcomeNarrativeProps {
  events: Array<{
    id: string;
    kind: string;
    summary: string;
    occurredAt: string;
  }>;
}

export function OutcomeNarrative({ events }: OutcomeNarrativeProps) {
  if (events.length === 0) {
    return (
      <SoftCard className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">What happened</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Nothing has happened yet. The narrative will appear here as work
          starts
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
        <h2 className="text-sm font-semibold text-foreground">What happened</h2>
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
