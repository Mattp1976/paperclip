import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowRight,
  Box,
  Code2,
  Database,
  FileOutput,
  FileText,
  Globe,
  Key,
  Layers,
  Lock,
  PackageOpen,
  Play,
  Settings2,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import type { Agent, HeartbeatRun } from "@mattparrytfc/shared";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { WorkspaceFilesPanel } from "./WorkspaceFilesPanel";
import { cn } from "../lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface InputChannel {
  key: string;
  label: string;
  icon: React.ReactNode;
  type: "env" | "secret" | "trigger" | "payload" | "instruction";
  value?: string;
  masked?: boolean;
  status: "configured" | "empty" | "required";
}

interface OutputChannel {
  key: string;
  label: string;
  icon: React.ReactNode;
  type: "files" | "result" | "stdout" | "logs" | "artifacts";
  lastValue?: string;
  count?: number;
}

interface RunIOSummary {
  runId: string;
  createdAt: string;
  source: string;
  inputPayload: Record<string, unknown> | null;
  outputResult: Record<string, unknown> | null;
  stdout: string | null;
  stderr: string | null;
  tokenUsage: { input?: number; output?: number } | null;
  status: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseEnvBindings(
  config: Record<string, unknown>
): Array<{ key: string; type: "plain" | "secret_ref"; value?: string; secretId?: string }> {
  const env = config?.env;
  if (!env || typeof env !== "object") return [];

  return Object.entries(env as Record<string, unknown>).map(([key, binding]) => {
    if (typeof binding === "string") {
      return { key, type: "plain" as const, value: binding };
    }
    if (binding && typeof binding === "object" && "type" in binding) {
      const b = binding as Record<string, unknown>;
      if (b.type === "secret_ref") {
        return { key, type: "secret_ref" as const, secretId: b.secretId as string };
      }
      return { key, type: "plain" as const, value: String(b.value ?? "") };
    }
    return { key, type: "plain" as const, value: String(binding) };
  });
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SectionHeader({
  icon,
  title,
  subtitle,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-green-400">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {badge}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function InputCard({
  channel,
}: {
  channel: InputChannel;
}) {
  const statusColor = {
    configured: "border-primary/30 bg-primary/5",
    empty: "border-border bg-card",
    required: "border-amber-500/30 bg-amber-500/5",
  }[channel.status];

  const statusDot = {
    configured: "bg-[#B5C4B1]",
    empty: "bg-muted-foreground/30",
    required: "bg-amber-400",
  }[channel.status];

  return (
    <div className={cn("border rounded-lg p-3 transition-colors", statusColor)}>
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-muted/50 text-muted-foreground shrink-0 mt-0.5">
          {channel.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">{channel.label}</span>
            <div className={cn("w-1.5 h-1.5 rounded-full", statusDot)} />
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
            {channel.masked ? "••••••••" : channel.value || "Not configured"}
          </div>
        </div>
        <span className={cn(
          "text-[10px] font-medium px-1.5 py-0.5 rounded",
          channel.type === "secret" ? "bg-amber-500/10 text-amber-400" :
          channel.type === "env" ? "bg-blue-500/10 text-blue-400" :
          channel.type === "trigger" ? "bg-purple-500/10 text-purple-400" :
          channel.type === "payload" ? "bg-cyan-500/10 text-cyan-400" :
          "bg-muted text-muted-foreground"
        )}>
          {channel.type}
        </span>
      </div>
    </div>
  );
}

function OutputCard({ channel }: { channel: OutputChannel }) {
  return (
    <div className="border border-border rounded-lg p-3 bg-card">
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-muted/50 text-muted-foreground shrink-0 mt-0.5">
          {channel.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">{channel.label}</span>
            {channel.count != null && (
              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                {channel.count}
              </span>
            )}
          </div>
          {channel.lastValue && (
            <div className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
              {channel.lastValue}
            </div>
          )}
        </div>
        <span className={cn(
          "text-[10px] font-medium px-1.5 py-0.5 rounded",
          channel.type === "files" ? "bg-primary/10 text-green-400" :
          channel.type === "result" ? "bg-blue-500/10 text-blue-400" :
          channel.type === "artifacts" ? "bg-purple-500/10 text-purple-400" :
          "bg-muted text-muted-foreground"
        )}>
          {channel.type}
        </span>
      </div>
    </div>
  );
}

function DataFlowDiagram({ agent, inputCount, outputCount }: { agent: Agent; inputCount: number; outputCount: number }) {
  return (
    <div className="border border-border rounded-xl p-5 bg-gradient-to-br from-card to-muted/20 mb-6">
      <div className="flex items-center justify-center gap-4">
        {/* Inputs */}
        <div className="flex flex-col items-center gap-1.5 min-w-[120px]">
          <div className="w-14 h-14 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Layers className="h-6 w-6 text-blue-400" />
          </div>
          <span className="text-xs font-semibold text-foreground">Inputs</span>
          <span className="text-[10px] text-muted-foreground">{inputCount} channels</span>
        </div>

        {/* Arrow */}
        <div className="flex flex-col items-center gap-1">
          <ArrowRight className="h-5 w-5 text-muted-foreground/50" />
          <div className="h-px w-12 bg-gradient-to-r from-blue-500/30 to-[#8FA781]/30" />
        </div>

        {/* Agent */}
        <div className="flex flex-col items-center gap-1.5 min-w-[140px]">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border-2 border-primary/30 flex items-center justify-center relative">
            <Sparkles className="h-7 w-7 text-green-400" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-primary border-2 border-background flex items-center justify-center">
              <Play className="h-2 w-2 text-background fill-background" />
            </div>
          </div>
          <span className="text-xs font-semibold text-foreground truncate max-w-[140px]">{agent.name}</span>
          <span className="text-[10px] text-muted-foreground">{agent.title || agent.role}</span>
        </div>

        {/* Arrow */}
        <div className="flex flex-col items-center gap-1">
          <ArrowRight className="h-5 w-5 text-muted-foreground/50" />
          <div className="h-px w-12 bg-gradient-to-r from-[#8FA781]/30 to-purple-500/30" />
        </div>

        {/* Outputs */}
        <div className="flex flex-col items-center gap-1.5 min-w-[120px]">
          <div className="w-14 h-14 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <FileOutput className="h-6 w-6 text-purple-400" />
          </div>
          <span className="text-xs font-semibold text-foreground">Outputs</span>
          <span className="text-[10px] text-muted-foreground">{outputCount} channels</span>
        </div>
      </div>
    </div>
  );
}

function RunIORow({ run }: { run: RunIOSummary }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor =
    run.status === "succeeded" ? "text-green-400" :
    run.status === "failed" ? "text-red-400" :
    "text-amber-400";

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs text-muted-foreground w-16 shrink-0">{formatTimestamp(run.createdAt)}</span>
        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", statusColor, "bg-current/10")}>
          <span className={statusColor}>{run.status}</span>
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">{run.source}</span>
        {run.tokenUsage && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {(run.tokenUsage.input ?? 0) + (run.tokenUsage.output ?? 0)} tok
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-3 bg-muted/10 space-y-3">
          {/* Input Payload */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowDown className="h-3 w-3 text-blue-400" />
              <span className="text-[10px] font-semibold text-blue-400 uppercase">Input Payload</span>
            </div>
            <pre className="text-[11px] text-muted-foreground font-mono bg-background rounded-md p-2 overflow-x-auto max-h-32">
              {run.inputPayload ? JSON.stringify(run.inputPayload, null, 2) : "No payload"}
            </pre>
          </div>

          {/* Output Result */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <FileOutput className="h-3 w-3 text-purple-400" />
              <span className="text-[10px] font-semibold text-purple-400 uppercase">Output Result</span>
            </div>
            <pre className="text-[11px] text-muted-foreground font-mono bg-background rounded-md p-2 overflow-x-auto max-h-32">
              {run.outputResult ? JSON.stringify(run.outputResult, null, 2) : "No result data"}
            </pre>
          </div>

          {/* Stdout/Stderr */}
          {(run.stdout || run.stderr) && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Terminal className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">Console Output</span>
              </div>
              {run.stdout && (
                <pre className="text-[11px] text-muted-foreground font-mono bg-background rounded-md p-2 overflow-x-auto max-h-24 mb-1">
                  {run.stdout}
                </pre>
              )}
              {run.stderr && (
                <pre className="text-[11px] text-red-400/70 font-mono bg-background rounded-md p-2 overflow-x-auto max-h-24">
                  {run.stderr}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ChevronDown (inline to avoid import issues)                        */
/* ------------------------------------------------------------------ */

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <path d="m6 9 6 6 6-6"/>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function AgentIOPanel({
  agentId,
  companyId,
}: {
  agentId: string;
  companyId: string;
}) {
  const [activeSection, setActiveSection] = useState<"overview" | "files">("overview");

  // Fetch agent detail
  const { data: agent } = useQuery({
    queryKey: queryKeys.agents.detail(agentId),
    queryFn: () => agentsApi.get(agentId as `${string}_${string}`),
  });

  // Fetch recent runs for I/O history
  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(companyId, agentId),
    queryFn: () => heartbeatsApi.list(companyId, agentId),
  });

  // Parse inputs from agent config
  const inputs = useMemo<InputChannel[]>(() => {
    if (!agent) return [];
    const config = (agent.adapterConfig && typeof agent.adapterConfig === "object")
      ? agent.adapterConfig as Record<string, unknown>
      : {};

    const channels: InputChannel[] = [];

    // System instructions
    const hasInstructions = Boolean(config.systemPrompt || config.instructions);
    channels.push({
      key: "instructions",
      label: "System Instructions",
      icon: <FileText className="h-4 w-4" />,
      type: "instruction",
      value: hasInstructions ? "Configured" : undefined,
      status: hasInstructions ? "configured" : "empty",
    });

    // Environment variables
    const envBindings = parseEnvBindings(config);
    for (const binding of envBindings) {
      channels.push({
        key: `env_${binding.key}`,
        label: binding.key,
        icon: binding.type === "secret_ref" ? <Lock className="h-4 w-4" /> : <Key className="h-4 w-4" />,
        type: binding.type === "secret_ref" ? "secret" : "env",
        value: binding.type === "secret_ref" ? `secret:${binding.secretId?.slice(0, 8)}…` : binding.value,
        masked: binding.type === "secret_ref",
        status: "configured",
      });
    }

    // Trigger configuration
    const runtime = (agent.runtimeConfig && typeof agent.runtimeConfig === "object")
      ? agent.runtimeConfig as Record<string, unknown>
      : {};
    const heartbeat = runtime.heartbeat as Record<string, unknown> | undefined;
    const isScheduled = heartbeat?.enabled === true;
    channels.push({
      key: "trigger",
      label: isScheduled ? "Scheduled Trigger" : "Manual Trigger",
      icon: isScheduled ? <Zap className="h-4 w-4" /> : <Play className="h-4 w-4" />,
      type: "trigger",
      value: isScheduled
        ? `Every ${heartbeat?.intervalSeconds ?? 300}s`
        : "On-demand invocation",
      status: "configured",
    });

    // Capabilities / tools
    const capabilities = agent.capabilities;
    if (capabilities) {
      channels.push({
        key: "capabilities",
        label: "Tools & Capabilities",
        icon: <Settings2 className="h-4 w-4" />,
        type: "instruction",
        value: capabilities.length > 60 ? capabilities.slice(0, 60) + "…" : capabilities,
        status: "configured",
      });
    }

    return channels;
  }, [agent]);

  // Parse outputs from recent runs
  const outputs = useMemo<OutputChannel[]>(() => {
    if (!agent) return [];
    const channels: OutputChannel[] = [];

    channels.push({
      key: "workspace_files",
      label: "Workspace Files",
      icon: <FileOutput className="h-4 w-4" />,
      type: "files",
      lastValue: "Agent-generated files and documents",
    });

    channels.push({
      key: "run_results",
      label: "Run Results",
      icon: <Database className="h-4 w-4" />,
      type: "result",
      lastValue: "Structured JSON result from each run",
      count: runs?.length ?? 0,
    });

    channels.push({
      key: "console",
      label: "Console Output",
      icon: <Terminal className="h-4 w-4" />,
      type: "stdout",
      lastValue: "stdout / stderr from agent process",
    });

    channels.push({
      key: "artifacts",
      label: "Work Artifacts",
      icon: <PackageOpen className="h-4 w-4" />,
      type: "artifacts",
      lastValue: "Code, documents, and deliverables",
    });

    return channels;
  }, [agent, runs]);

  // Build I/O history from runs
  const runIO = useMemo<RunIOSummary[]>(() => {
    if (!runs) return [];
    return runs.slice(0, 10).map((run: HeartbeatRun) => {
      const usage = run.usageJson as Record<string, unknown> | null;
      return {
        runId: String(run.id ?? ""),
        createdAt: String(run.createdAt ?? ""),
        source: String(run.invocationSource ?? run.triggerDetail ?? "unknown"),
        inputPayload: (run.contextSnapshot as Record<string, unknown>) ?? null,
        outputResult: (run.resultJson as Record<string, unknown>) ?? null,
        stdout: (run.stdoutExcerpt as string) ?? null,
        stderr: (run.stderrExcerpt as string) ?? null,
        tokenUsage: usage ? { input: usage.inputTokens as number, output: usage.outputTokens as number } : null,
        status: String(run.status ?? "unknown"),
      };
    });
  }, [runs]);

  if (!agent) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
    ))}</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Section toggle */}
      <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-1 w-fit">
        <button
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded-md transition-colors",
            activeSection === "overview" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveSection("overview")}
        >
          I/O Overview
        </button>
        <button
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded-md transition-colors",
            activeSection === "files" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveSection("files")}
        >
          Workspace Files
        </button>
      </div>

      {activeSection === "overview" ? (
        <>
          {/* Data Flow Diagram */}
          <DataFlowDiagram agent={agent} inputCount={inputs.length} outputCount={outputs.length} />

          {/* Inputs */}
          <div>
            <SectionHeader
              icon={<Layers className="h-4 w-4" />}
              title="Input Channels"
              subtitle="Data and configuration flowing into this agent"
              badge={
                <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded font-medium">
                  {inputs.length}
                </span>
              }
            />
            <div className="grid gap-2">
              {inputs.map((ch) => (
                <InputCard key={ch.key} channel={ch} />
              ))}
              {inputs.length === 0 && (
                <div className="text-xs text-muted-foreground italic py-4 text-center">
                  No input channels configured
                </div>
              )}
            </div>
          </div>

          {/* Outputs */}
          <div>
            <SectionHeader
              icon={<FileOutput className="h-4 w-4" />}
              title="Output Channels"
              subtitle="Data and artifacts produced by this agent"
              badge={
                <span className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded font-medium">
                  {outputs.length}
                </span>
              }
            />
            <div className="grid gap-2">
              {outputs.map((ch) => (
                <OutputCard key={ch.key} channel={ch} />
              ))}
            </div>
          </div>

          {/* Recent Run I/O */}
          <div>
            <SectionHeader
              icon={<Code2 className="h-4 w-4" />}
              title="Recent Run I/O"
              subtitle="Input payloads and output results from the last 10 runs"
              badge={
                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                  {runIO.length} runs
                </span>
              }
            />
            <div className="space-y-2">
              {runIO.map((run) => (
                <RunIORow key={run.runId} run={run} />
              ))}
              {runIO.length === 0 && (
                <div className="text-xs text-muted-foreground italic py-4 text-center border border-dashed border-border rounded-lg">
                  No runs yet — invoke the agent to see I/O data
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <WorkspaceFilesPanel agentId={agentId} companyId={companyId} />
      )}
    </div>
  );
}
