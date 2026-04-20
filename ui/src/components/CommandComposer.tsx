import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Identity } from "./Identity";
import {
  MessageSquare,
  ListTodo,
  HelpCircle,
  ChevronDown,
  Send,
  X,
  Bot,
  Hexagon,
  CircleDot,
  ArrowRight,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { Agent, Issue, Project } from "@mattparrytfc/shared";

/* ── Types ─────────────────────────────────────────────────────── */

type ComposerMode = "ask" | "task" | "decision";
type ThreadScope = "company" | "project" | "issue" | "agent";

interface ScopeTarget {
  type: ThreadScope;
  id: string;
  label: string;
}

const MODE_META: Record<ComposerMode, { icon: typeof MessageSquare; label: string; placeholder: string; color: string }> = {
  ask: {
    icon: HelpCircle,
    label: "Ask",
    placeholder: "Ask a question to an agent or the company...",
    color: "text-blue-500",
  },
  task: {
    icon: ListTodo,
    label: "Task",
    placeholder: "Describe a task you want done...",
    color: "text-green-600",
  },
  decision: {
    icon: MessageSquare,
    label: "Decision",
    placeholder: "Describe a decision you need made...",
    color: "text-amber-500",
  },
};

/* ── Scope selector dropdown ──────────────────────────────────── */

function ScopeDropdown({
  scope,
  onSelect,
  agents,
  projects,
}: {
  scope: ScopeTarget | null;
  onSelect: (scope: ScopeTarget | null) => void;
  agents: Agent[];
  projects: Project[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const activeAgents = useMemo(
    () => agents.filter((a) => a.status === "active" || a.status === "idle"),
    [agents],
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent/50",
          scope ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {scope ? (
          <>
            {scope.type === "agent" && <Bot className="h-3 w-3" />}
            {scope.type === "project" && <Hexagon className="h-3 w-3" />}
            {scope.type === "issue" && <CircleDot className="h-3 w-3" />}
            {scope.type === "company" && <Sparkles className="h-3 w-3" />}
            <span className="max-w-[120px] truncate">{scope.label}</span>
          </>
        ) : (
          <span>Company-wide</span>
        )}
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-56 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
          <div className="max-h-64 overflow-y-auto p-1">
            <button
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs hover:bg-accent/50 text-left"
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
            >
              <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Company-wide</span>
            </button>

            {activeAgents.length > 0 && (
              <>
                <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Agents
                </div>
                {activeAgents.map((agent) => (
                  <button
                    key={agent.id}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs hover:bg-accent/50 text-left"
                    onClick={() => {
                      onSelect({ type: "agent", id: agent.id, label: agent.name });
                      setOpen(false);
                    }}
                  >
                    <Identity name={agent.name} size="xs" />
                    <span className="truncate">{agent.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{agent.role}</span>
                  </button>
                ))}
              </>
            )}

            {projects.length > 0 && (
              <>
                <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Projects
                </div>
                {projects.map((project) => (
                  <button
                    key={project.id}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs hover:bg-accent/50 text-left"
                    onClick={() => {
                      onSelect({ type: "project", id: project.id, label: project.name });
                      setOpen(false);
                    }}
                  >
                    <Hexagon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{project.name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Mode toggle pills ────────────────────────────────────────── */

function ModeToggle({ mode, onChange }: { mode: ComposerMode; onChange: (m: ComposerMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
      {(["ask", "task", "decision"] as const).map((m) => {
        const meta = MODE_META[m];
        const Icon = meta.icon;
        const active = mode === m;
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              active ? "bg-accent text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", active && meta.color)} />
            <span className="hidden sm:inline">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Recent thread item ───────────────────────────────────────── */

function RecentThread({
  issue,
  agents,
  onClick,
}: {
  issue: Issue;
  agents: Agent[];
  onClick: () => void;
}) {
  const assigneeName = issue.assigneeAgentId
    ? agents.find((a) => a.id === issue.assigneeAgentId)?.name ?? null
    : null;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent/50 group"
    >
      <CircleDot className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">
            {issue.identifier ?? issue.id.slice(0, 8)}
          </span>
          <span className="text-sm truncate">{issue.title}</span>
        </div>
      </div>
      {assigneeName && (
        <Identity name={assigneeName} size="sm" className="shrink-0 hidden sm:inline-flex" />
      )}
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  );
}

/* ── Main Composer ────────────────────────────────────────────── */

export function CommandComposer() {
  const { composerOpen, openComposer, closeComposer } = useDialog();
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [mode, setMode] = useState<ComposerMode>("task");
  const [scope, setScope] = useState<ScopeTarget | null>(null);
  const [input, setInput] = useState("");

  // Keyboard shortcut — Shift+Space or / to open
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger if already in an input or the composer is open
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isInput = tag === "input" || tag === "textarea" || tag === "select";

      if (e.key === " " && e.shiftKey && !isInput) {
        e.preventDefault();
        if (!composerOpen) {
          openComposer();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [composerOpen, openComposer]);

  // Focus input when opened
  useEffect(() => {
    if (composerOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setInput("");
      setScope(null);
      setMode("task");
    }
  }, [composerOpen]);

  // Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && composerOpen) {
        closeComposer();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [composerOpen, closeComposer]);

  // Data queries
  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && composerOpen,
  });

  const { data: allProjects = [] } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && composerOpen,
  });
  const projects = useMemo(() => allProjects.filter((p) => !p.archivedAt), [allProjects]);

  const { data: recentIssues = [] } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!, { status: "in_progress" }),
    enabled: !!selectedCompanyId && composerOpen,
  });

  // Smart agent detection from input text
  const detectedAgent = useMemo(() => {
    if (scope?.type === "agent") return null; // Already scoped
    const lower = input.toLowerCase();
    // Match patterns like "tell <agent>" or "ask <agent>" or "@<agent>"
    for (const agent of agents) {
      const name = agent.name.toLowerCase();
      if (
        lower.includes(`tell ${name}`) ||
        lower.includes(`ask ${name}`) ||
        lower.includes(`@${name}`)
      ) {
        return agent;
      }
    }
    return null;
  }, [input, agents, scope]);

  // Submit: create issue or comment
  const createIssueMut = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company");
      const text = input.trim();
      if (!text) throw new Error("Empty input");

      const targetAgent = scope?.type === "agent" ? scope.id : detectedAgent?.id ?? null;
      const targetProject = scope?.type === "project" ? scope.id : null;

      if (mode === "ask") {
        // If scoped to an existing issue, add as comment
        if (scope?.type === "issue") {
          const comment = await issuesApi.addComment(scope.id, text, false, true);
          return { type: "comment" as const, issueId: scope.id, comment };
        }
        // Otherwise create a new question-type issue
        const issue = await issuesApi.create(selectedCompanyId, {
          title: text.length > 80 ? text.slice(0, 77) + "..." : text,
          description: text.length > 80 ? text : undefined,
          assigneeAgentId: targetAgent,
          projectId: targetProject,
          status: "todo",
          priority: "medium",
          originKind: "board_question",
        });
        return { type: "issue" as const, issue };
      }

      if (mode === "decision") {
        const issue = await issuesApi.create(selectedCompanyId, {
          title: text.length > 80 ? text.slice(0, 77) + "..." : text,
          description: text.length > 80 ? text : undefined,
          assigneeAgentId: targetAgent,
          projectId: targetProject,
          status: "todo",
          priority: "high",
          originKind: "board_decision",
        });
        return { type: "issue" as const, issue };
      }

      // Task mode — always creates an issue
      const issue = await issuesApi.create(selectedCompanyId, {
        title: text.length > 80 ? text.slice(0, 77) + "..." : text,
        description: text.length > 80 ? text : undefined,
        assigneeAgentId: targetAgent,
        projectId: targetProject,
        status: "todo",
        priority: "medium",
      });
      return { type: "issue" as const, issue };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
      closeComposer();

      if (result.type === "issue") {
        navigate(`/issues/${result.issue.identifier ?? result.issue.id}`);
      } else if (result.type === "comment") {
        navigate(`/issues/${result.issueId}`);
      }
    },
  });

  const handleSubmit = useCallback(() => {
    if (!input.trim() || createIssueMut.isPending) return;
    createIssueMut.mutate();
  }, [input, createIssueMut]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (!composerOpen) return null;

  const meta = MODE_META[mode];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 animate-in fade-in-0 duration-150"
        onClick={closeComposer}
      />

      {/* Composer panel */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-6 animate-in slide-in-from-bottom-4 fade-in-0 duration-200">
        <div className={cn(
          "w-full max-w-2xl rounded-xl border bg-background shadow-2xl overflow-hidden transition-colors duration-200",
          mode === "ask" && "border-blue-500/30",
          mode === "task" && "border-green-600/30",
          mode === "decision" && "border-amber-500/30",
        )}>
          {/* Mode accent bar */}
          <div className={cn(
            "h-1 w-full transition-colors duration-200",
            mode === "ask" && "bg-blue-500",
            mode === "task" && "bg-green-600",
            mode === "decision" && "bg-amber-500",
          )} />
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <ModeToggle mode={mode} onChange={setMode} />
              <ScopeDropdown
                scope={scope}
                onSelect={setScope}
                agents={agents}
                projects={projects}
              />
            </div>
            <button
              onClick={closeComposer}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Input area */}
          <div className="px-4 py-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={meta.placeholder}
              rows={3}
              className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />

            {/* Agent detection hint */}
            {detectedAgent && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Bot className="h-3 w-3" />
                <span>
                  Will be assigned to{" "}
                  <span className="font-medium text-foreground">{detectedAgent.name}</span>
                </span>
              </div>
            )}

            {/* Error */}
            {createIssueMut.isError && (
              <div className="mt-2 text-xs text-destructive">
                {createIssueMut.error instanceof Error
                  ? createIssueMut.error.message
                  : "Failed to create"}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div className="text-[11px] text-muted-foreground">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
                  {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}
                </kbd>
                {" + "}
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
                  ↵
                </kbd>
                {" to send"}
                <span className="mx-2 text-border">|</span>
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
                  Shift+Space
                </kbd>
                {" to toggle"}
              </div>
              {input.length > 0 && (
                <span className={cn(
                  "text-[10px] tabular-nums",
                  input.length > 500 ? "text-amber-500" : "text-muted-foreground/50",
                )}>
                  {input.length}
                </span>
              )}
            </div>
            <Button
              size="sm"
              disabled={!input.trim() || createIssueMut.isPending}
              onClick={handleSubmit}
              className={cn(
                "gap-1.5 transition-colors",
                mode === "ask" && "bg-blue-600 hover:bg-blue-700",
                mode === "task" && "bg-green-700 hover:bg-green-800",
                mode === "decision" && "bg-amber-600 hover:bg-amber-700",
              )}
            >
              {createIssueMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {mode === "ask" ? "Ask" : mode === "decision" ? "Decide" : "Create Task"}
            </Button>
          </div>

          {/* Recent threads (when empty input) */}
          {!input.trim() && recentIssues.length > 0 && (
            <div className="border-t border-border">
              <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Active Issues
              </div>
              <div className="max-h-48 overflow-y-auto pb-1">
                {recentIssues.slice(0, 5).map((issue) => (
                  <RecentThread
                    key={issue.id}
                    issue={issue}
                    agents={agents}
                    onClick={() => {
                      closeComposer();
                      navigate(`/issues/${issue.identifier ?? issue.id}`);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
