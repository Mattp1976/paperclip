/**
 * AgentQuestionPopup — global modal that surfaces clarifying questions
 * that paused agents are waiting on. Mounted once in the root Layout so
 * it can pop up from any page.
 *
 * The UX deliberately matches the "agent is blocked waiting for me" mental
 * model rather than "there is a notification":
 *   - modal sits on top of whatever the user is doing
 *   - if multiple questions are open we show them one at a time, with a
 *     small pager so the user knows how many are queued
 *   - answer is a single free-text field; empty answers are rejected
 *   - "Your call" dismisses the question (agent proceeds with best guess)
 *
 * Polls every 10s on the open-list; mutations invalidate the list so the
 * next question (or empty state) slides in.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, MessageCircleQuestion } from "lucide-react";
import { agentQuestionsApi } from "../api/agent-questions";
import { queryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AgentQuestionPopup() {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [draft, setDraft] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const { data: questions } = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.agentQuestions.open(selectedCompanyId)
      : ["agent-questions", "open", "__none__"],
    queryFn: () => agentQuestionsApi.listOpen(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const openQuestions = useMemo(() => questions ?? [], [questions]);

  // Focus the oldest question first so users process them FIFO. When the
  // current focused one is resolved, the next render auto-advances.
  useEffect(() => {
    if (openQuestions.length === 0) {
      if (focusedId !== null) setFocusedId(null);
      return;
    }
    if (!focusedId || !openQuestions.some((q) => q.id === focusedId)) {
      // listOpen returns desc createdAt; pick the tail = oldest.
      const oldest = openQuestions[openQuestions.length - 1]!;
      setFocusedId(oldest.id);
      setDraft("");
    }
  }, [openQuestions, focusedId]);

  const focused = useMemo(
    () => openQuestions.find((q) => q.id === focusedId) ?? null,
    [openQuestions, focusedId],
  );

  const invalidate = () => {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({
      queryKey: queryKeys.agentQuestions.open(selectedCompanyId),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.sidebarBadges(selectedCompanyId),
    });
  };

  const answerMutation = useMutation({
    mutationFn: (input: { id: string; answer: string }) =>
      agentQuestionsApi.answer(input.id, input.answer),
    onSuccess: () => {
      setDraft("");
      invalidate();
      pushToast({ title: "Answer sent back to the agent.", tone: "success" });
    },
    onError: (err: unknown) => {
      pushToast({
        title: "Could not send answer",
        body: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => agentQuestionsApi.dismiss(id),
    onSuccess: () => {
      setDraft("");
      invalidate();
      pushToast({
        title: "Dismissed — the agent will use its best judgement.",
        tone: "success",
      });
    },
    onError: (err: unknown) => {
      pushToast({
        title: "Could not dismiss",
        body: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    },
  });

  if (!focused) return null;

  const queuePosition = openQuestions.findIndex((q) => q.id === focused.id) + 1;
  const queueTotal = openQuestions.length;
  const busy = answerMutation.isPending || dismissMutation.isPending;

  return (
    <Dialog
      open
      onOpenChange={() => {
        // Popup is modal-by-intent: the agent is waiting. Don't let radix
        // close on escape/overlay clicks — the user must answer or dismiss.
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-xl"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-sage-ink">
            <MessageCircleQuestion className="h-5 w-5" aria-hidden />
            <DialogTitle>
              {focused.agent.name} needs a decision from you
            </DialogTitle>
          </div>
          <DialogDescription>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5" aria-hidden />
                <span>{focused.agent.title ?? focused.agent.name}</span>
              </span>
              <span aria-hidden>·</span>
              <span className="font-mono">{focused.issue.identifier}</span>
              <span className="truncate">{focused.issue.title}</span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-base leading-relaxed text-foreground whitespace-pre-wrap">
            {focused.question}
          </p>
          {focused.context ? (
            <div className="rounded-md border border-sage-soft/50 bg-sage-mist/40 px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap">
              {focused.context}
            </div>
          ) : null}
        </div>

        <label className="space-y-1.5 block">
          <span className="text-sm font-medium text-foreground">Your answer</span>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type the answer the agent needs to proceed…"
            rows={4}
            autoFocus
            disabled={busy}
          />
        </label>

        <DialogFooter className="items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {queueTotal > 1 ? (
              <>
                Question {queuePosition} of {queueTotal} waiting
              </>
            ) : (
              <>Agent is paused until you respond</>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => dismissMutation.mutate(focused.id)}
            >
              {dismissMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Your call
            </Button>
            <Button
              type="button"
              variant="sage"
              disabled={busy || draft.trim().length === 0}
              onClick={() =>
                answerMutation.mutate({ id: focused.id, answer: draft.trim() })
              }
            >
              {answerMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Send answer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
