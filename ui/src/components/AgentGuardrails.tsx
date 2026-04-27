import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Zap,
  Eye,
  FileText,
  Globe,
  Terminal,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import type { Agent, BudgetPolicySummary } from "@orqestra/shared";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface GuardrailPolicy {
  key: string;
  label: string;
  description: string;
  category: "permissions" | "execution" | "budget" | "access";
  severity: "critical" | "warning" | "info";
  status: "enforced" | "relaxed" | "not_configured";
  detail: string;
  recommendation?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseConfig(agent: Agent): Record<string, unknown> {
  return (agent.adapterConfig && typeof agent.adapterConfig === "object")
    ? agent.adapterConfig
    : {};
}

function parseRuntimeConfig(agent: Agent): Record<string, unknown> {
  return (agent.runtimeConfig && typeof agent.runtimeConfig === "object")
    ? agent.runtimeConfig
    : {};
}

function severityColor(severity: "critical" | "warning" | "info") {
  switch (severity) {
    case "critical": return "text-red-400";
    case "warning": return "text-amber-400";
    case "info": return "text-blue-400";
  }
}

function statusBadge(status: "enforced" | "relaxed" | "not_configured") {
  switch (status) {
    case "enforced":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400 bg-sage-mist/10 rounded-full px-2 py-0.5">
          <ShieldCheck className="h-3 w-3" /> Enforced
        </span>
      );
    case "relaxed":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-400/10 rounded-full px-2 py-0.5">
          <ShieldAlert className="h-3 w-3" /> Relaxed
        </span>
      );
    case "not_configured":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          <Shield className="h-3 w-3" /> Not set
        </span>
      );
  }
}

function categoryIcon(category: "permissions" | "execution" | "budget" | "access") {
  const cls = "h-4 w-4";
  switch (category) {
    case "permissions": return <Lock className={cls} />;
    case "execution": return <Terminal className={cls} />;
    case "budget": return <DollarSign className={cls} />;
    case "access": return <Eye className={cls} />;
  }
}

/* ------------------------------------------------------------------ */
/*  Policy derivation                                                  */
/* ------------------------------------------------------------------ */

function deriveGuardrailPolicies(agent: Agent, budgetPolicies: BudgetPolicySummary[] | null): GuardrailPolicy[] {
  const config = parseConfig(agent);
  const runtimeConfig = parseRuntimeConfig(agent);
  const policies: GuardrailPolicy[] = [];

  // 1. Permission skip check
  const skipPerms = config.dangerouslySkipPermissions !== false;
  policies.push({
    key: "skip_permissions",
    label: "Permission prompts",
    description: "Whether the agent runs with or without interactive permission prompts.",
    category: "permissions",
    severity: skipPerms ? "critical" : "info",
    status: skipPerms ? "relaxed" : "enforced",
    detail: skipPerms
      ? "Agent runs with dangerouslySkipPermissions enabled — it can execute any tool without human approval."
      : "Agent respects permission prompts before executing sensitive operations.",
    recommendation: skipPerms
      ? "Consider disabling this for agents handling sensitive data or production systems."
      : undefined,
  });

  // 2. Max turns per run
  const maxTurns = typeof config.maxTurnsPerRun === "number" ? config.maxTurnsPerRun : 300;
  policies.push({
    key: "max_turns",
    label: "Max turns per run",
    description: "Limits how many tool calls an agent can make in a single heartbeat run.",
    category: "execution",
    severity: maxTurns > 500 ? "warning" : "info",
    status: maxTurns <= 300 ? "enforced" : maxTurns <= 500 ? "enforced" : "relaxed",
    detail: `Agent limited to ${maxTurns} turns per run.${maxTurns > 500 ? " This is unusually high." : ""}`,
    recommendation: maxTurns > 500 ? "Consider reducing to 300 or less for tighter cost control." : undefined,
  });

  // 3. Chrome/browser access
  const chrome = config.chrome === true;
  policies.push({
    key: "chrome_access",
    label: "Browser access",
    description: "Whether the agent can control a Chrome browser session.",
    category: "access",
    severity: chrome ? "warning" : "info",
    status: chrome ? "relaxed" : "enforced",
    detail: chrome
      ? "Agent has Chrome browser access — it can navigate websites and interact with web UIs."
      : "Browser access is disabled.",
    recommendation: chrome
      ? "Only enable for agents that genuinely need web access (e.g., research, testing)."
      : undefined,
  });

  // 4. Budget policy check
  const agentBudgetPolicy = budgetPolicies?.find(
    (p) => p.scopeType === "agent" && p.scopeId === agent.id && p.isActive,
  );
  const companyBudgetPolicy = budgetPolicies?.find(
    (p) => p.scopeType === "company" && p.isActive,
  );
  const activeBudget = agentBudgetPolicy || companyBudgetPolicy;

  policies.push({
    key: "budget_limit",
    label: "Spend limit",
    description: "Whether a budget policy is enforced for this agent.",
    category: "budget",
    severity: !activeBudget ? "warning" : "info",
    status: activeBudget
      ? activeBudget.hardStopEnabled ? "enforced" : "relaxed"
      : "not_configured",
    detail: activeBudget
      ? `${agentBudgetPolicy ? "Agent-level" : "Company-level"} budget: $${(activeBudget.amount / 100).toFixed(2)} / ${activeBudget.windowKind === "calendar_month_utc" ? "month" : "lifetime"}.${activeBudget.hardStopEnabled ? " Hard stop enabled." : " Warning only — no hard stop."}`
      : "No active budget policy. Agent can spend without limits.",
    recommendation: !activeBudget
      ? "Set a monthly budget to prevent runaway costs."
      : !activeBudget.hardStopEnabled
        ? "Enable hard stop to automatically pause the agent at budget limit."
        : undefined,
  });

  // 5. Monthly budget on agent record
  const monthlyBudgetCents = agent.budgetMonthlyCents;
  if (monthlyBudgetCents > 0) {
    const utilization = agent.spentMonthlyCents / monthlyBudgetCents;
    policies.push({
      key: "agent_budget_utilization",
      label: "Budget utilization",
      description: "Current month spend vs. configured budget.",
      category: "budget",
      severity: utilization > 0.9 ? "critical" : utilization > 0.7 ? "warning" : "info",
      status: utilization > 0.9 ? "relaxed" : "enforced",
      detail: `$${(agent.spentMonthlyCents / 100).toFixed(2)} of $${(monthlyBudgetCents / 100).toFixed(2)} spent (${Math.round(utilization * 100)}%).`,
      recommendation: utilization > 0.9 ? "Agent is approaching budget limit — review if budget needs increasing." : undefined,
    });
  }

  // 6. Model tier check
  const model = typeof config.model === "string" ? config.model : "";
  const isOpusTier = model.includes("opus");
  const isSonnetTier = model.includes("sonnet");
  const isHaikuTier = model.includes("haiku");
  policies.push({
    key: "model_tier",
    label: "Model tier",
    description: "The AI model powering this agent — higher tiers cost more.",
    category: "execution",
    severity: isOpusTier ? "warning" : "info",
    status: isOpusTier ? "relaxed" : "enforced",
    detail: model
      ? `Running ${isOpusTier ? "Opus" : isSonnetTier ? "Sonnet" : isHaikuTier ? "Haiku" : model} tier.${isOpusTier ? " This is the most expensive tier." : ""}`
      : "Using default model.",
    recommendation: isOpusTier
      ? "Opus is reserved for critical decision-making roles. Ensure this agent requires top-tier reasoning."
      : undefined,
  });

  // 7. Heartbeat config check
  const heartbeat = typeof runtimeConfig.heartbeat === "object" && runtimeConfig.heartbeat !== null
    ? runtimeConfig.heartbeat as Record<string, unknown>
    : {};
  const heartbeatEnabled = heartbeat.enabled !== false;
  policies.push({
    key: "heartbeat_enabled",
    label: "Heartbeat scheduler",
    description: "Whether the agent runs on an automatic heartbeat schedule.",
    category: "execution",
    severity: heartbeatEnabled ? "info" : "info",
    status: heartbeatEnabled ? "enforced" : "not_configured",
    detail: heartbeatEnabled
      ? "Heartbeat scheduler is active — agent runs automatically."
      : "Heartbeat scheduler is disabled — agent only runs on manual trigger.",
  });

  // 8. Agent status
  if (agent.status === "paused") {
    policies.push({
      key: "paused_status",
      label: "Agent paused",
      description: "The agent is currently paused and not executing.",
      category: "execution",
      severity: "info",
      status: "enforced",
      detail: `Agent paused${agent.pauseReason ? ` (${agent.pauseReason})` : ""}.`,
    });
  }

  // 9. Can create agents permission
  policies.push({
    key: "can_create_agents",
    label: "Agent creation",
    description: "Whether this agent can spawn new agents.",
    category: "permissions",
    severity: agent.permissions.canCreateAgents ? "warning" : "info",
    status: agent.permissions.canCreateAgents ? "relaxed" : "enforced",
    detail: agent.permissions.canCreateAgents
      ? "Agent can create new agents — this is a powerful capability."
      : "Agent cannot create new agents.",
    recommendation: agent.permissions.canCreateAgents
      ? "Limit agent creation to CEO/CTO roles only."
      : undefined,
  });

  return policies;
}

/* ------------------------------------------------------------------ */
/*  Score calculator                                                   */
/* ------------------------------------------------------------------ */

function calculateSecurityScore(policies: GuardrailPolicy[]): {
  score: number;
  label: string;
  color: string;
} {
  let total = 0;
  let earned = 0;
  for (const p of policies) {
    const weight = p.severity === "critical" ? 3 : p.severity === "warning" ? 2 : 1;
    total += weight;
    if (p.status === "enforced") earned += weight;
    else if (p.status === "not_configured") earned += weight * 0.5;
  }
  const score = total > 0 ? Math.round((earned / total) * 100) : 100;
  return {
    score,
    label: score >= 80 ? "Strong" : score >= 60 ? "Moderate" : "Weak",
    color: score >= 80 ? "text-green-400" : score >= 60 ? "text-amber-400" : "text-red-400",
  };
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width="100" height="100" viewBox="0 0 100 100" className="block">
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/30" />
      <circle
        cx="50" cy="50" r={r} fill="none"
        stroke="currentColor" strokeWidth="6"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        className={color}
        style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text x="50" y="50" textAnchor="middle" dy="0.35em" className="fill-foreground text-xl font-bold" style={{ fontSize: "22px" }}>
        {score}
      </text>
    </svg>
  );
}

function PolicyCard({ policy }: { policy: GuardrailPolicy }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-border rounded-lg p-4 hover:bg-muted/20 transition-colors">
      <div className="flex items-start gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className={`mt-0.5 ${severityColor(policy.severity)}`}>
          {categoryIcon(policy.category)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">{policy.label}</span>
            {statusBadge(policy.status)}
          </div>
          <p className="text-xs text-muted-foreground">{policy.detail}</p>
        </div>
        <div className="mt-1 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </div>
      {expanded && (
        <div className="mt-3 ml-7 space-y-2">
          <p className="text-xs text-muted-foreground">{policy.description}</p>
          {policy.recommendation && (
            <div className="flex items-start gap-2 text-xs text-amber-400/80 bg-amber-400/5 border border-amber-400/20 rounded-md p-2">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{policy.recommendation}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategorySection({
  title,
  icon,
  policies,
}: {
  title: string;
  icon: React.ReactNode;
  policies: GuardrailPolicy[];
}) {
  if (policies.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="text-muted-foreground">{icon}</div>
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          {policies.filter((p) => p.status === "enforced").length}/{policies.length} enforced
        </span>
      </div>
      <div className="space-y-2">
        {policies.map((p) => (
          <PolicyCard key={p.key} policy={p} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function AgentGuardrails({
  agentId,
  companyId,
}: {
  agentId: string;
  companyId: string;
}) {
  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: queryKeys.agents.detail(agentId),
    queryFn: () => agentsApi.get(agentId, companyId),
  });

  // Try to load budget policies for this agent
  const { data: budgetData } = useQuery({
    queryKey: queryKeys.budgets.overview(companyId),
    queryFn: async () => {
      try {
        const res = await fetch(`/api/v1/companies/${companyId}/budgets/overview`);
        if (!res.ok) return null;
        return (await res.json()) as { policies: BudgetPolicySummary[] };
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });

  const policies = useMemo(
    () => (agent ? deriveGuardrailPolicies(agent, budgetData?.policies ?? null) : []),
    [agent, budgetData],
  );

  const score = useMemo(() => calculateSecurityScore(policies), [policies]);

  const permissionPolicies = policies.filter((p) => p.category === "permissions");
  const executionPolicies = policies.filter((p) => p.category === "execution");
  const budgetPolicies = policies.filter((p) => p.category === "budget");
  const accessPolicies = policies.filter((p) => p.category === "access");

  const criticalCount = policies.filter((p) => p.severity === "critical" && p.status !== "enforced").length;
  const warningCount = policies.filter((p) => p.severity === "warning" && p.status !== "enforced").length;

  if (agentLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-muted/30 rounded-lg" />
        <div className="h-48 bg-muted/30 rounded-lg" />
        <div className="h-48 bg-muted/30 rounded-lg" />
      </div>
    );
  }

  if (!agent) {
    return <p className="text-sm text-muted-foreground">Agent not found.</p>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Score overview */}
      <div className="border border-border rounded-lg p-6">
        <div className="flex items-center gap-6">
          <ScoreRing score={score.score} color={score.color} />
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-1">
              Security posture: <span className={score.color}>{score.label}</span>
            </h2>
            <p className="text-sm text-muted-foreground mb-3">
              {score.score >= 80
                ? "This agent has strong guardrails in place."
                : score.score >= 60
                  ? "Some guardrails could be tightened for better security."
                  : "This agent has significant security gaps that should be addressed."}
            </p>
            <div className="flex gap-4 text-xs">
              {criticalCount > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <XCircle className="h-3.5 w-3.5" /> {criticalCount} critical
                </span>
              )}
              {warningCount > 0 && (
                <span className="flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> {warningCount} warning{warningCount !== 1 ? "s" : ""}
                </span>
              )}
              <span className="flex items-center gap-1 text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />{" "}
                {policies.filter((p) => p.status === "enforced").length} enforced
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Policy categories */}
      <CategorySection title="Permissions" icon={<Lock className="h-4 w-4" />} policies={permissionPolicies} />
      <CategorySection title="Execution limits" icon={<Terminal className="h-4 w-4" />} policies={executionPolicies} />
      <CategorySection title="Budget & cost" icon={<DollarSign className="h-4 w-4" />} policies={budgetPolicies} />
      <CategorySection title="Access & capabilities" icon={<Eye className="h-4 w-4" />} policies={accessPolicies} />

      {/* Recommendations summary */}
      {policies.some((p) => p.recommendation) && (
        <div className="border border-border rounded-lg p-5">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" /> Recommendations
          </h3>
          <ul className="space-y-2">
            {policies
              .filter((p) => p.recommendation)
              .map((p) => (
                <li key={p.key} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-400 shrink-0" />
                  <span>
                    <strong className="text-foreground">{p.label}:</strong> {p.recommendation}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
