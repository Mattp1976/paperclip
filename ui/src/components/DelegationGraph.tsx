import { Link } from "@/lib/router";
import type { Agent } from "@mattparrytfc/shared";
import { AgentIcon } from "./AgentIconPicker";
import { cn } from "../lib/utils";

/**
 * Compact "who delegates to me / who I delegate to" graph for the agent detail
 * page (PLAN-30D task #21). Kept intentionally small (w×h = 200×120 by default)
 * — it's context in the side of the overview, not the headline chart.
 *
 * The graph derives from issue history: an edge X→Y exists when there's at
 * least one issue with `createdByAgentId=X` and `assigneeAgentId=Y`. Edge
 * weight = number of such issues.
 */

export interface DelegationEdge {
  /** The other agent (the one *not* at the centre of the graph). */
  agent: Agent;
  /** How many issues backed this edge. */
  count: number;
}

interface DelegationGraphProps {
  /** Agents that have routed work to this agent (incoming edges). */
  incoming: DelegationEdge[];
  /** Agents this agent has routed work to (outgoing edges). */
  outgoing: DelegationEdge[];
  /** Optional self-label shown on the centre node. */
  selfLabel?: string;
  /** How many neighbours to render per side before collapsing to a "+N more" hint. */
  maxPerSide?: number;
  className?: string;
}

const WIDTH = 200;
const HEIGHT = 120;
const NODE_RADIUS = 9;
const CENTER_RADIUS = 11;

export function DelegationGraph({
  incoming,
  outgoing,
  selfLabel = "this agent",
  maxPerSide = 3,
  className,
}: DelegationGraphProps) {
  const incomingVisible = incoming.slice(0, maxPerSide);
  const outgoingVisible = outgoing.slice(0, maxPerSide);
  const incomingOverflow = Math.max(0, incoming.length - incomingVisible.length);
  const outgoingOverflow = Math.max(0, outgoing.length - outgoingVisible.length);

  const isEmpty = incoming.length === 0 && outgoing.length === 0;
  if (isEmpty) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed border-border/60 bg-card/30 px-3 py-4 text-center text-xs text-muted-foreground",
          className,
        )}
        role="img"
        aria-label={`${selfLabel} has no delegation history yet`}
      >
        No delegation history yet. Route a task to another agent, or have one routed here, and it'll show up.
      </div>
    );
  }

  const incomingPositions = verticalSlots(incomingVisible.length, HEIGHT);
  const outgoingPositions = verticalSlots(outgoingVisible.length, HEIGHT);

  const maxCount = Math.max(
    1,
    ...incomingVisible.map((e) => e.count),
    ...outgoingVisible.map((e) => e.count),
  );

  return (
    <div className={cn("inline-flex flex-col gap-2", className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={`Delegation graph: ${incoming.length} upstream, ${outgoing.length} downstream`}
        className="overflow-visible"
      >
        {/* Centre node */}
        <circle
          cx={WIDTH / 2}
          cy={HEIGHT / 2}
          r={CENTER_RADIUS}
          className="fill-primary/15 stroke-primary"
          strokeWidth={1.5}
        />
        <text
          x={WIDTH / 2}
          y={HEIGHT / 2 + 22}
          textAnchor="middle"
          className="fill-muted-foreground text-[9px]"
        >
          {selfLabel}
        </text>

        {/* Incoming edges (left side → centre) */}
        {incomingVisible.map((edge, i) => {
          const y = incomingPositions[i];
          const strokeWidth = edgeWidth(edge.count, maxCount);
          return (
            <g key={`in:${edge.agent.id}`}>
              <line
                x1={NODE_RADIUS + 2}
                y1={y}
                x2={WIDTH / 2 - CENTER_RADIUS - 1}
                y2={HEIGHT / 2}
                className="stroke-muted-foreground/50"
                strokeWidth={strokeWidth}
              />
              <circle
                cx={NODE_RADIUS + 2}
                cy={y}
                r={NODE_RADIUS}
                className="fill-muted stroke-border"
                strokeWidth={1}
              />
            </g>
          );
        })}

        {/* Outgoing edges (centre → right side) */}
        {outgoingVisible.map((edge, i) => {
          const y = outgoingPositions[i];
          const strokeWidth = edgeWidth(edge.count, maxCount);
          return (
            <g key={`out:${edge.agent.id}`}>
              <line
                x1={WIDTH / 2 + CENTER_RADIUS + 1}
                y1={HEIGHT / 2}
                x2={WIDTH - NODE_RADIUS - 2}
                y2={y}
                className="stroke-primary/45"
                strokeWidth={strokeWidth}
              />
              <circle
                cx={WIDTH - NODE_RADIUS - 2}
                cy={y}
                r={NODE_RADIUS}
                className="fill-primary/10 stroke-primary"
                strokeWidth={1}
              />
            </g>
          );
        })}
      </svg>

      {/* Captions: clickable agent lists so the graph isn't just pixels. */}
      <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
        <EdgeList
          direction="Incoming"
          edges={incomingVisible}
          overflow={incomingOverflow}
        />
        <EdgeList
          direction="Outgoing"
          edges={outgoingVisible}
          overflow={outgoingOverflow}
        />
      </div>
    </div>
  );
}

function EdgeList({
  direction,
  edges,
  overflow,
}: {
  direction: "Incoming" | "Outgoing";
  edges: DelegationEdge[];
  overflow: number;
}) {
  if (edges.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="uppercase tracking-wide text-muted-foreground/60">{direction}</span>
      {edges.map(({ agent, count }) => (
        <Link
          key={`${direction}:${agent.id}`}
          to={`/agents/${agent.urlKey || agent.id}`}
          className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 no-underline text-inherit transition-colors hover:bg-accent"
        >
          <AgentIcon icon={agent.icon} className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="truncate max-w-[90px]">{agent.name}</span>
          <span className="text-muted-foreground/60">×{count}</span>
        </Link>
      ))}
      {overflow > 0 ? (
        <span className="text-muted-foreground/60">+{overflow} more</span>
      ) : null}
    </div>
  );
}

/** Evenly-spaced vertical slots inside a column (padded from the edges). */
function verticalSlots(n: number, height: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [height / 2];
  const pad = 12;
  const step = (height - pad * 2) / (n - 1);
  return Array.from({ length: n }, (_, i) => pad + i * step);
}

/** Clamp line thickness so weight shows but doesn't dominate. */
function edgeWidth(count: number, max: number): number {
  const norm = Math.max(0.15, count / max);
  return 0.8 + norm * 2.2; // 0.95 → 3 px range
}

/**
 * Derive the incoming + outgoing edges for an agent from a bag of issues.
 * Self-edges (created + assigned by the same agent) are excluded.
 */
export function computeDelegationEdges({
  agentId,
  issues,
  agentsById,
}: {
  agentId: string;
  issues: { createdByAgentId: string | null; assigneeAgentId: string | null }[];
  agentsById: Map<string, Agent>;
}): { incoming: DelegationEdge[]; outgoing: DelegationEdge[] } {
  const incomingCounts = new Map<string, number>();
  const outgoingCounts = new Map<string, number>();

  for (const issue of issues) {
    const from = issue.createdByAgentId;
    const to = issue.assigneeAgentId;
    if (!from || !to || from === to) continue;
    if (to === agentId && from !== agentId) {
      incomingCounts.set(from, (incomingCounts.get(from) ?? 0) + 1);
    }
    if (from === agentId && to !== agentId) {
      outgoingCounts.set(to, (outgoingCounts.get(to) ?? 0) + 1);
    }
  }

  const toEdges = (counts: Map<string, number>): DelegationEdge[] =>
    [...counts.entries()]
      .map(([id, count]) => {
        const agent = agentsById.get(id);
        return agent ? { agent, count } : null;
      })
      .filter((x): x is DelegationEdge => x !== null)
      .sort((a, b) => b.count - a.count || a.agent.name.localeCompare(b.agent.name));

  return {
    incoming: toEdges(incomingCounts),
    outgoing: toEdges(outgoingCounts),
  };
}
