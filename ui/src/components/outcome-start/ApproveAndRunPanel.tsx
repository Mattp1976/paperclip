/**
 * ApproveAndRunPanel — bottom CTA for the /start flow.
 *
 * Three actions, in priority order:
 *   - Approve and run        primary
 *   - Re-plan                secondary (re-call /plan after editing brief)
 *   - Edit brief             ghost (back to brief input)
 *
 * If the planner flagged required missing inputs, we disable the primary
 * CTA and explain why — Trust before automation.
 */
import { Loader2, Play, RotateCcw, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ApproveAndRunPanelProps {
  /** Disable primary CTA — planner asked for clarifying input. */
  blocked?: boolean;
  /** Reason shown next to the disabled primary CTA. */
  blockedReason?: string;
  approving: boolean;
  replanning: boolean;
  onApprove: () => void;
  onReplan: () => void;
  onEditBrief: () => void;
}

export function ApproveAndRunPanel({
  blocked,
  blockedReason,
  approving,
  replanning,
  onApprove,
  onReplan,
  onEditBrief,
}: ApproveAndRunPanelProps) {
  return (
    <div className="sticky bottom-4 mt-4">
      <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-sm p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {blocked ? (
              <span className="text-amber-700 dark:text-amber-400">
                {blockedReason ?? "Add answers to your brief, then re-plan"}
              </span>
            ) : (
              <span>
                Nothing runs and no money is spent until you approve
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onEditBrief}
              disabled={approving || replanning}
              className="gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit brief
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReplan}
              disabled={approving || replanning}
              className="gap-1.5"
            >
              {replanning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              {replanning ? "Re-planning…" : "Re-plan"}
            </Button>

            <Button
              type="button"
              variant="sage"
              size="sm"
              disabled={blocked || approving || replanning}
              onClick={onApprove}
              className="gap-1.5"
            >
              {approving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {approving ? "Starting…" : "Approve and run"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
