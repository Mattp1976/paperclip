/**
 * FinalAssembly — the synthesised final deliverable for a delivered
 * outcome.
 *
 * Renders executive summary, the markdown body (preserved formatting),
 * recommended next actions, and any unresolved limitations the
 * assembler flagged honestly.
 */
import { CheckCircle2 } from "lucide-react";
import { SoftCard } from "@/components/SoftCard";

interface FinalAssemblyProps {
  markdown: string;
  executiveSummary: string | null;
  unresolvedLimitations: string[];
  recommendedNextActions: string[];
}

export function FinalAssembly({
  markdown,
  executiveSummary,
  unresolvedLimitations,
  recommendedNextActions,
}: FinalAssemblyProps) {
  return (
    <SoftCard className="p-5 space-y-4 border-emerald-300/60 bg-emerald-50/30 dark:bg-emerald-950/20">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-emerald-700" />
        <h2 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
          Final deliverable
        </h2>
      </div>

      {executiveSummary ? (
        <div className="rounded-lg bg-white/60 dark:bg-background/40 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Executive summary
          </p>
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {executiveSummary}
          </p>
        </div>
      ) : null}

      <div className="rounded-lg bg-white/60 dark:bg-background/40 p-4 max-h-[60vh] overflow-y-auto">
        <pre className="text-sm whitespace-pre-wrap font-sans text-foreground leading-relaxed">
          {markdown}
        </pre>
      </div>

      {recommendedNextActions.length > 0 ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Recommended next actions
          </p>
          <ul className="text-sm text-foreground/85 space-y-1">
            {recommendedNextActions.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-foreground/40 select-none">·</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {unresolvedLimitations.length > 0 ? (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Unresolved limitations
          </p>
          <ul className="text-sm text-foreground/70 space-y-1">
            {unresolvedLimitations.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-foreground/40 select-none">·</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SoftCard>
  );
}
