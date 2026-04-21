import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pause,
  Play,
  Zap,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { Agent } from "@mattparrytfc/shared";

/* ---- helpers ---- */

type OpKind = "pause" | "resume" | "invoke";

interface OpResult {
  agentId: string;
  agentName: string;
  ok: boolean;
  error?: string;
}

function getModelId(agent: Agent): string {
  const cfg = agent.adapterConfig as Record<string, unknown> | undefined;
  return (cfg?.model as string) ?? "unknown";
}

function getModelTier(model: string): "opus" | "sonnet" | "haiku" | "unknown" {
  const m = model.toLowerCase();
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("haiku")) return "haiku";
  return "unknown";
}

const MODEL_OPTIONS = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

/* ---- Component ---- */

interface BulkAgentOpsProps {
  companyId: string;
}

export function BulkAgentOps({ companyId }: BulkAgentOpsProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<OpResult[]>([]);
  const [currentOp, setCurrentOp] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  // Model sweep state
  const [sweepFrom, setSweepFrom] = useState<string>("all");
  const [sweepTo, setSweepTo] = useState<string>("claude-sonnet-4-6");
  const [sweepRole, setSweepRole] = useState<string>("all");

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const activeAgents = useMemo(
    () => (agents ?? []).filter((a) => a.status === "active" || a.status === "idle" || a.status === "running"),
    [agents],
  );
  const pausedAgents = useMemo(
    () => (agents ?? []).filter((a) => a.status === "paused"),
    [agents],
  );
  const allNonTerminated = useMemo(
    () => (agents ?? []).filter((a) => a.status !== "terminated"),
    [agents],
  );

  const roles = useMemo(() => {
    const set = new Set<string>();
    for (const a of allNonTerminated) set.add(a.role);
    return [...set].sort();
  }, [allNonTerminated]);

  const sweepCandidates = useMemo(() => {
    return allNonTerminated.filter((a) => {
      const model = getModelId(a);
      if (sweepFrom !== "all" && model !== sweepFrom) return false;
      if (sweepRole !== "all" && a.role !== sweepRole) return false;
      if (model === sweepTo) return false; // already on target
      return true;
    });
  }, [allNonTerminated, sweepFrom, sweepTo, sweepRole]);

  const runBulkOp = useCallback(
    async (op: OpKind, targetAgents: Agent[]) => {
      setRunning(true);
      setResults([]);
      setProgress({ done: 0, total: targetAgents.length });
      setCurrentOp(op);

      const newResults: OpResult[] = [];

      for (let i = 0; i < targetAgents.length; i++) {
        const agent = targetAgents[i]!;
        try {
          if (op === "pause") {
            await agentsApi.pause(agent.id, companyId);
          } else if (op === "resume") {
            await agentsApi.resume(agent.id, companyId);
          } else if (op === "invoke") {
            await agentsApi.invoke(agent.id, companyId);
          }
          newResults.push({ agentId: agent.id, agentName: agent.name, ok: true });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown error";
          newResults.push({ agentId: agent.id, agentName: agent.name, ok: false, error: message });
        }
        setProgress({ done: i + 1, total: targetAgents.length });
        setResults([...newResults]);
      }

      setRunning(false);
      setCurrentOp(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });
    },
    [companyId, queryClient],
  );

  const runModelSweep = useCallback(async () => {
    setRunning(true);
    setResults([]);
    setProgress({ done: 0, total: sweepCandidates.length });
    setCurrentOp("model-sweep");

    const newResults: OpResult[] = [];

    for (let i = 0; i < sweepCandidates.length; i++) {
      const agent = sweepCandidates[i]!;
      try {
        await agentsApi.update(
          agent.id,
          { adapterConfig: { ...(agent.adapterConfig as Record<string, unknown>), model: sweepTo } },
          companyId,
        );
        newResults.push({ agentId: agent.id, agentName: agent.name, ok: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        newResults.push({ agentId: agent.id, agentName: agent.name, ok: false, error: message });
      }
      setProgress({ done: i + 1, total: sweepCandidates.length });
      setResults([...newResults]);
    }

    setRunning(false);
    setCurrentOp(null);
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });
  }, [companyId, sweepCandidates, sweepTo, queryClient]);

  const successCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;

  return (
    <div className="border border-border rounded-lg bg-card">
      {/* Header */}
      <button
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-accent/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Bulk Operations</span>
          <span className="text-xs text-muted-foreground">
            ({allNonTerminated.length} agents)
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-6">
          {/* Quick actions */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Quick Actions
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={running || activeAgents.length === 0}
                onClick={() => runBulkOp("pause", activeAgents)}
              >
                <Pause className="h-3.5 w-3.5 mr-1.5" />
                Pause All Active ({activeAgents.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={running || pausedAgents.length === 0}
                onClick={() => runBulkOp("resume", pausedAgents)}
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Resume All Paused ({pausedAgents.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={running || activeAgents.length === 0}
                onClick={() => runBulkOp("invoke", activeAgents)}
              >
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                Invoke All Active ({activeAgents.length})
              </Button>
            </div>
          </div>

          {/* Model sweep */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Model Sweep
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">From model</label>
                <Select value={sweepFrom} onValueChange={setSweepFrom}>
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any model</SelectItem>
                    {MODEL_OPTIONS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">To model</label>
                <Select value={sweepTo} onValueChange={setSweepTo}>
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Filter by role</label>
                <Select value={sweepRole} onValueChange={setSweepRole}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    {roles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="default"
                size="sm"
                disabled={running || sweepCandidates.length === 0}
                onClick={runModelSweep}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Sweep {sweepCandidates.length} agent{sweepCandidates.length !== 1 ? "s" : ""}
              </Button>
            </div>
            {sweepCandidates.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Will change {sweepCandidates.length} agent{sweepCandidates.length !== 1 ? "s" : ""} to{" "}
                {MODEL_OPTIONS.find((m) => m.id === sweepTo)?.label ?? sweepTo}
              </p>
            )}
          </div>

          {/* Progress / Results */}
          {(running || results.length > 0) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {running && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                <span className="text-xs text-muted-foreground">
                  {running
                    ? `Running ${currentOp}... ${progress.done}/${progress.total}`
                    : `Completed: ${successCount} succeeded, ${failCount} failed`}
                </span>
              </div>

              {/* Progress bar */}
              {progress.total > 0 && (
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-300",
                      failCount > 0 ? "bg-amber-500" : "bg-sage-soft",
                    )}
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
              )}

              {/* Failure details */}
              {failCount > 0 && (
                <div className="space-y-1 mt-2">
                  <p className="text-xs font-medium text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {failCount} operation{failCount !== 1 ? "s" : ""} failed
                  </p>
                  {results
                    .filter((r) => !r.ok)
                    .map((r) => (
                      <p key={r.agentId} className="text-xs text-muted-foreground pl-4">
                        <XCircle className="h-3 w-3 inline mr-1 text-destructive" />
                        {r.agentName}: {r.error}
                      </p>
                    ))}
                </div>
              )}

              {!running && results.length > 0 && failCount === 0 && (
                <p className="text-xs text-sage-ink flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  All {successCount} operations completed successfully
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
