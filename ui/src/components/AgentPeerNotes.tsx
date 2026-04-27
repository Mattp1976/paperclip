/**
 * AgentPeerNotes — renders the agent-to-agent "whisper" lane on a task.
 *
 * Distinct from the human comment thread: these are notes one agent leaves
 * for another (help requests, context shares, blocker flags, handoffs,
 * mentor nudges). The UI surface is intentionally quieter than comments —
 * smaller type, different chrome — so it reads as a side-channel rather
 * than primary human conversation.
 *
 * The component is read-heavy for humans (ack / resolve actions are
 * exposed, but composing new notes is intentionally agent-only — humans
 * should use normal comments). We still render a lightweight footer
 * explaining that so humans aren't left wondering where the compose box is.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRightLeft, Lightbulb, MessageCircle, Sparkles, CheckCircle2, Clock } from "lucide-react";
import { useMemo } from "react";
import type { AgentPeerNote, AgentPeerNoteKind, Agent } from "@orqestra/shared";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { cn, relativeTime } from "@/lib/utils";

interface AgentPeerNotesProps {
  issueId: string;
  agentMap: Map<string, Pick<Agent, "id" | "name"> | Agent>;
}

const KIND_META: Record<AgentPeerNoteKind, { label: string; icon: typeof MessageCircle; tone: string }> = {
  help_request: { label: "Help request", icon: AlertTriangle, tone: "text-[color:var(--chart-3)]" },
  context_share: { label: "Context", icon: Lightbulb, tone: "text-[color:var(--sage-ink)]" },
  blocker_flag: { label: "Blocker", icon: AlertTriangle, tone: "text-[color:var(--rose-deep)]" },
  handoff: { label: "Handoff", icon: ArrowRightLeft, tone: "text-[color:var(--chart-4)]" },
  mentor_nudge: { label: "Mentor nudge", icon: Sparkles, tone: "text-[color:var(--chart-5)]" },
};

export function AgentPeerNotes({ issueId, agentMap }: AgentPeerNotesProps) {
  const qc = useQueryClient();

  const { data: notes, isLoading } = useQuery({
    queryKey: queryKeys.issues.peerNotes(issueId),
    queryFn: () => issuesApi.listPeerNotes(issueId),
  });

  const ack = useMutation({
    mutationFn: (noteId: string) => issuesApi.ackPeerNote(issueId, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.issues.peerNotes(issueId) }),
  });
  const resolve = useMutation({
    mutationFn: (noteId: string) => issuesApi.resolvePeerNote(issueId, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.issues.peerNotes(issueId) }),
  });

  const ordered = useMemo(() => {
    if (!notes) return [];
    // list endpoint returns desc; UI reads better chronologically inside
    // the drawer (oldest → newest) because threads tend to build on each other
    return [...notes].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [notes]);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading agent notes…</p>;
  }

  if (ordered.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/50 px-4 py-6 text-center">
        <p className="text-sm font-medium text-foreground">No agent notes yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          When one agent leaves a note for another on this task — a question,
          context, or handoff — it shows up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {ordered.map((note) => (
        <PeerNoteRow
          key={note.id}
          note={note}
          agentMap={agentMap}
          onAck={() => ack.mutate(note.id)}
          onResolve={() => resolve.mutate(note.id)}
          ackDisabled={ack.isPending || !!note.acknowledgedAt}
          resolveDisabled={resolve.isPending || !!note.resolvedAt}
        />
      ))}
      <p className="mt-1 text-[11px] text-muted-foreground/70">
        Agents compose peer notes through a dedicated tool — humans can
        acknowledge or mark resolved, but otherwise respond via the main
        Comments thread.
      </p>
    </div>
  );
}

function PeerNoteRow({
  note,
  agentMap,
  onAck,
  onResolve,
  ackDisabled,
  resolveDisabled,
}: {
  note: AgentPeerNote;
  agentMap: Map<string, Pick<Agent, "id" | "name"> | Agent>;
  onAck: () => void;
  onResolve: () => void;
  ackDisabled: boolean;
  resolveDisabled: boolean;
}) {
  const kind = (KIND_META[note.kind as AgentPeerNoteKind] ?? KIND_META.context_share);
  const Icon = kind.icon;
  const fromName = agentMap.get(note.fromAgentId)?.name ?? note.fromAgentId.slice(0, 6);
  const toName = note.toAgentId
    ? agentMap.get(note.toAgentId)?.name ?? note.toAgentId.slice(0, 6)
    : "everyone on task";

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/40 bg-[color:var(--sage-surface)]/40 px-4 py-3",
        note.resolvedAt && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Icon className={cn("h-3.5 w-3.5", kind.tone)} />
        <span className={cn("font-medium uppercase tracking-wider text-[10px]", kind.tone)}>
          {kind.label}
        </span>
        <span>·</span>
        <span>
          <span className="font-medium text-foreground">{fromName}</span>
          <span className="text-muted-foreground"> → </span>
          <span className="font-medium text-foreground">{toName}</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground/70">
          <Clock className="h-3 w-3" />
          {relativeTime(note.createdAt)}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
        {note.body}
      </p>

      <div className="mt-2 flex items-center gap-3 text-[11px]">
        {note.acknowledgedAt ? (
          <span className="inline-flex items-center gap-1 text-[color:var(--sage-ink)]">
            <CheckCircle2 className="h-3 w-3" />
            Acknowledged
          </span>
        ) : (
          <button
            onClick={onAck}
            disabled={ackDisabled}
            className="text-[color:var(--sage-ink)] hover:underline disabled:opacity-40"
          >
            Acknowledge
          </button>
        )}

        {note.resolvedAt ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <CheckCircle2 className="h-3 w-3" />
            Resolved
          </span>
        ) : (
          <button
            onClick={onResolve}
            disabled={resolveDisabled}
            className="text-muted-foreground hover:text-foreground hover:underline disabled:opacity-40"
          >
            Mark resolved
          </button>
        )}
      </div>
    </div>
  );
}
