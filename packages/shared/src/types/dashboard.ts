export interface DashboardSummary {
  companyId: string;
  agents: {
    active: number;
    running: number;
    paused: number;
    error: number;
  };
  tasks: {
    open: number;
    inProgress: number;
    blocked: number;
    done: number;
  };
  costs: {
    monthSpendCents: number;
    monthBudgetCents: number;
    monthUtilizationPercent: number;
    /** Spend recorded so far today (local calendar day start). */
    todaySpendCents: number;
    /** Total spend over the trailing 7 days (rolling window). */
    trailing7dSpendCents: number;
    /** Total spend over the 7-day window that ended 7 days ago (i.e. "last week"). */
    prevWeek7dSpendCents: number;
    /** Projected monthly spend based on trailing 7-day daily average × 30. */
    projectedMonthlyCents: number;
    /** Distinct runs that logged a cost event this month (api + subscription). */
    monthRunCount: number;
    /** Subset of monthRunCount billed as subscription_included / subscription_overage. */
    monthSubscriptionRunCount: number;
    /** Total input + cached-input + output tokens consumed this month. */
    monthTokensTotal: number;
  };
  pendingApprovals: number;
  budgets: {
    activeIncidents: number;
    pendingApprovals: number;
    pausedAgents: number;
    pausedProjects: number;
  };
}
