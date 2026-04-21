/**
 * ActiveGoalsCard — shows currently-active goals on the Dashboard so strategic
 * objectives are visible alongside day-to-day operational metrics.
 *
 * Goals don't carry a numeric progress value, so this card focuses on making
 * the list of active objectives easy to scan: level chip, title, owner, and a
 * click target that takes you straight to the goal detail page. When there
 * are no active goals we show a quiet empty state with a CTA to create one.
 */
import { Link } from "@/lib/router";
import { Target, ArrowRight, Plus } from "lucide-react";
import type { Agent, Goal } from "@mattparrytfc/shared";
import { Identity } from "../Identity";
import { Button } from "@/components/ui/button";

interface ActiveGoalsCardProps {
  goals: Goal[] | undefined;
  agents: Agent[] | undefined;
  onNewGoal: () => void;
  /** Max number of goals to show; anything beyond surfaces a "View all" link. */
  limit?: number;
}

const LEVEL_LABEL: Record<Goal["level"], string> = {
  company: "Company",
  team: "Team",
  agent: "Agent",
  task: "Task",
};

const LEVEL_STYLE: Record<Goal["level"], string> = {
  company:
    "bg-primary/12 text-[#5F7355] border-primary/25 dark:bg-[#A4BD95]/15 dark:text-[#D7E4CB] dark:border-primary/30",
  team:
    "bg-[#D9A5A5]/18 text-[#8B5555] border-[#D9A5A5]/30 dark:bg-[#D9A5A5]/15 dark:text-[#E8BEBE] dark:border-[#D9A5A5]/30",
  agent:
    "bg-sky-500/10 text-sky-700 border-sky-500/20 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
  task: "bg-muted text-muted-foreground border-border",
};

export function ActiveGoalsCard({
  goals,
  agents,
  onNewGoal,
  limit = 4,
}: ActiveGoalsCardProps) {
  const active = (goals ?? []).filter((goal) => goal.status === "active");
  const visible = active.slice(0, limit);
  const remainder = Math.max(0, active.length - visible.length);

  const agentNameById = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  return (
    <div className="rounded-[32px] bg-white dark:bg-card border border-border/40 dark:border-border/40 shadow-[0_1px_2px_rgba(0,0,0,0.02),0_12px_32px_-12px_rgba(0,0,0,0.06)] p-7">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2 dark:bg-primary/15">
            <Target className="h-4 w-4 text-[#7C9470] dark:text-[#A4BD95]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Active goals
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground/70">
              Strategic priorities your agents are working towards.
            </p>
          </div>
        </div>
        <Link
          to="/goals"
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-[#7C9470] hover:text-primary no-underline"
        >
          View all
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {active.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No active goals yet. Goals help align your agents around outcomes.
          </p>
          <Button
            type="button"
            variant="sage"
            size="none"
            onClick={onNewGoal}
            className="gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            New goal
          </Button>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border/30">
            {visible.map((goal) => {
              const ownerName = agentNameById(goal.ownerAgentId);
              return (
                <li key={goal.id}>
                  <Link
                    to={`/goals/${goal.id}`}
                    className="block -mx-2 rounded-xl px-2 py-3 transition-colors hover:bg-black/[0.03] dark:hover:bg-accent/40 no-underline text-inherit"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ${LEVEL_STYLE[goal.level]}`}
                      >
                        {LEVEL_LABEL[goal.level]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {goal.title}
                        </p>
                        {goal.description && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground/80">
                            {goal.description}
                          </p>
                        )}
                      </div>
                      {ownerName ? (
                        <span className="shrink-0 hidden sm:inline-flex">
                          <Identity name={ownerName} size="sm" />
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {remainder > 0 && (
            <div className="mt-3 pt-3 border-t border-border/30 text-center">
              <Link
                to="/goals"
                className="text-xs text-muted-foreground hover:text-foreground no-underline"
              >
                +{remainder} more active goal{remainder === 1 ? "" : "s"}
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
