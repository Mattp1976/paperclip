import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import type { Agent } from "@mattparrytfc/shared";

/* ── colour helpers ─────────────────────────────────────────── */
const MODEL_COLORS: Record<string, string> = {
  "claude-opus-4-6": "#f59e0b",        // amber/gold for Opus
  "claude-sonnet-4-6": "#3b82f6",      // blue for Sonnet
  "claude-haiku-4-5-20251001": "#15803d", // green for Haiku
};
const STATUS_RING: Record<string, string> = {
  idle: "#64748b",
  running: "#3b82f6",
  error: "#ef4444",
  paused: "#a855f7",
};
const TIER_LABEL: Record<string, string> = {
  "claude-opus-4-6": "Opus",
  "claude-sonnet-4-6": "Sonnet",
  "claude-haiku-4-5-20251001": "Haiku",
};
function modelColor(agent: Agent) {
  const m = (agent.adapterConfig as Record<string, unknown>)?.model as string | undefined;
  return MODEL_COLORS[m ?? ""] ?? "#94a3b8";
}
function tierLabel(agent: Agent) {
  const m = (agent.adapterConfig as Record<string, unknown>)?.model as string | undefined;
  return TIER_LABEL[m ?? ""] ?? "Default";
}
function statusRing(status: string) {
  return STATUS_RING[status] ?? "#64748b";
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
  if (n.includes("chief") || n.includes("coo") || n.includes("cso") || n.includes("chro") || n.includes("general counsel")) return 1;
  if (n.startsWith("md ") || n.startsWith("vp ") || n.includes("director") || n.includes("head of")) return 2;
  return 3;
}

/* ── force simulation (no d3 dependency — hand-rolled) ──────── */
function initNodes(agents: Agent[], w: number, h: number): SimNode[] {
  const cx = w / 2, cy = h / 2;
  return agents
    .filter(a => a.name !== "_DELETED")
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
        vx: 0, vy: 0,
        radius: tier === 1 ? 22 : tier === 2 ? 14 : 9,
        tier,
      };
    });
}

function initLinks(nodes: SimNode[]): SimLink[] {
  const ids = new Set(nodes.map(n => n.id));
  return nodes
    .filter(n => n.reportsTo && ids.has(n.reportsTo))
    .map(n => ({ source: n.id, target: n.reportsTo! }));
}

function tickSimulation(nodes: SimNode[], links: SimLink[], w: number, h: number, alpha: number) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const cx = w / 2, cy = h / 2;

  // Centre gravity
  for (const n of nodes) {
    n.vx += (cx - n.x) * 0.002 * alpha;
    n.vy += (cy - n.y) * 0.002 * alpha;
  }

  // Repulsion between all nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const minDist = (a.radius + b.radius) * 2.5;
      if (dist < minDist) {
        const force = ((minDist - dist) / dist) * 0.5 * alpha;
        const fx = dx * force, fy = dy * force;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }
  }

  // Link attraction
  for (const link of links) {
    const s = nodeMap.get(link.source);
    const t = nodeMap.get(link.target);
    if (!s || !t) continue;
    let dx = t.x - s.x, dy = t.y - s.y;
    let dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ideal = 60 + s.radius + t.radius;
    const force = (dist - ideal) * 0.003 * alpha;
    const fx = (dx / dist) * force, fy = (dy / dist) * force;
    s.vx += fx; s.vy += fy;
    t.vx -= fx; t.vy -= fy;
  }

  // Tier layering — push C-suite toward centre, juniors outward
  for (const n of nodes) {
    const targetR = n.tier === 1 ? 0 : n.tier === 2 ? 160 : 300;
    const dx = n.x - cx, dy = n.y - cy;
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
    // Keep in bounds
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

  // Build active agent set from live runs
  const activeAgentIds = useMemo(() => {
    const set = new Set<string>();
    if (liveRuns) {
      for (const run of liveRuns) {
        if ((run as any).agentId) set.add((run as any).agentId);
      }
    }
    return set;
  }, [liveRuns]);

  // Resize observer
  useEffect(() => {
    const container = svgRef.current?.parentElement;
    if (!container) return;
    const ro = new ResizeObserver(entries => {
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
    // Preserve positions if we already have nodes
    const existing = new Map(nodesRef.current.map(n => [n.id, n]));
    const fresh = initNodes(agents, w, h);
    for (const n of fresh) {
      const prev = existing.get(n.id);
      if (prev) { n.x = prev.x; n.y = prev.y; n.vx = prev.vx; n.vy = prev.vy; }
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
        if (frame % 2 === 0) forceRender(f => f + 1);
      }
      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [dimensions]);

  const nodes = nodesRef.current;
  const links = linksRef.current;
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const { w, h } = dimensions;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">Swarm</h1>
          <p className="text-xs text-muted-foreground">
            {nodes.length} agents · {activeAgentIds.size} active
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#f59e0b" }} />
            Opus ({nodes.filter(n => tierLabel(n.agent) === "Opus").length})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#3b82f6" }} />
            Sonnet ({nodes.filter(n => tierLabel(n.agent) === "Sonnet").length})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#10b981" }} />
            Haiku ({nodes.filter(n => tierLabel(n.agent) === "Haiku").length})
          </span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative flex-1 overflow-hidden bg-background">
        <svg ref={svgRef} width={w} height={h} className="h-full w-full">
          <defs>
            {/* Glow filter for active agents */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Pulse animation */}
            <radialGradient id="pulse-grad">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Links */}
          <g opacity={0.15}>
            {links.map((link, i) => {
              const s = nodeMap.get(link.source);
              const t = nodeMap.get(link.target);
              if (!s || !t) return null;
              return (
                <line
                  key={i}
                  x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke="currentColor"
                  strokeWidth={1}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map(node => {
              const isActive = node.status === "running";
              const isHov = hovered?.id === node.id;
              const isSel = selected?.id === node.id;
              const fill = modelColor(node.agent);
              const ring = statusRing(node.status);
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHovered(node)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelected(node === selected ? null : node)}
                >
                  {/* Active pulse ring */}
                  {isActive && (
                    <circle r={node.radius * 2.2} fill="url(#pulse-grad)" opacity={0.6}>
                      <animate attributeName="r" from={node.radius * 1.5} to={node.radius * 2.8} dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {/* Status ring */}
                  <circle
                    r={node.radius + 2}
                    fill="none"
                    stroke={ring}
                    strokeWidth={isActive ? 2.5 : 1.5}
                    opacity={isActive ? 1 : 0.5}
                  />

                  {/* Main circle */}
                  <circle
                    r={node.radius}
                    fill={fill}
                    opacity={isHov || isSel ? 1 : 0.85}
                    filter={isActive ? "url(#glow)" : undefined}
                    stroke={isSel ? "#fff" : "none"}
                    strokeWidth={isSel ? 2 : 0}
                  />
                  {/* Label for tier-1 nodes */}
                  {node.tier === 1 && (
                    <text
                      y={node.radius + 14}
                      textAnchor="middle"
                      className="fill-muted-foreground"
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
            <div className="font-semibold text-foreground">{hovered.name}</div>
            <div className="text-muted-foreground">{hovered.title}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: modelColor(hovered.agent) }} />
              <span>{tierLabel(hovered.agent)}</span>
              <span className="text-muted-foreground">·</span>
              <span style={{ color: statusRing(hovered.status) }}>{hovered.status}</span>
            </div>
          </div>
        )}

        {/* Selected agent panel */}
        {selected && (
          <div className="absolute bottom-4 right-4 z-20 w-72 rounded-lg border border-border bg-card p-4 shadow-xl">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">{selected.name}</div>
                <div className="text-xs text-muted-foreground">{selected.title}</div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Model tier</span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: modelColor(selected.agent) }} />
                  {tierLabel(selected.agent)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span style={{ color: statusRing(selected.status) }}>{selected.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Role</span>
                <span>{selected.role}</span>
              </div>

              {selected.reportsTo && nodeMap.get(selected.reportsTo) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reports to</span>
                  <span>{nodeMap.get(selected.reportsTo)!.name}</span>
                </div>
              )}
              <div className="pt-2">
                <a
                  href={`/agents/${selected.id}`}
                  className="text-primary hover:underline"
                >
                  View agent details →
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
