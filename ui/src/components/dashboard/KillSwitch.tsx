import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Power, AlertTriangle, Loader2 } from "lucide-react";
import { agentsApi } from "../../api/agents";
import { heartbeatsApi } from "../../api/heartbeats";
import { queryKeys } from "../../lib/queryKeys";
import { useToast } from "../../context/ToastContext";
import { cn } from "../../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface KillSwitchProps {
  companyId: string;
  className?: string;
}

// Agents we'd pause. Matches BulkAgentOps' "active" predicate.
const RUNNABLE_STATUSES = new Set(["active", "idle", "running", "error"]);

export function KillSwitch({ companyId, className }: KillSwitchProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(companyId),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId),
    enabled: !!companyId,
    refetchInterval: 10_000,
  });

  const runnableAgents = useMemo(
    () => (agents ?? []).filter((agent) => RUNNABLE_STATUSES.has(agent.status)),
    [agents],
  );
  const runnableAgentCount = runnableAgents.length;
  const liveRunCount = liveRuns?.length ?? 0;
  const isArmed = liveRunCount > 0;

  const killMutation = useMutation({
    mutationFn: async () => {
      const agentPauses = runnableAgents.map((agent) =>
        agentsApi.pause(agent.id, companyId).catch((err) => ({
          kind: "agent" as const,
          id: agent.id,
          name: agent.name,
          error: err instanceof Error ? err.message : String(err),
        })),
      );
      const runCancels = (liveRuns ?? []).map((run) =>
        heartbeatsApi.cancel(run.id).catch((err) => ({
          kind: "run" as const,
          id: run.id,
          name: run.agentName,
          error: err instanceof Error ? err.message : String(err),
        })),
      );

      const results = await Promise.all([...agentPauses, ...runCancels]);
      const failures = results.filter(
        (r): r is { kind: "agent" | "run"; id: string; name: string; error: string } =>
          !!r && typeof r === "object" && "error" in r,
      );
      return { failures, totalAgents: runnableAgents.length, totalRuns: liveRunCount };
    },
    onSuccess: ({ failures, totalAgents, totalRuns }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(companyId) });

      if (failures.length === 0) {
        pushToast({
          title: "Kill switch engaged",
          body:
            totalAgents === 0 && totalRuns === 0
              ? "Nothing was running."
              : `Paused ${totalAgents} agent${totalAgents === 1 ? "" : "s"} and cancelled ${totalRuns} live run${totalRuns === 1 ? "" : "s"}.`,
          tone: "success",
        });
      } else {
        pushToast({
          title: "Kill switch finished with errors",
          body: `${failures.length} of ${totalAgents + totalRuns} operation${
            failures.length === 1 ? "" : "s"
          } failed. The rest were stopped successfully.`,
          tone: "warn",
        });
      }
      setOpen(false);
    },
    onError: (err) => {
      pushToast({
        title: "Kill switch failed",
        body: err instanceof Error ? err.message : "Unknown error while halting activity.",
        tone: "error",
      });
    },
  });

  const handleConfirm = () => {
    killMutation.mutate();
  };

  const nothingToStop = runnableAgentCount === 0 && liveRunCount === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={nothingToStop}
        title={
          nothingToStop
            ? "No agents or live runs to halt"
            : `Stop ${runnableAgentCount} agent${runnableAgentCount === 1 ? "" : "s"}${
                isArmed ? ` and ${liveRunCount} live run${liveRunCount === 1 ? "" : "s"}` : ""
              }`
        }
        className={cn(
          "group relative inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-semibold transition-all duration-200",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isArmed
            ? "bg-rose-deep text-white shadow-[0_2px_4px_rgba(165,89,89,0.18),0_12px_24px_-8px_rgba(165,89,89,0.40)] hover:bg-[#B56868] hover:-translate-y-0.5 active:translate-y-0 dark:bg-rose-soft dark:text-[#22251F] dark:hover:bg-[#E2B2B2]"
            : "border border-rose-soft/70 bg-rose-surface/40 text-rose-text hover:bg-rose-surface hover:border-rose-soft dark:border-rose-text/60 dark:bg-[#3B2525]/40 dark:text-rose-text-dim dark:hover:bg-[#3B2525]/70",
          className,
        )}
      >
        {isArmed && (
          <span className="absolute -left-0.5 -top-0.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
        )}
        <Power className="h-4 w-4" strokeWidth={2.4} />
        <span>Kill switch</span>
        {isArmed && (
          <span className="ml-1 rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-medium leading-none">
            {liveRunCount} live
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={(next) => (!killMutation.isPending ? setOpen(next) : null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-surface text-rose-text dark:bg-[#3B2525] dark:text-rose-text-dim">
                <AlertTriangle className="h-5 w-5" strokeWidth={2.2} />
              </div>
              <DialogTitle className="text-lg">Engage kill switch?</DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-sm text-muted-foreground">
              This will <strong className="font-semibold text-foreground">pause every active agent</strong>
              {" "}and <strong className="font-semibold text-foreground">cancel every live run</strong> for this
              company. Agents will need to be resumed manually afterwards.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="rounded-2xl border border-border/40 bg-[#FAF7F2] px-4 py-3 dark:bg-[#22251F]">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Agents to pause
              </div>
              <div className="mt-1 text-2xl font-semibold text-sage-body dark:text-sage-surface">
                {runnableAgentCount}
              </div>
            </div>
            <div className="rounded-2xl border border-border/40 bg-[#FAF7F2] px-4 py-3 dark:bg-[#22251F]">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Live runs to cancel
              </div>
              <div className="mt-1 text-2xl font-semibold text-rose-text dark:text-rose-text-dim">
                {liveRunCount}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={killMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={killMutation.isPending || nothingToStop}
              className="bg-rose-deep text-white hover:bg-[#B56868] dark:bg-rose-soft dark:text-[#22251F] dark:hover:bg-[#E2B2B2]"
            >
              {killMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Halting…
                </>
              ) : (
                <>
                  <Power className="h-4 w-4" strokeWidth={2.4} />
                  Halt everything
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
