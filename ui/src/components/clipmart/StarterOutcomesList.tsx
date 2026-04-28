/**
 * StarterOutcomesList — the "what you'd run first with this team" panel.
 *
 * Shown inside the template detail drawer. Each starter outcome links
 * the user straight into /start with the brief pre-filled (handled by
 * the parent via onPick).
 */
import { Sparkles } from "lucide-react";
import type { FleetTemplateListItem } from "@/api/fleetTemplates";

type StarterOutcome = FleetTemplateListItem["starterOutcomes"][number];

interface StarterOutcomesListProps {
  outcomes: StarterOutcome[];
  /** Optional callback when user picks an outcome to run. */
  onPick?: (outcome: StarterOutcome) => void;
}

export function StarterOutcomesList({
  outcomes,
  onPick,
}: StarterOutcomesListProps) {
  if (outcomes.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
        Starter outcomes
      </p>
      <ul className="space-y-2">
        {outcomes.map((o, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onPick?.(o)}
              disabled={!onPick}
              className="w-full text-left rounded-xl border border-border/60 bg-background/60 p-3 transition-colors hover:bg-muted/40 disabled:cursor-default"
            >
              <div className="flex items-start gap-2">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {o.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                    {o.brief}
                  </p>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
