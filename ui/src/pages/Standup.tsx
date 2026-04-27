/**
 * Standup — the daily PMO page.
 *
 * For each active agent we render three stacked columns in Dashboard
 * copy-idiom: "What you closed", "What you're on", "In the way". Blockers
 * lead because that's where the human attention should go first. Quiet
 * agents (nothing in any bucket) are intentionally dropped server-side so
 * this page stays a "briefing" rather than a roster.
 *
 * Keep the rendering dumb — no drag/drop, no editing. Humans hop into
 * issue detail to take action; this page is the summary.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock,
  Copy,
  Check,
  MessageSquare,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  AgentStandupEntry,
  StandupBlocker,
  StandupIssueRef,
} from "@orqestra/shared";
import { standupApi } from "../api/standup";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { PageSkeleton } from "../components/PageSkeleton";
import { SoftCard } from "../components/SoftCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { issueUrl, relativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type WindowOption = "24" | "48" | "72" | "168";

const WINDOW_LABELS: Record<WindowOption, string> = {
  "24": "Last 24 hours",
  "48": "Since 2 days ago",
  "72": "Since 3 days ago",
  "168": "This past week",
};

export function Standup() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [windowHours, setWindowHours] = useState<WindowOption>("24");
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">("idle");

  useEffect(() => {
    setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const windowHoursNum = Number(windowHours);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.standup(selectedCompanyId!, windowHoursNum),
    queryFn: () => standupApi.daily(selectedCompanyId!, windowHoursNum),
    enabled: !!selectedCompanyId,
  });

  async function copyDigest() {
    if (!selectedCompanyId) return;
    setCopyState("copying");
    try {
      const { markdown } = await standupApi.digest(selectedCompanyId, windowHoursNum);
      await navigator.clipboard.writeText(markdown);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2_000);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 2_000);
    }
  }

  const totals = data?.totals;

  const summaryBits = useMemo(() => {
    if (!totals) return [] as { label: string; value: string }[];
    return [
      { label: "Agents reporting", value: String(totals.agentsReporting) },
      { label: "Shipped", value: String(totals.completedYesterday) },
      { label: "In flight", value: String(totals.activeToday) },
      { label: "Blockers", value: String(totals.blockers) },
    ];
  }, [totals]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Users} message="Select a company to view the standup" />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Standup"
        subtitle="What each agent closed, what they're working on, and what's getting in the way."
        actions={
          <div className="flex items-center gap-2">
            <Select value={windowHours} onValueChange={(v) => setWindowHours(v as WindowOption)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(WINDOW_LABELS) as WindowOption[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {WINDOW_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={copyDigest}
              disabled={copyState === "copying" || !data}
              className="gap-1.5"
            >
              {copyState === "copied" ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : copyState === "error" ? (
                <>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Failed
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy email
                </>
              )}
            </Button>
          </div>
        }
      />

      {error && (
        <p className="text-sm text-destructive">
          Couldn't load the standup: {error.message}
        </p>
      )}

      {data && summaryBits.length > 0 ? (
        <SoftCard padding="tight" className="flex flex-wrap gap-6">
          {summaryBits.map((bit) => (
            <div key={bit.label} className="min-w-[120px]">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {bit.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{bit.value}</p>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Window: {new Date(data.windowStart).toLocaleString()} → {new Date(data.windowEnd).toLocaleString()}
          </div>
        </SoftCard>
      ) : null}

      {data && data.agents.length === 0 ? (
        <EmptyState
          icon={Users}
          message="Quiet period"
          description="No agent closed, started, or blocked work in this window. Try widening the window with the filter above."
        />
      ) : null}

      <div className="flex flex-col gap-5">
        {data?.agents.map((entry) => (
          <AgentStandupRow key={entry.agent.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function AgentStandupRow({ entry }: { entry: AgentStandupEntry }) {
  const { agent } = entry;
  return (
    <SoftCard className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--sage-surface)] text-sm font-semibold text-[color:var(--sage-ink)]">
          {agent.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex flex-col">
          <p className="text-sm font-semibold text-foreground">{agent.name}</p>
          <p className="text-xs text-muted-foreground">
            {agent.title ?? agent.role ?? "Agent"}
            <span className="mx-1.5">·</span>
            <span className="capitalize">{agent.status}</span>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {entry.runs.succeeded > 0 && (
            <span className="inline-flex items-center gap-1 text-[color:var(--sage-ink)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {entry.runs.succeeded} succeeded
            </span>
          )}
          {entry.runs.failed > 0 && (
            <span className="inline-flex items-center gap-1 text-[color:var(--rose-deep)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {entry.runs.failed} failed
            </span>
          )}
          {entry.runs.cancelled > 0 && (
            <span>{entry.runs.cancelled} cancelled</span>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StandupColumn
          tone="sage"
          icon={CheckCircle2}
          title="Closed"
          emptyLabel="Nothing closed in window."
          items={entry.yesterday.map((issue) => (
            <IssueLine key={issue.id} issue={issue} timestamp={issue.completedAt ?? issue.updatedAt} />
          ))}
        />
        <StandupColumn
          tone="neutral"
          icon={CircleDot}
          title="In flight"
          emptyLabel="Nothing assigned."
          items={entry.today.map((issue) => (
            <IssueLine key={issue.id} issue={issue} timestamp={issue.updatedAt} />
          ))}
        />
        <StandupColumn
          tone="rose"
          icon={AlertTriangle}
          title="Blockers"
          emptyLabel="None."
          items={entry.blockers.map((b, i) => (
            <BlockerLine key={blockerKey(b, i)} blocker={b} />
          ))}
        />
      </div>
    </SoftCard>
  );
}

function blockerKey(b: StandupBlocker, i: number): string {
  return b.kind === "peer_note" ? `pn-${b.noteId}` : `bi-${b.issue.id}-${i}`;
}

function StandupColumn({
  tone,
  icon: Icon,
  title,
  emptyLabel,
  items,
}: {
  tone: "sage" | "neutral" | "rose";
  icon: typeof CheckCircle2;
  title: string;
  emptyLabel: string;
  items: React.ReactNode[];
}) {
  const toneClass =
    tone === "sage"
      ? "text-[color:var(--sage-ink)]"
      : tone === "rose"
        ? "text-[color:var(--rose-deep)]"
        : "text-muted-foreground";
  return (
    <div className="flex flex-col gap-2">
      <div className={cn("flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider", toneClass)}>
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-1.5">{items}</div>
      )}
    </div>
  );
}

function IssueLine({ issue, timestamp }: { issue: StandupIssueRef; timestamp: Date }) {
  return (
    <Link
      to={issueUrl(issue)}
      className="group flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[color:var(--sage-surface)]/40"
    >
      <span className="font-mono text-[11px] text-muted-foreground">
        {issue.identifier ?? "—"}
      </span>
      <span className="flex-1 truncate text-foreground group-hover:underline">
        {issue.title}
      </span>
      <span className="whitespace-nowrap text-[11px] text-muted-foreground/80">
        {relativeTime(timestamp)}
      </span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 opacity-0 transition group-hover:opacity-100" />
    </Link>
  );
}

function BlockerLine({ blocker }: { blocker: StandupBlocker }) {
  if (blocker.kind === "blocked_issue") {
    return (
      <div className="flex flex-col gap-0.5 rounded-lg border border-[color:var(--rose-deep)]/20 bg-[color:var(--rose-soft)]/30 px-2.5 py-1.5">
        <Link to={issueUrl(blocker.issue)} className="text-sm font-medium text-foreground hover:underline">
          <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
            {blocker.issue.identifier ?? "—"}
          </span>
          {blocker.issue.title}
        </Link>
        <p className="text-[11px] text-muted-foreground">Task status is blocked.</p>
      </div>
    );
  }

  const tone =
    blocker.noteKind === "blocker_flag"
      ? "border-[color:var(--rose-deep)]/20 bg-[color:var(--rose-soft)]/30"
      : "border-[color:var(--chart-3)]/20 bg-[color:var(--chart-3)]/10";
  const label = blocker.noteKind === "blocker_flag" ? "Blocker flag" : "Help request";

  return (
    <div className={cn("flex flex-col gap-1 rounded-lg border px-2.5 py-1.5", tone)}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <MessageSquare className="h-3 w-3" />
        <span className="font-medium uppercase tracking-wider">{label}</span>
        <span>·</span>
        <span>{relativeTime(blocker.createdAt)}</span>
      </div>
      <p className="line-clamp-2 text-sm text-foreground">{blocker.body}</p>
      <Link
        to={issueUrl(blocker.issue)}
        className="text-[11px] text-[color:var(--sage-ink)] hover:underline"
      >
        {blocker.issue.identifier ?? blocker.issue.title} ↗
      </Link>
    </div>
  );
}
