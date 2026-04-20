import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Key,
  Globe,
  Terminal,
  Eye,
  FileText,
  Zap,
  Database,
  Users,
  Fingerprint,
  Network,
  FolderLock,
  Bug,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import type { Agent } from "@mattparrytfc/shared";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SecurityDomain {
  key: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  policies: SecurityPolicy[];
  score: number; // 0-100
}

interface SecurityPolicy {
  key: string;
  label: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "enforced" | "relaxed" | "not_set";
  detail: string;
  recommendation?: string;
}

type ToolPermission = {
  tool: string;
  icon: React.ReactNode;
  description: string;
  enabled: boolean;
  risk: "critical" | "high" | "medium" | "low";
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseConfig(agent: Agent): Record<string, unknown> {
  return (agent.adapterConfig && typeof agent.adapterConfig === "object")
    ? agent.adapterConfig as Record<string, unknown>
    : {};
}

function parseRuntimeConfig(agent: Agent): Record<string, unknown> {
  return (agent.runtimeConfig && typeof agent.runtimeConfig === "object")
    ? agent.runtimeConfig as Record<string, unknown>
    : {};
}

function computeOverallScore(domains: SecurityDomain[]): number {
  if (domains.length === 0) return 0;
  const total = domains.reduce((sum, d) => sum + d.score, 0);
  return Math.round(total / domains.length);
}

function scoreLabel(score: number): string {
  if (score >= 85) return "Strong";
  if (score >= 65) return "Moderate";
  if (score >= 40) return "Weak";
  return "Critical";
}

function scoreColor(score: number): string {
  if (score >= 85) return "text-green-400";
  if (score >= 65) return "text-amber-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 85) return "bg-[#8FA781]";
  if (score >= 65) return "bg-amber-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}

function severityBadge(severity: "critical" | "high" | "medium" | "low") {
  const styles = {
    critical: "bg-red-500/10 text-red-400 border-red-500/20",
    high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };
  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border", styles[severity])}>
      {severity}
    </span>
  );
}

function statusIcon(status: "enforced" | "relaxed" | "not_set") {
  if (status === "enforced") return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />;
  if (status === "relaxed") return <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />;
  return <XCircle className="h-3.5 w-3.5 text-muted-foreground/50" />;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="currentColor" className="text-muted/30" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="currentColor" className={scoreColor(score)}
          strokeWidth={6} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn("text-xl font-bold", scoreColor(score))}>{score}</span>
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">{scoreLabel(score)}</span>
      </div>
    </div>
  );
}

function DomainCard({ domain, defaultExpanded }: { domain: SecurityDomain; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/50 text-muted-foreground shrink-0">
          {domain.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">{domain.label}</div>
          <div className="text-[11px] text-muted-foreground">{domain.description}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <div className={cn("h-2 w-8 rounded-full bg-muted/30 overflow-hidden")}>
              <div className={cn("h-full rounded-full transition-all", scoreBg(domain.score))}
                style={{ width: `${domain.score}%` }} />
            </div>
            <span className={cn("text-xs font-semibold w-8 text-right", scoreColor(domain.score))}>
              {domain.score}
            </span>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={cn("text-muted-foreground transition-transform", expanded && "rotate-180")}>
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border">
          {domain.policies.map((policy) => (
            <div key={policy.key} className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0">
              <div className="mt-0.5">{statusIcon(policy.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{policy.label}</span>
                  {severityBadge(policy.severity)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{policy.description}</p>
                <p className="text-[11px] text-foreground/70 mt-1 font-mono">{policy.detail}</p>
                {policy.recommendation && policy.status !== "enforced" && (
                  <p className="text-[11px] text-amber-400/80 mt-1 italic">
                    Recommendation: {policy.recommendation}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolPermissionsGrid({ tools }: { tools: ToolPermission[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {tools.map((tool) => (
        <div key={tool.tool} className={cn(
          "flex items-center gap-3 border rounded-lg p-3 transition-colors",
          tool.enabled
            ? tool.risk === "critical" ? "border-red-500/30 bg-red-500/5" :
              tool.risk === "high" ? "border-orange-500/20 bg-orange-500/5" :
              "border-border bg-card"
            : "border-border bg-muted/10 opacity-60"
        )}>
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-muted/50 text-muted-foreground shrink-0">
            {tool.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-foreground">{tool.tool}</div>
            <div className="text-[10px] text-muted-foreground truncate">{tool.description}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {severityBadge(tool.risk)}
            {tool.enabled ? (
              <ToggleRight className="h-5 w-5 text-green-400" />
            ) : (
              <ToggleLeft className="h-5 w-5 text-muted-foreground/40" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function AgentSecurityPanel({
  agentId,
  companyId,
}: {
  agentId: string;
  companyId: string;
}) {
  const { data: agent } = useQuery({
    queryKey: queryKeys.agents.detail(agentId),
    queryFn: () => agentsApi.get(agentId as `${string}_${string}`),
  });

  // Build security domains from agent config
  const { domains, tools } = useMemo(() => {
    if (!agent) return { domains: [] as SecurityDomain[], tools: [] as ToolPermission[] };

    const config = parseConfig(agent);
    const runtime = parseRuntimeConfig(agent);
    const heartbeat = runtime.heartbeat as Record<string, unknown> | undefined;

    // ── Permission Controls ──
    const permissionPolicies: SecurityPolicy[] = [
      {
        key: "skip_permissions",
        label: "Permission Prompts",
        description: "Whether agent bypasses permission confirmation dialogs",
        severity: "critical",
        status: config.dangerouslySkipPermissions ? "relaxed" : "enforced",
        detail: config.dangerouslySkipPermissions
          ? "BYPASSED — agent runs without permission prompts"
          : "Enforced — agent must confirm sensitive actions",
        recommendation: "Enable permission prompts for production agents",
      },
      {
        key: "create_agents",
        label: "Agent Creation",
        description: "Whether this agent can spawn new agents",
        severity: "high",
        status: agent.permissions?.canCreateAgents ? "relaxed" : "enforced",
        detail: agent.permissions?.canCreateAgents
          ? "Enabled — agent can create child agents"
          : "Restricted — agent cannot create new agents",
        recommendation: "Only enable for orchestrator/manager agents",
      },
      {
        key: "task_assignment",
        label: "Task Assignment",
        description: "Whether this agent can assign work to other agents",
        severity: "medium",
        status: "enforced",
        detail: agent.role === "ceo"
          ? "Enabled via CEO role"
          : agent.permissions?.canCreateAgents
            ? "Enabled via agent creation permission"
            : "Restricted",
      },
    ];
    const permScore = permissionPolicies.filter(p => p.status === "enforced").length / permissionPolicies.length * 100;

    // ── Execution Limits ──
    const maxTurns = config.maxTurnsPerRun as number ?? 300;
    const execPolicies: SecurityPolicy[] = [
      {
        key: "max_turns",
        label: "Max Turns per Run",
        description: "Upper limit on tool calls in a single heartbeat run",
        severity: maxTurns > 500 ? "high" : "medium",
        status: maxTurns <= 500 ? "enforced" : "relaxed",
        detail: `Limit: ${maxTurns} turns per run`,
        recommendation: maxTurns > 500 ? "Consider reducing to ≤500 for safety" : undefined,
      },
      {
        key: "heartbeat",
        label: "Autonomous Scheduling",
        description: "Whether agent runs on a timer without human trigger",
        severity: "medium",
        status: heartbeat?.enabled ? "relaxed" : "enforced",
        detail: heartbeat?.enabled
          ? `Active — runs every ${heartbeat?.intervalSeconds ?? 300}s`
          : "Manual trigger only",
        recommendation: heartbeat?.enabled ? "Monitor autonomous agents closely" : undefined,
      },
      {
        key: "model_tier",
        label: "Model Tier",
        description: "AI model powering this agent",
        severity: "low",
        status: "enforced",
        detail: `Model: ${String(config.model ?? "default")}`,
      },
    ];
    const execScore = execPolicies.filter(p => p.status === "enforced").length / execPolicies.length * 100;

    // ── Data Access ──
    const envBindings = config.env as Record<string, unknown> | undefined;
    const secretCount = envBindings
      ? Object.values(envBindings).filter((v) =>
          v && typeof v === "object" && (v as Record<string, unknown>).type === "secret_ref"
        ).length
      : 0;
    const plainCount = envBindings ? Object.keys(envBindings).length - secretCount : 0;

    const dataPolicies: SecurityPolicy[] = [
      {
        key: "secret_refs",
        label: "Secret References",
        description: "Credentials accessed via encrypted secret store",
        severity: "medium",
        status: secretCount > 0 ? "enforced" : "not_set",
        detail: secretCount > 0 ? `${secretCount} secret(s) referenced` : "No secrets configured",
      },
      {
        key: "plain_env",
        label: "Plain-text Environment Variables",
        description: "Unencrypted values exposed to agent runtime",
        severity: plainCount > 0 ? "high" : "low",
        status: plainCount === 0 ? "enforced" : "relaxed",
        detail: plainCount > 0
          ? `${plainCount} plain-text variable(s) — consider sealing as secrets`
          : "No plain-text variables",
        recommendation: plainCount > 0 ? "Convert plain-text vars to secret references" : undefined,
      },
      {
        key: "workspace_isolation",
        label: "Workspace Isolation",
        description: "Agent file access is scoped to its own workspace",
        severity: "medium",
        status: "enforced",
        detail: "Isolated — agent cannot access other agent workspaces",
      },
    ];
    const dataScore = dataPolicies.filter(p => p.status === "enforced").length / dataPolicies.length * 100;

    // ── Network & Access ──
    const hasBrowser = config.chrome === true;
    const networkPolicies: SecurityPolicy[] = [
      {
        key: "browser_access",
        label: "Browser Access",
        description: "Whether agent can control a Chrome browser instance",
        severity: "high",
        status: hasBrowser ? "relaxed" : "enforced",
        detail: hasBrowser
          ? "Enabled — agent can browse the web"
          : "Disabled — no browser access",
        recommendation: hasBrowser ? "Only enable for agents that require web research" : undefined,
      },
      {
        key: "network_egress",
        label: "Network Egress",
        description: "Outbound network access from agent process",
        severity: "medium",
        status: "enforced",
        detail: "Controlled by adapter sandboxing",
      },
      {
        key: "mcp_servers",
        label: "MCP Server Access",
        description: "External tool servers the agent can connect to",
        severity: "medium",
        status: "enforced",
        detail: "Configured via adapter allowedTools",
      },
    ];
    const netScore = networkPolicies.filter(p => p.status === "enforced").length / networkPolicies.length * 100;

    // ── Budget Controls ──
    const hasBudget = (agent.budgetMonthlyCents ?? 0) > 0;
    const utilisation = hasBudget
      ? Math.round((agent.spentMonthlyCents / agent.budgetMonthlyCents) * 100)
      : 0;
    const budgetPolicies: SecurityPolicy[] = [
      {
        key: "budget_limit",
        label: "Monthly Budget Limit",
        description: "Hard spending cap for this agent",
        severity: "high",
        status: hasBudget ? "enforced" : "not_set",
        detail: hasBudget
          ? `$${(agent.budgetMonthlyCents / 100).toFixed(2)}/month`
          : "No budget limit set",
        recommendation: !hasBudget ? "Set a monthly budget to prevent runaway costs" : undefined,
      },
      {
        key: "budget_util",
        label: "Budget Utilisation",
        description: "Current spend as percentage of monthly limit",
        severity: utilisation > 90 ? "critical" : utilisation > 70 ? "high" : "low",
        status: utilisation > 90 ? "relaxed" : "enforced",
        detail: hasBudget ? `${utilisation}% spent ($${(agent.spentMonthlyCents / 100).toFixed(2)})` : "N/A",
      },
    ];
    const budgetScore = budgetPolicies.filter(p => p.status === "enforced").length / budgetPolicies.length * 100;

    const allDomains: SecurityDomain[] = [
      {
        key: "permissions", label: "Permission Controls", icon: <Lock className="h-4 w-4" />,
        description: "Agent creation, task assignment, and permission prompts",
        policies: permissionPolicies, score: Math.round(permScore),
      },
      {
        key: "execution", label: "Execution Limits", icon: <Zap className="h-4 w-4" />,
        description: "Turn limits, scheduling, and model tier",
        policies: execPolicies, score: Math.round(execScore),
      },
      {
        key: "data", label: "Data & Secrets", icon: <Database className="h-4 w-4" />,
        description: "Credential management and workspace isolation",
        policies: dataPolicies, score: Math.round(dataScore),
      },
      {
        key: "network", label: "Network & Access", icon: <Network className="h-4 w-4" />,
        description: "Browser, network egress, and MCP server access",
        policies: networkPolicies, score: Math.round(netScore),
      },
      {
        key: "budget", label: "Budget Controls", icon: <FolderLock className="h-4 w-4" />,
        description: "Spending limits and utilisation monitoring",
        policies: budgetPolicies, score: Math.round(budgetScore),
      },
    ];

    // Tool permissions grid
    const allTools: ToolPermission[] = [
      { tool: "File System", icon: <FileText className="h-4 w-4" />, description: "Read/write workspace files", enabled: true, risk: "medium" },
      { tool: "Browser", icon: <Globe className="h-4 w-4" />, description: "Web browsing & scraping", enabled: hasBrowser, risk: "critical" },
      { tool: "Shell", icon: <Terminal className="h-4 w-4" />, description: "Execute system commands", enabled: true, risk: "critical" },
      { tool: "Agent Creation", icon: <Users className="h-4 w-4" />, description: "Spawn child agents", enabled: !!agent.permissions?.canCreateAgents, risk: "high" },
      { tool: "Secret Access", icon: <Key className="h-4 w-4" />, description: "Read encrypted credentials", enabled: secretCount > 0, risk: "high" },
      { tool: "Task Assignment", icon: <Zap className="h-4 w-4" />, description: "Delegate work to other agents", enabled: agent.role === "ceo" || !!agent.permissions?.canCreateAgents, risk: "medium" },
      { tool: "MCP Servers", icon: <Network className="h-4 w-4" />, description: "External tool integrations", enabled: true, risk: "medium" },
      { tool: "Code Execution", icon: <Bug className="h-4 w-4" />, description: "Run generated code", enabled: true, risk: "high" },
    ];

    return { domains: allDomains, tools: allTools };
  }, [agent]);

  const overallScore = computeOverallScore(domains);

  if (!agent) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
    ))}</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Score Overview */}
      <div className="border border-border rounded-xl p-6 bg-gradient-to-br from-card to-muted/20">
        <div className="flex items-center gap-6">
          <ScoreRing score={overallScore} />
          <div className="flex-1">
            <h3 className="text-lg font-bold text-foreground">Security Posture</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {overallScore >= 85
                ? "This agent has strong security controls across all domains."
                : overallScore >= 65
                  ? "Security is moderate — review highlighted recommendations to strengthen controls."
                  : "Security needs attention — critical policies are relaxed or unconfigured."}
            </p>
            <div className="flex items-center gap-4 mt-3">
              {domains.map((d) => (
                <div key={d.key} className="flex items-center gap-1.5">
                  <div className={cn("w-2 h-2 rounded-full", scoreBg(d.score))} />
                  <span className="text-[11px] text-muted-foreground">{d.label}</span>
                  <span className={cn("text-[11px] font-semibold", scoreColor(d.score))}>{d.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Security Domains */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-4 w-4 text-green-400" />
          <h3 className="text-sm font-semibold text-foreground">Security Domains</h3>
          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
            {domains.reduce((acc, d) => acc + d.policies.length, 0)} policies
          </span>
        </div>
        <div className="space-y-3">
          {domains.map((domain, i) => (
            <DomainCard key={domain.key} domain={domain} defaultExpanded={i === 0} />
          ))}
        </div>
      </div>

      {/* Tool Permissions */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Fingerprint className="h-4 w-4 text-green-400" />
          <h3 className="text-sm font-semibold text-foreground">Tool Permissions</h3>
          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
            {tools.filter(t => t.enabled).length}/{tools.length} enabled
          </span>
        </div>
        <ToolPermissionsGrid tools={tools} />
      </div>

      {/* Audit Trail (placeholder for future) */}
      <div className="border border-dashed border-border rounded-xl p-6 text-center">
        <Eye className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm font-medium text-muted-foreground">Audit Trail</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Security event logging coming soon — track permission changes, secret access, and policy violations.
        </p>
      </div>
    </div>
  );
}
