import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Agent, Issue } from "@mattparrytfc/shared";
import { AGENT_ROLE_LABELS } from "@mattparrytfc/shared";
import { ArrowRightToLine } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { AgentIcon } from "./AgentIconPicker";
import { cn } from "../lib/utils";
import { rankAgentsForTask } from "../lib/rankAgentsForTask";

interface RouteToActionProps {
  issue: Issue;
  agents: Agent[];
  /** Scope used to invalidate list/inbox/badge queries after a successful route. */
  companyId: string;
  /** Optional additional invalidation keys — e.g. a delegation graph view. */
  invalidateQueryKeys?: readonly (readonly unknown[])[];
  /** Tooltip/aria variant when no agents exist yet. */
  emptyLabel?: string;
}

/**
 * Inbox-row "Route to…" action (VOICE.md rule 9).
 *
 * Single click sends the task to the picked agent, with an undo toast. Agent
 * list is ranked by role + skill tag match against the task title + description
 * (see rankAgentsForTask). Self-claim is not offered here — the Inbox already
 * has a "claim" affordance elsewhere; this action is for delegation.
 */
export function RouteToAction({
  issue,
  agents,
  companyId,
  invalidateQueryKeys,
  emptyLabel = "No agents available",
}: RouteToActionProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const ranked = useMemo(
    () => rankAgentsForTask(agents, {
      taskTitle: issue.title,
      taskDescription: issue.description,
    }),
    [agents, issue.title, issue.description],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter(({ agent }) => {
      if (agent.name.toLowerCase().includes(q)) return true;
      if (agent.title && agent.title.toLowerCase().includes(q)) return true;
      if (agent.role.includes(q)) return true;
      if (agent.capabilities && agent.capabilities.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [ranked, search]);

  const invalidate = () => {
    // Core refreshes: Inbox list, the item itself, sidebar counters, dashboard widgets.
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.listAssignedToMe(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issue.id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(companyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(companyId) });
    // Optional caller-supplied keys (e.g. a delegation graph view).
    if (invalidateQueryKeys) {
      for (const key of invalidateQueryKeys) {
        queryClient.invalidateQueries({ queryKey: key as unknown[] });
      }
    }
  };

  const routeMutation = useMutation({
    mutationFn: async (patch: {
      assigneeAgentId: string | null;
      assigneeUserId: string | null;
    }) => issuesApi.update(issue.id, patch),
    onSettled: () => invalidate(),
  });

  const handleSelect = (agent: Agent) => {
    const prior = {
      assigneeAgentId: issue.assigneeAgentId ?? null,
      assigneeUserId: issue.assigneeUserId ?? null,
    };
    setOpen(false);
    setSearch("");
    routeMutation.mutate(
      { assigneeAgentId: agent.id, assigneeUserId: null },
      {
        onSuccess: () => {
          pushToast({
            title: `Routed to ${agent.name}`,
            body: issue.title,
            tone: "success",
            ttlMs: 6000,
            action: {
              label: "Undo",
              onClick: () => {
                routeMutation.mutate(prior);
              },
            },
          });
        },
        onError: (err) => {
          pushToast({
            title: "Routing failed",
            body: err instanceof Error ? err.message : "Unknown error",
            tone: "error",
          });
        },
      },
    );
  };

  const disabled = agents.length === 0;
  const triggerLabel = agents.length === 0 ? emptyLabel : "Route to…";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            // IssueRow wraps the action in a Link — stop navigation.
            event.preventDefault();
            event.stopPropagation();
          }}
          aria-label={triggerLabel}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-md border border-transparent px-2 text-[11px] font-medium text-muted-foreground transition-colors",
            "hover:border-border hover:bg-accent hover:text-foreground",
            disabled && "cursor-not-allowed opacity-40",
          )}
        >
          <ArrowRightToLine className="h-3 w-3" />
          <span>{triggerLabel}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 p-0"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <input
          className="w-full border-b border-border bg-transparent px-3 py-2 text-xs outline-none placeholder:text-muted-foreground/60"
          placeholder="Search agents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div className="max-h-64 overflow-y-auto overscroll-contain py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">No matches</p>
          ) : (
            filtered.map(({ agent, reason }) => {
              const isCurrent = agent.id === issue.assigneeAgentId;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => handleSelect(agent)}
                  disabled={isCurrent}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/60",
                    isCurrent && "cursor-default bg-accent/40 opacity-70",
                  )}
                >
                  <AgentIcon icon={agent.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/60">
                    {AGENT_ROLE_LABELS[agent.role] ?? agent.role}
                  </span>
                  {reason && !isCurrent ? (
                    <span className="shrink-0 rounded-sm bg-primary/10 px-1 py-0.5 text-[9px] uppercase tracking-wide text-primary">
                      {reason}
                    </span>
                  ) : null}
                  {isCurrent ? (
                    <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground">
                      Current
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
