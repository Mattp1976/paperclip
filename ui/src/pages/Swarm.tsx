import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { agentsApi } from "../api/agents";
import { heartbeatsApi, type LiveRunForIssue } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { relativeTime } from "../lib/utils";
import type { Agent } from "@orqestra/shared";

/* ── palette (design-system tokens) ─────────────────────────── */
/**
 * Model colours use the chart-* CSS tokens so they follow the
 * sage/rose/taupe palette and flip cleanly in dark mode.
 *   Opus   → butter  (chart-4)
 *   Sonnet → lavender (chart-5)
 *   Haiku  → sage    (chart-1 / primary)
 *   other  → taupe   (chart-3)
 */
const MODEL_TOKEN: Record<string, string> = {
  "claude-opus-4-6": "var(--chart-4)",
  "claude-sonnet-4-6": "var(--chart-5)",
  "claude-haiku-4-5-20251001": "var(--chart-1)",
};
const STATUS_TOKEN: Record<string, string> = {
  idle: "var(--muted-foreground)",
  running: "var(--sage-ink)",
  error: "var(--rose-deep)",
  paused: "var(--chart-3)",
};
const STATUS_LABEL: Record<string, string> = {
  idle: "Idle",
  running: "Running",
  error: "Error",
  paused: "Paused",
};
const TIER_LABEL: Record<string, string> = {
  "claude-opus-4-6": "Opus",
  "claude-sonnet-4-6": "Sonnet",
  "claude-haiku-4-5-20251001": "Haiku",
};
function agentModel(agent: Agent): string | undefined {
  return (agent.adapterConfig as Record<string, unknown>)?.model as string | undefined;
}
function modelColor(agent: Agent) {
  return MODEL_TOKEN[agentModel(agent) ?? ""] ?? "var(--chart-3)";
}
function tierLabel(agent: Agent) {
  return TIER_LABEL[agentModel(agent) ?? ""] ?? "Default";
}
function statusColor(status: string) {
  return STATUS_TOKEN[status] ?? "var(--muted-foreground)";
}
function statusLabel(status: string) {
  return STATUS_LABEL[status] ?? status;
}

/* ── types ──────────────────────────────────────────────────── */
interface SimNode {
  id: string;
  name: string;
  title: string;
  role: string;
  status: string;
  reportsTo: string | null;
  agent: Agent;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  tier: number; // 1=C-suite, 2=VP/Dir, 3=rest
}
interface SimLink {
  source: string;
  target: string;
}

function agentTier(agent: Agent): number {
  const r = agent.role;
  const n = (agent.name ?? "").toLowerCase();
  if (r === "ceo" || r === "cto" || r === "cfo" || r === "cmo") return 1;
  if (
    n.includes("chief") ||
    n.includes("coo") ||
    n.includes("cso") ||
    n.includes("chro") ||
    n.includes("general counsel")
  )
    return 1;
  if (n.startsWith("md ") || n.startsWith("vp ") || n.includes("director") || n.includes("head of"))
    return 2;
  return 3;
}

/* ── force simulation (no d3 dependency — hand-rolled) ──────── */
function initNodes(agents: Agent[], w: number, h: number): SimNode[] {
  const cx = w / 2,
    cy = h / 2;
  return agents
    .filter((a) => a.name !== "_DELETED")
    .map((a, i, arr) => {
      const tier = agentTier(a);
      const angle = (2 * Math.PI * i) / arr.length;
      const spread = tier === 1 ? 80 : tier === 2 ? 200 : 340;
      return {
        id: a.id,
        name: a.name ?? "Agent",
        title: a.title ?? a.role,
        role: a.role,
        status: a.status ?? "idle",
        reportsTo: a.reportsTo ?? null,
        agent: a,
        x: cx + Math.cos(angle) * spread + (Math.random() - 0.5) * 40,
        y: cy + Math.sin(angle) * spread + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        radius: tier === 1 ? 22 : tier === 2 ? 14 : 9,
        tier,
      };
    });
}

function initLinks(nodes: SimNode[]): SimLink[] {
  const ids = new Set(nodes.map((n) => n.id));
  return nodes
    .filter((n) => n.reportsTo && ids.has(n.reportsTo))
    .map((n) => ({ source: n.id, target: n.reportsTo! }));
}

function tickSimulation(
  nodes: SimNode[],
  links: SimLink[],
  w: number,
  h: number,
  alpha: number,
) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const cx = w / 2,
    cy = h / 2;

  // Centre gravity
  for (const n of nodes) {
    n.vx += (cx - n.x) * 0.002 * alpha;
    n.vy += (cy - n.y) * 0.002 * alpha;
  }

  // Repulsion between all nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i],
        b = nodes[j];
      let dx = b.x - a.x,
        dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const minDist = (a.radius + b.radius) * 2.5;
      if (dist < minDist) {
        const force = ((minDist - dist) / dist) * 0.5 * alpha;
        const fx = dx * force,
          fy = dy * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }
  }

  // Link attraction
  for (const link of links) {
    const s = nodeMap.get(link.source);
    const t = nodeMap.get(link.target);
    if (!s || !t) continue;
    let dx = t.x - s.x,
      dy = t.y - s.y;
    let dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ideal = 60 + s.radius + t.radius;
    const force = (dist - ideal) * 0.003 * alpha;
    const fx = (dx / dist) * force,
      fy = (dy / dist) * force;
    s.vx += fx;
    s.vy += fy;
    t.vx -= fx;
    t.vy -= fy;
  }

  // Tier layering — push C-suite toward centre, juniors outward
  for (const n of nodes) {
    const targetR = n.tier === 1 ? 0 : n.tier === 2 ? 160 : 300;
    const dx = n.x - cx,
      dy = n.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (dist - targetR) * 0.003 * alpha;
    n.vx -= (dx / dist) * force;
    n.vy -= (dy / dist) * force;
  }

  // Apply velocity with damping
  for (const n of nodes) {
    n.vx *= 0.6;
    n.vy *= 0.6;
    n.x += n.vx;
    n.y += n.vy;
    n.x = Math.max(n.radius, Math.min(w - n.radius, n.x));
    n.y = Math.max(n.radius, Math.min(h - n.radius, n.y));
  }
}

/* ── main component ─────────────────────────────────────────── */
export function Swarm() {
  const { selectedCompanyId } = useCompany();
  const svgRef = useRef<SVGSVGElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const animRef = useRef<number>(0);
  const [hovered, setHovered] = useState<SimNode | null>(null);
  const [selected, setSelected] = useState<SimNode | null>(null);
  const [, forceRender] = useState(0);
  const [dimensions, setDimensions] = useState({ w: 1200, h: 800 });

  // Fetch agents
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
    refetchInterval: 5000,
  });

  // Fetch live runs for activity detection
  const { data: liveRuns } = useQuery({
    queryKey: ["live-runs", selectedCompanyId],
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
    refetchInterval: 2000,
  });

  // Map agentId → most-recent live run (so clicking shows real work)
  const liveRunByAgent = useMemo(() => {
    const m = new Map<string, LiveRunForIssue>();
    if (!liveRuns) return m;
    for (const run of liveRuns) {
      const existing = m.get(run.agentId);
      if (!existing) {
        m.set(run.agentId, run);
        continue;
      }
      const runTs = new Date(run.startedAt ?? run.createdAt).getTime();
      const existingTs = new Date(existing.startedAt ?? existing.createdAt).getTime();
      if (runTs > existingTs) m.set(run.agentId, run);
    }
    return m;
  }, [liveRuns]);

  const activeAgentIds = useMemo(() => {
    return new Set(liveRunByAgent.keys());
  }, [liveRunByAgent]);

  // Resize observer
  useEffect(() => {
    const container = svgRef.current?.parentElement;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDimensions({ w: width, h: height });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Initialise nodes when agents change
  useEffect(() => {
    if (!agents?.length) return;
    const { w, h } = dimensions;
    const existing = new Map(nodesRef.current.map((n) => [n.id, n]));
    const fresh = initNodes(agents, w, h);
    for (const n of fresh) {
      const prev = existing.get(n.id);
      if (prev) {
        n.x = prev.x;
        n.y = prev.y;
        n.vx = prev.vx;
        n.vy = prev.vy;
      }
    }
    nodesRef.current = fresh;
    linksRef.current = initLinks(fresh);
  }, [agents, dimensions]);

  // Update statuses from live data
  useEffect(() => {
    for (const n of nodesRef.current) {
      n.status = activeAgentIds.has(n.id) ? "running" : (n.agent.status ?? "idle");
    }
  }, [activeAgentIds]);

  // Animation loop
  useEffect(() => {
    let alpha = 1;
    let frame = 0;
    function tick() {
      const { w, h } = dimensions;
      if (nodesRef.current.length > 0) {
        alpha = Math.max(0.01, alpha * 0.995);
        tickSimulation(nodesRef.current, linksRef.current, w, h, alpha);
        frame++;
        if (frame % 2 === 0) forceRender((f) => f + 1);
      }
      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [dimensions]);

  const nodes = nodesRef.current;
  const links = linksRef.current;
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const { w, h } = dimensions;

  // Tier-colour counts (for header legend)
  const modelCounts = useMemo(() => {
    const c: Record<string, number> = { Opus: 0, Sonnet: 0, Haiku: 0, Default: 0 };
    for (const n of nodes) c[tierLabel(n.agent)] = (c[tierLabel(n.agent)] ?? 0) + 1;
    return c;
  }, [nodes]);

  // Status counts (live)
  const statusCounts = useMemo(() => {
    let running = 0,
      idle = 0,
      error = 0;
    for (const n of nodes) {
      if (n.status === "running") running++;
      else if (n.status === "error") error++;
      else idle++;
    }
    return { running, idle, error };
  }, [nodes]);

  const selectedLiveRun = selected ? liveRunByAgent.get(selected.id) ?? null : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header — airier spacing, status-first counts */}
      <div className="flex items-start justify-between gap-6 border-b border-border px-5 py-4">
        <div className="space-y-0.5">
          <h1 className="text-lg font-semibold text-foreground">Swarm</h1>
          <p className="text-xs text-muted-foreground">
            Live network view · {nodes.length} agents ·{" "}
            <span className="font-medium text-sage-ink">{statusCounts.running} running</span>
            {statusCounts.error > 0 && (
              <>
                {" · "}
                <span className="font-medium text-rose-deep">{statusCounts.error} error</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <LegendSwatch color="var(--chart-4)" label={`Opus · ${modelCounts.Opus}`} />
          <LegendSwatch color="var(--chart-5)" label={`Sonnet · ${modelCounts.Sonnet}`} />
          <LegendSwatch color="var(--chart-1)" label={`Haiku · ${modelCounts.Haiku}`} />
          {modelCounts.Default > 0 && (
            <LegendSwatch color="var(--chart-3)" label={`Other · ${modelCounts.Default}`} />
          )}
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative flex-1 overflow-hidden bg-background">
        <svg ref={svgRef} width={w} height={h} className="h-full w-full">
          <defs>
            <filter id="swarm-glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="swarm-pulse">
              <stop offset="0%" stopColor="var(--sage-ink)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--sage-ink)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Links — brighter when either endpoint is live */}
          <g>
            {links.map((link, i) => {
              const s = nodeMap.get(link.source);
              const t = nodeMap.get(link.target);
              if (!s || !t) return null;
              const live = s.status === "running" || t.status === "running";
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={live ? "var(--sage-ink)" : "var(--border)"}
                  strokeWidth={live ? 1.5 : 1}
                  opacity={live ? 0.6 : 0.35}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map((node) => {
              const isActive = node.status === "running";
              const isHov = hovered?.id === node.id;
              const isSel = selected?.id === node.id;
              const fill = modelColor(node.agent);
              const ring = statusColor(node.status);
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered(node)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelected(node === selected ? null : node)}
                >
                  {isActive && (
                    <circle r={node.radius * 2.2} fill="url(#swarm-pulse)" opacity={0.6}>
                      <animate
                        attributeName="r"
                        from={node.radius * 1.5}
                        to={node.radius * 2.8}
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        from="0.6"
                        to="0"
                        dur="1.5s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}
                  <circle
                    r={node.radius + 2}
                    fill="none"
                    stroke={ring}
                    strokeWidth={isActive ? 2.5 : 1.5}
                    opacity={isActive ? 1 : 0.55}
                  />
                  <circle
                    r={node.radius}
                    fill={fill}
                    opacity={isHov || isSel ? 1 : 0.9}
                    filter={isActive ? "url(#swarm-glow)" : undefined}
                    stroke={isSel ? "var(--foreground)" : "none"}
                    strokeWidth={isSel ? 2 : 0}
                  />
                  {node.tier === 1 && (
                    <text
                      y={node.radius + 14}
                      textAnchor="middle"
                      fill="var(--muted-foreground)"
                      style={{ fontSize: 9, fontWeight: 500, pointerEvents: "none" }}
                    >
                      {node.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Hover tooltip */}
        {hovered && !selected && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg"
            style={{ left: hovered.x + hovered.radius + 12, top: hovered.y - 10 }}
          >
            <div className="font-semibold text-popover-foreground">{hovered.name}</div>
            <div className="text-muted-foreground">{hovered.title}</div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: modelColor(hovered.agent) }}
              />
              <span>{tierLabel(hovered.agent)}</span>
              <span className="text-muted-foreground">·</span>
              <span style={{ color: statusColor(hovered.status) }}>
                {statusLabel(hovered.status)}
              </span>
            </div>
          </div>
        )}

        {/* Selected agent panel */}
        {selected && (
          <div className="absolute bottom-5 right-5 z-20 w-80 rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-card-foreground">
                  {selected.name}
                </div>
                <div className="truncate text-xs text-muted-foreground">{selected.title}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="-m-1 p-1 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Current work — shown only when a live run exists */}
            {selectedLiveRun ? (
              <div className="mb-3 rounded-lg bg-sage-surface px-3 py-2.5 text-xs">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium text-sage-body">Current work</span>
                  <span className="flex items-center gap-1 text-sage-body/80">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage-ink opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sage-ink" />
                    </span>
                    Live
                  </span>
                </div>
                <div className="line-clamp-2 text-sage-body">
                  {selectedLiveRun.triggerDetail ?? "Running…"}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-sage-body/70">
                  <span>
                    {selectedLiveRun.invocationSource.replace(/_/g, " ")} ·{" "}
                    {selectedLiveRun.status}
                  </span>
                  <span>
                    {relativeTime(selectedLiveRun.startedAt ?? selectedLiveRun.createdAt)}
                  </span>
                </div>
                {selectedLiveRun.issueId && (
                  <a
                    href={`/issues/${selectedLiveRun.issueId}`}
                    className="mt-2 inline-block text-[11px] font-medium text-sage-ink hover:underline"
                  >
                    View task →
                  </a>
                )}
              </div>
            ) : (
              <div className="mb-3 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
                Not running right now.
              </div>
            )}

            <div className="space-y-2 text-xs">
              <Row
                label="Model tier"
                value={
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: modelColor(selected.agent) }}
                    />
                    {tierLabel(selected.agent)}
                  </span>
                }
              />
              <Row
                label="Status"
                value={
                  <span style={{ color: statusColor(selected.status) }}>
                    {statusLabel(selected.status)}
                  </span>
                }
              />
              <Row label="Role" value={selected.role} />
              {selected.reportsTo && nodeMap.get(selected.reportsTo) && (
                <Row label="Reports to" value={nodeMap.get(selected.reportsTo)!.name} />
              )}
            </div>

            <div className="mt-3 border-t border-border pt-3">
              <a
                href={`/agents/${selected.id}`}
                className="text-xs font-medium text-primary hover:underline"
              >
                View agent details →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── tiny sub-components kept local to avoid noise ──────────── */
function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-card-foreground">{value}</span>
    </div>
  );
}
