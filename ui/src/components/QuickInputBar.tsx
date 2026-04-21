import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "@/lib/utils";
import { Identity } from "./Identity";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  HelpCircle,
  ListTodo,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import type { Agent } from "@mattparrytfc/shared";

/* ── Types ─────────────────────────────────────────────────────── */

type QuickMode = "task" | "ask" | "decision";

const QUICK_MODES: Record<
  QuickMode,
  { icon: typeof ListTodo; label: string; hint: string; color: string; bg: string }
> = {
  task: {
    icon: ListTodo,
    label: "Task",
    hint: "Describe what you need done...",
    color: "text-sage-ink",
    bg: "bg-primary/10 border-primary/20",
  },
  ask: {
    icon: HelpCircle,
    label: "Ask",
    hint: "Ask a question to your agents...",
    color: "text-blue-500",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  decision: {
    icon: MessageSquare,
    label: "Decide",
    hint: "Describe a decision that needs to be made...",
    color: "text-amber-500",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
};

/* ── Agent suggestion chip ─────────────────────────────────────── */

function AgentChip({
  agent,
  selected,
  onClick,
}: {
  agent: Agent;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
        selected
          ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
          : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
    >
      <Identity name={agent.name} size="xs" />
      <span className="max-w-[80px] truncate">{agent.name}</span>
    </button>
  );
}

/* ── First-run explainer ───────────────────────────────────────── */

const EXPLAINER_STORAGE_KEY = "paperclip:quickbar-explainer-dismissed";

function useExplainerDismissed() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(EXPLAINER_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(EXPLAINER_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, []);

  const reopen = useCallback(() => {
    try {
      window.localStorage.removeItem(EXPLAINER_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setDismissed(false);
  }, []);

  return { dismissed, dismiss, reopen };
}

/* ── Main QuickInputBar ────────────────────────────────────────── */

export function QuickInputBar() {
  const { selectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const { dismissed: explainerDismissed, dismiss: dismissExplainer, reopen: reopenExplainer } =
    useExplainerDismissed();

  const [mode, setMode] = useState<QuickMode>("task");
  // Track whether the user has manually overridden the mode in this draft.
  // Once set, we stop auto-detecting until they clear the input.
  const [modeManuallySet, setModeManuallySet] = useState(false);
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Inline confirmation state — shows "✓ Sent to [Agent]" after submit
  const [confirmation, setConfirmation] = useState<{
    agentName: string | null;
    issueHref: string;
    mode: QuickMode;
  } | null>(null);
  const confirmationTimer = useRef<number | null>(null);

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const activeAgents = useMemo(
    () =>
      agents
        .filter((a) => a.status === "active" || a.status === "idle")
        .slice(0, 6),
    [agents],
  );

  // Smart agent detection from text
  const detectedAgent = useMemo(() => {
    if (selectedAgentId) return null;
    const lower = input.toLowerCase();
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
  }, [input, agents, selectedAgentId]);

  const effectiveAgentId = selectedAgentId ?? detectedAgent?.id ?? null;

  // Smart mode detection — infer intent from the first few words of the input
  // so a user typing "What is …" naturally lands in Ask mode without clicking.
  // Only runs until the user manually overrides with Tab/click.
  const detectedMode = useMemo<QuickMode | null>(() => {
    const trimmed = input.trim();
    if (trimmed.length < 3) return null;
    const lower = trimmed.toLowerCase();

    // Question shape — trailing ? or interrogative lead-ins
    if (trimmed.endsWith("?")) return "ask";
    if (/^(what|why|how|when|where|who|which|is|are|can|could|should|do|does|did|will|would)\b/.test(lower)) {
      return "ask";
    }

    // Decision shape — deliberate framing
    if (/^(should we|should i|decide|decision|pick|choose between|option [ab1-9]|vote)\b/.test(lower)) {
      return "decision";
    }

    // Task shape — imperative verbs
    if (/^(create|build|fix|add|make|write|implement|draft|update|delete|refactor|ship|deploy|investigate|research|schedule|send|prepare|generate|clean up|review|design|plan)\b/.test(lower)) {
      return "task";
    }

    return null;
  }, [input]);

  // Auto-apply detected mode until the user picks something themselves.
  useEffect(() => {
    if (modeManuallySet) return;
    if (detectedMode && detectedMode !== mode) {
      setMode(detectedMode);
    }
  }, [detectedMode, modeManuallySet, mode]);

  // Once the draft is cleared, let auto-detection take over again for the next one.
  useEffect(() => {
    if (input.trim().length === 0 && modeManuallySet) {
      setModeManuallySet(false);
    }
  }, [input, modeManuallySet]);

  const cycleMode = useCallback(() => {
    setModeManuallySet(true);
    setMode((prev) => {
      if (prev === "task") return "ask";
      if (prev === "ask") return "decision";
      return "task";
    });
  }, []);

  // Submit
  const createMut = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company");
      const text = input.trim();
      if (!text) throw new Error("Empty input");

      const originKind =
        mode === "ask"
          ? "board_question"
          : mode === "decision"
            ? "board_decision"
            : undefined;

      const issue = await issuesApi.create(selectedCompanyId, {
        title: text.length > 80 ? text.slice(0, 77) + "..." : text,
        description: text.length > 80 ? text : undefined,
        assigneeAgentId: effectiveAgentId,
        status: "todo",
        priority: mode === "decision" ? "high" : "medium",
        ...(originKind ? { originKind } : {}),
      });
      return issue;
    },
    onSuccess: (issue) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.issues.list(selectedCompanyId!),
      });
      // Also invalidate heartbeats so LiveProgressStrip picks up the new run
      queryClient.invalidateQueries({
        queryKey: queryKeys.heartbeats(selectedCompanyId!),
      });

      const assigneeName = effectiveAgentId
        ? agents.find((a) => a.id === effectiveAgentId)?.name
        : null;

      // Show inline confirmation instead of navigating away
      setInput("");
      setSelectedAgentId(null);
      setModeManuallySet(false);
      inputRef.current?.blur();

      // Clear any previous confirmation timer
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);

      setConfirmation({
        agentName: assigneeName ?? null,
        issueHref: `/issues/${issue.identifier ?? issue.id}`,
        mode,
      });

      // Auto-dismiss confirmation after 6s
      confirmationTimer.current = window.setTimeout(() => {
        setConfirmation(null);
        confirmationTimer.current = null;
      }, 6000);
    },
  });

  const handleSubmit = useCallback(() => {
    if (!input.trim() || createMut.isPending) return;
    createMut.mutate();
  }, [input, createMut]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        cycleMode();
      }
    },
    [handleSubmit, cycleMode],
  );

  // Cleanup confirmation timer
  useEffect(() => {
    return () => {
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    };
  }, []);

  // Focus shortcut: / key when not already focused
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isInput = tag === "input" || tag === "textarea" || tag === "select";
      if (e.key === "/" && !isInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const modeMeta = QUICK_MODES[mode];
  const ModeIcon = modeMeta.icon;
  const isExpanded = focused || input.length > 0;

  return (
    <div className="space-y-2">
      {!explainerDismissed && (
        <div className="relative rounded-2xl border border-primary/25 bg-primary/[0.06] px-4 py-3 pr-9 dark:border-primary/30 dark:bg-primary/[0.08]">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#7C9470] dark:text-[#A4BD95]" />
            <div className="text-xs leading-relaxed text-[#3D4A37] dark:text-[#D7E4CB]">
              <p className="font-medium">This is your agent composer.</p>
              <p className="mt-0.5 text-[#3D4A37]/75 dark:text-[#D7E4CB]/75">
                Type what you want an agent to do, ask, or decide. Pick an agent with a chip or
                just say <span className="font-medium">"tell Eleanor …"</span> and one of your
                agents will pick it up. <kbd className="rounded border border-border bg-background/60 px-1 py-0.5 font-mono text-[10px]">/</kbd> focuses the bar, <kbd className="rounded border border-border bg-background/60 px-1 py-0.5 font-mono text-[10px]">Tab</kbd> switches mode.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissExplainer}
            className="absolute right-2 top-2 rounded-md p-1 text-[#3D4A37]/50 transition-colors hover:bg-primary/10 hover:text-[#3D4A37] dark:text-[#D7E4CB]/50 dark:hover:text-[#D7E4CB]"
            aria-label="Dismiss explainer"
            title="Hide this tip"
          >
            <span className="block text-base leading-none">×</span>
          </button>
        </div>
      )}

    <div
      className={cn(
        "rounded-2xl border transition-all duration-200",
        isExpanded
          ? "border-border/30 shadow-lg shadow-black/[0.06] dark:shadow-black/20 bg-white dark:bg-background"
          : "border-border/10 dark:border-border/40 bg-white dark:bg-card shadow-sm shadow-black/[0.03] hover:shadow-md hover:shadow-black/[0.05]",
      )}
    >
      {/* Input row */}
      <div className="flex items-center gap-2 px-4 py-3">
        {/* Mode toggle button */}
        <button
          type="button"
          onClick={cycleMode}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all shrink-0",
            modeMeta.bg,
            modeMeta.color,
          )}
          title="Click or press Tab to switch mode"
        >
          <ModeIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{modeMeta.label}</span>
        </button>

        {/* Text input */}
        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setFocused(true);
              if (confirmation) setConfirmation(null);
            }}
            onBlur={() => setFocused(false)}
            placeholder={modeMeta.hint}
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
          />
          {!isExpanded && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
              <kbd className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                /
              </kbd>
              <span className="text-[10px] text-muted-foreground hidden sm:inline">
                to focus
              </span>
            </div>
          )}
        </div>

        {/* Submit button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!input.trim() || createMut.isPending}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all shrink-0",
            input.trim()
              ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          {createMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {mode === "ask" ? "Ask" : mode === "decision" ? "Decide" : "Create"}
          </span>
        </button>
      </div>

      {/* Expanded: agent chips + helper text */}
      {isExpanded && activeAgents.length > 0 && (
        <div className="border-t border-border px-4 py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-medium text-muted-foreground/60 shrink-0">
              Assign to
            </span>
            {activeAgents.map((agent) => (
              <AgentChip
                key={agent.id}
                agent={agent}
                selected={selectedAgentId === agent.id}
                onClick={() =>
                  setSelectedAgentId((prev) =>
                    prev === agent.id ? null : agent.id,
                  )
                }
              />
            ))}
          </div>

          {/* Detected agent hint */}
          {detectedAgent && !selectedAgentId && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Bot className="h-3 w-3" />
              <span>
                Will be assigned to{" "}
                <span className="font-medium text-foreground">
                  {detectedAgent.name}
                </span>
              </span>
            </div>
          )}

          {/* Error */}
          {createMut.isError && (
            <div className="mt-1.5 text-xs text-destructive">
              {createMut.error instanceof Error
                ? createMut.error.message
                : "Failed to create"}
            </div>
          )}

          {/* Keyboard hints */}
          <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">
                Enter
              </kbd>{" "}
              to send
            </span>
            <span>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">
                Tab
              </kbd>{" "}
              switch mode
            </span>
          </div>
        </div>
      )}

      {/* Inline confirmation — replaces toast + navigation */}
      {confirmation && (
        <div className="border-t border-green-200/60 dark:border-green-500/20 bg-green-50/50 dark:bg-green-950/20 px-4 py-3 rounded-b-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="h-4 w-4 text-sage-ink shrink-0" />
              <span className="text-sm text-[#3D4A37] dark:text-[#D7E4CB] font-medium truncate">
                {confirmation.mode === "ask"
                  ? "Question sent"
                  : confirmation.mode === "decision"
                    ? "Decision created"
                    : "Task sent"}
                {confirmation.agentName && (
                  <> to <span className="font-semibold">{confirmation.agentName}</span></>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-sage-ink/60 hidden sm:inline">
                Watch below for results
              </span>
              <a
                href={confirmation.issueHref}
                onClick={(e) => {
                  e.preventDefault();
                  setConfirmation(null);
                  navigate(confirmation.issueHref);
                }}
                className="text-xs text-sage-ink font-medium hover:underline"
              >
                View details →
              </a>
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                className="text-sage-ink/50 hover:text-sage-ink/50 dark:hover:text-green-400 transition-colors"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {explainerDismissed && (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={reopenExplainer}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground"
          title="Show composer tip"
        >
          <HelpCircle className="h-3 w-3" />
          What is this?
        </button>
      </div>
    )}
    </div>
  );
}
