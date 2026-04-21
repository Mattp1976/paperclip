/**
 * Dashboard — the primary landing surface.
 *
 * Redesigned to balance Paperclip's operational needs (agents, tasks, spend,
 * approvals) with a calmer, more magazine-style layout inspired by the
 * reference design: a hero KPI + 3 quiet siblings, a pill-bar activity chart
 * paired with a big "Up next" action, a semicircular success gauge, a dark
 * spend hero, and the team-activity list that used to be buried.
 *
 * Layering (top → bottom):
 *   1. Page header + "New Task" CTA
 *   2. Quick input + live progress + urgent alerts
 *   3. Run Results feed (hero promotion — this is what users open the app for)
 *   4. KPI row: Hero (Agents) + 3 Outlined (Tasks, Spend, Approvals)
 *   5. Pill-bar Run activity (wide) + Up-next + Active Goals (right column)
 *   6. Team activity + Success gauge + Spend hero
 *   7. Priority / status charts + Fleet health + Budget forecast
 *   8. Leaderboard, plugin slots, recent activity, recent tasks
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard";
import { activityApi } from "../api/activity";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { goalsApi } from "../api/goals";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { StatusIcon } from "../components/StatusIcon";
import { PriorityIcon } from "../components/PriorityIcon";
import { ActivityRow } from "../components/ActivityRow";
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import {
  Bot,
  CircleDot,
  DollarSign,
  ShieldCheck,
  LayoutDashboard,
  PauseCircle,
  Plus,
} from "lucide-react";
import { FleetHealthOverview } from "../components/FleetHealthOverview";
import { AgentLeaderboard } from "../components/AgentLeaderboard";
import { BudgetForecast } from "../components/BudgetForecast";
import {
  ChartCard,
  PriorityChart,
  IssueStatusChart,
} from "../components/ActivityCharts";
import { LatestWorkFeed } from "../components/LatestWorkFeed";
import { LiveProgressStrip } from "../components/LiveProgressStrip";
import { PageSkeleton } from "../components/PageSkeleton";
import { QuickInputBar } from "../components/QuickInputBar";
import { HeroKpi } from "../components/dashboard/HeroKpi";
import { OutlinedKpi } from "../components/dashboard/OutlinedKpi";
import { PillRunChart } from "../components/dashboard/PillRunChart";
import { UpNextCard } from "../components/dashboard/UpNextCard";
import { ProgressGauge } from "../components/dashboard/ProgressGauge";
import { SpendHeroCard } from "../components/dashboard/SpendHeroCard";
import { TeamActivityCard } from "../components/dashboard/TeamActivityCard";
import { KillSwitch } from "../components/dashboard/KillSwitch";
import { WelcomeZeroState } from "../components/dashboard/WelcomeZeroState";
import { ActiveGoalsCard } from "../components/dashboard/ActiveGoalsCard";
import type { Agent, HeartbeatRun, Issue } from "@mattparrytfc/shared";
import { PluginSlotOutlet } from "@/plugins/slots";
import { Button } from "@/components/ui/button";

function getRecentIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/** Compute recent success rate (last N days) for the gauge. */
function recentSuccessStats(runs: HeartbeatRun[], days = 14) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let succeeded = 0;
  let total = 0;
  for (const run of runs) {
    const t = new Date(run.createdAt).getTime();
    if (t < cutoff) continue;
    if (run.status === "succeeded" || run.status === "failed" || run.status === "timed_out") {
      total++;
      if (run.status === "succeeded") succeeded++;
    }
  }
  return { succeeded, total, rate: total === 0 ? 0 : (succeeded / total) * 100 };
}

export function Dashboard() {
  const { selectedCompanyId, companies } = useCompany();
  const { openOnboarding, openNewIssue, openNewGoal } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [animatedActivityIds, setAnimatedActivityIds] = useState<Set<string>>(
    new Set(),
  );
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const hydratedActivityRef = useRef(false);
  const activityAnimationTimersRef = useRef<number[]>([]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: goals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const recentIssues = issues ? getRecentIssues(issues) : [];
  const recentActivity = useMemo(
    () => (activity ?? []).slice(0, 10),
    [activity],
  );

  const successStats = useMemo(
    () => recentSuccessStats(runs ?? [], 14),
    [runs],
  );

  useEffect(() => {
    for (const timer of activityAnimationTimersRef.current) {
      window.clearTimeout(timer);
    }
    activityAnimationTimersRef.current = [];
    seenActivityIdsRef.current = new Set();
    hydratedActivityRef.current = false;
    setAnimatedActivityIds(new Set());
  }, [selectedCompanyId]);

  useEffect(() => {
    if (recentActivity.length === 0) return;

    const seen = seenActivityIdsRef.current;
    const currentIds = recentActivity.map((event) => event.id);

    if (!hydratedActivityRef.current) {
      for (const id of currentIds) seen.add(id);
      hydratedActivityRef.current = true;
      return;
    }

    const newIds = currentIds.filter((id) => !seen.has(id));
    if (newIds.length === 0) {
      for (const id of currentIds) seen.add(id);
      return;
    }

    setAnimatedActivityIds((prev) => {
      const next = new Set(prev);
      for (const id of newIds) next.add(id);
      return next;
    });

    for (const id of newIds) seen.add(id);

    const timer = window.setTimeout(() => {
      setAnimatedActivityIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.delete(id);
        return next;
      });
      activityAnimationTimersRef.current =
        activityAnimationTimersRef.current.filter((t) => t !== timer);
    }, 980);
    activityAnimationTimersRef.current.push(timer);
  }, [recentActivity]);

  useEffect(() => {
    return () => {
      for (const timer of activityAnimationTimersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? [])
      map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const p of projects ?? []) map.set(`project:${p.id}`, p.name);
    return map;
  }, [issues, agents, projects]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={LayoutDashboard}
          message="Welcome to Paperclip. Set up your first company and agent to get started."
          action="Get Started"
          onAction={openOnboarding}
        />
      );
    }
    return (
      <EmptyState
        icon={LayoutDashboard}
        message="Create or select a company to view the dashboard."
      />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  const hasNoAgents = agents !== undefined && agents.length === 0;
  const hasNoIssues = issues !== undefined && issues.length === 0;
  // Brand-new account inside this company: no agents AND no tasks yet.
  // Fall back to the welcome zero-state instead of an 8-section Dashboard full of zeros.
  const isBrandNew = hasNoAgents && hasNoIssues;

  const agentsTotal = data
    ? data.agents.active + data.agents.running + data.agents.paused + data.agents.error
    : 0;
  const approvalsTotal = data
    ? data.pendingApprovals + data.budgets.pendingApprovals
    : 0;

  // Pick a tone for the gauge based on success rate
  const gaugeTone: "green" | "amber" | "red" =
    successStats.rate >= 80 ? "green" : successStats.rate >= 50 ? "amber" : "red";

  if (isBrandNew) {
    return (
      <WelcomeZeroState
        hasCompany={true}
        hasAgent={false}
        hasTask={false}
        onStartCompany={() =>
          openOnboarding({ initialStep: 1, companyId: selectedCompanyId! })
        }
        onHireAgent={() =>
          openOnboarding({ initialStep: 2, companyId: selectedCompanyId! })
        }
        onNewTask={() => openNewIssue()}
      />
    );
  }

  return (
    <div className="space-y-10 pb-6">
      {/* Page header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground/75 leading-relaxed">
            Ask your agents anything, track progress, and see results.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {selectedCompanyId && <KillSwitch companyId={selectedCompanyId} />}
          <Button
            variant="sage-elevated"
            size="none"
            onClick={() => openNewIssue()}
            className="gap-1.5 rounded-2xl px-5 py-3 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            New Task
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {hasNoAgents && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-4 dark:border-amber-500/20 dark:bg-amber-950/40">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-100 p-2.5 dark:bg-amber-900/40">
              <Bot className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                No agents yet
              </p>
              <p className="text-xs text-amber-700/70 dark:text-amber-300/60 mt-0.5">
                Create your first agent to get started.
              </p>
            </div>
          </div>
          <button
            onClick={() =>
              openOnboarding({ initialStep: 2, companyId: selectedCompanyId! })
            }
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-amber-950 shrink-0"
          >
            Create agent
          </button>
        </div>
      )}

      {data && (
        <>
          {/* ── BUDGET ALERT (urgent, stays near top) ─────────────── */}

          {data.budgets.activeIncidents > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-destructive/15 p-2.5">
                  <PauseCircle className="h-5 w-5 text-destructive shrink-0" />
                </div>
                <div>
                  <p className="text-sm font-medium text-destructive">
                    {data.budgets.activeIncidents} budget incident
                    {data.budgets.activeIncidents === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-destructive/80 mt-0.5">
                    {data.budgets.pausedAgents} paused agents ·{" "}
                    {data.budgets.pausedProjects} paused projects
                  </p>
                </div>
              </div>
              <Link
                to="/costs"
                className="rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 shrink-0 no-underline"
              >
                View budgets
              </Link>
            </div>
          )}

          {/* ── KPI ROW: hero + 3 siblings ─────────────────────────── */}

          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <HeroKpi
              icon={Bot}
              value={agentsTotal}
              label="Agents"
              to="/agents"
              description={
                <span>
                  {data.agents.running} running · {data.agents.paused} paused ·{" "}
                  {data.agents.error} errors
                </span>
              }
            />
            <OutlinedKpi
              icon={CircleDot}
              value={data.tasks.inProgress}
              label="Active tasks"
              to="/issues"
              description={
                <span>
                  {data.tasks.open} open · {data.tasks.blocked} blocked
                </span>
              }
            />
            <OutlinedKpi
              icon={DollarSign}
              value={
                data.costs.monthSpendCents === 0
                  ? "$0"
                  : `$${(data.costs.monthSpendCents / 100).toFixed(
                      data.costs.monthSpendCents >= 10000 ? 0 : 2,
                    )}`
              }
              label="Month spend"
              to="/costs"
              description={
                <span>
                  {data.costs.monthBudgetCents > 0
                    ? `${data.costs.monthUtilizationPercent}% of budget`
                    : data.costs.projectedMonthlyCents > 0
                      ? `Tracking $${(data.costs.projectedMonthlyCents / 100).toFixed(0)}/mo`
                      : "Unlimited budget"}
                </span>
              }
            />
            <OutlinedKpi
              icon={ShieldCheck}
              value={approvalsTotal}
              label="Approvals"
              to="/approvals"
              tone={approvalsTotal > 0 ? "amber" : "default"}
              description={
                <span>
                  {data.budgets.pendingApprovals > 0
                    ? `${data.budgets.pendingApprovals} budget override${data.budgets.pendingApprovals === 1 ? "" : "s"}`
                    : approvalsTotal > 0
                      ? "Awaiting board review"
                      : "Nothing waiting"}
                </span>
              }
            />
          </div>

          {/* ── ANALYTICS + UP NEXT + GOALS ─────────────────────────── */}

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-[32px] bg-white dark:bg-card border border-border/40 dark:border-border/40 shadow-[0_1px_2px_rgba(0,0,0,0.02),0_12px_32px_-12px_rgba(0,0,0,0.06)] p-8">
              <PillRunChart runs={runs ?? []} />
            </div>
            <div className="lg:col-span-1 flex flex-col gap-5">
              <UpNextCard
                companyId={selectedCompanyId!}
                pendingApprovals={data.pendingApprovals}
                budgetApprovals={data.budgets.pendingApprovals}
              />
              <ActiveGoalsCard
                goals={goals}
                agents={agents}
                onNewGoal={() => openNewGoal()}
              />
            </div>
          </div>

          {/* ── PRIMARY ZONE: Input → Progress → Results ─────────── */}

          <QuickInputBar />

          <LiveProgressStrip companyId={selectedCompanyId!} />

          <LatestWorkFeed companyId={selectedCompanyId!} limit={5} />

          {/* ── TEAM + GAUGE + SPEND ────────────────────────────────── */}

          <div className="grid gap-5 lg:grid-cols-3">
            <TeamActivityCard companyId={selectedCompanyId!} />
            <ProgressGauge
              label="Success rate"
              caption="Last 14 days"
              value={successStats.rate}
              tone={gaugeTone}
              footer={
                successStats.total > 0 ? (
                  <span>
                    <span className="font-semibold text-foreground/90 tabular-nums">
                      {successStats.succeeded}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-foreground/90 tabular-nums">
                      {successStats.total}
                    </span>{" "}
                    runs succeeded
                  </span>
                ) : (
                  <span>No completed runs yet</span>
                )
              }
            />
            <SpendHeroCard
              monthSpendCents={data.costs.monthSpendCents}
              monthBudgetCents={data.costs.monthBudgetCents}
              utilizationPercent={data.costs.monthUtilizationPercent}
              projectedMonthlyCents={data.costs.projectedMonthlyCents}
            />
          </div>

          {/* ── DEEPER ANALYTICS + FORECASTS ────────────────────────── */}

          <div className="grid gap-5 md:grid-cols-2">
            <ChartCard title="Issues by Priority" subtitle="Last 14 days">
              <PriorityChart issues={issues ?? []} />
            </ChartCard>
            <ChartCard title="Issues by Status" subtitle="Last 14 days">
              <IssueStatusChart issues={issues ?? []} />
            </ChartCard>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <FleetHealthOverview companyId={selectedCompanyId!} />
            <BudgetForecast companyId={selectedCompanyId!} />
          </div>

          <AgentLeaderboard companyId={selectedCompanyId!} />

          <PluginSlotOutlet
            slotTypes={["dashboardWidget"]}
            context={{ companyId: selectedCompanyId }}
            className="grid gap-3 md:grid-cols-2"
            itemClassName="rounded-2xl bg-white dark:bg-card border border-border/10 dark:border-border/40 shadow-sm shadow-black/[0.03] p-5"
          />

          <div className="grid md:grid-cols-2 gap-4">
            {recentActivity.length > 0 && (
              <div className="min-w-0">
                <h3 className="text-xs font-medium text-muted-foreground/70 mb-3">
                  Recent activity
                </h3>
                <div className="rounded-2xl bg-white dark:bg-card border border-border/10 dark:border-border/40 shadow-sm shadow-black/[0.03] divide-y divide-border/30 overflow-hidden">
                  {recentActivity.map((event) => (
                    <ActivityRow
                      key={event.id}
                      event={event}
                      agentMap={agentMap}
                      entityNameMap={entityNameMap}
                      entityTitleMap={entityTitleMap}
                      className={
                        animatedActivityIds.has(event.id)
                          ? "activity-row-enter"
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="min-w-0">
              <h3 className="text-xs font-medium text-muted-foreground/70 mb-3">
                Recent tasks
              </h3>
              {recentIssues.length === 0 ? (
                <div className="rounded-2xl bg-white dark:bg-card border border-border/10 dark:border-border/40 shadow-sm shadow-black/[0.03] p-4">
                  <p className="text-sm text-muted-foreground">No tasks yet.</p>
                </div>
              ) : (
                <div className="rounded-2xl bg-white dark:bg-card border border-border/10 dark:border-border/40 shadow-sm shadow-black/[0.03] divide-y divide-border/30 overflow-hidden">
                  {recentIssues.slice(0, 10).map((issue) => (
                    <Link
                      key={issue.id}
                      to={`/issues/${issue.identifier ?? issue.id}`}
                      className="px-4 py-3 text-sm cursor-pointer hover:bg-black/[0.03] dark:hover:bg-accent/50 transition-colors no-underline text-inherit block"
                    >
                      <div className="flex items-start gap-2 sm:items-center sm:gap-3">
                        <span className="shrink-0 sm:hidden">
                          <StatusIcon status={issue.status} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:contents">
                          <span className="line-clamp-2 text-sm sm:order-2 sm:flex-1 sm:min-w-0 sm:line-clamp-none sm:truncate">
                            {issue.title}
                          </span>
                          <span className="flex items-center gap-2 sm:order-1 sm:shrink-0">
                            <span className="hidden sm:inline-flex">
                              <PriorityIcon priority={issue.priority} />
                            </span>
                            <span className="hidden sm:inline-flex">
                              <StatusIcon status={issue.status} />
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {issue.identifier ?? issue.id.slice(0, 8)}
                            </span>
                            {issue.assigneeAgentId &&
                              (() => {
                                const name = agentName(issue.assigneeAgentId);
                                return name ? (
                                  <span className="hidden sm:inline-flex">
                                    <Identity name={name} size="sm" />
                                  </span>
                                ) : null;
                              })()}
                            <span className="text-xs text-muted-foreground sm:hidden">
                              &middot;
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0 sm:order-last">
                              {timeAgo(issue.updatedAt)}
                            </span>
                          </span>
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
