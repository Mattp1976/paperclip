/**
 * AgentTeam — chips of every agent working on this outcome, with role
 * and step count.
 *
 * Built from the steps' assignedAgentId / recommendedAgentId. No separate
 * fetch — we already have agent names in scope.
 */
import { Users } from "lucide-react";
import type { Agent } from "@orqestra/shared";
import type { OrchestraPlanStep } from "@orqestra/shared";
import { SoftCard } from "@/components/SoftCard";

interface AgentTeamProps {
  steps: OrchestraPlanStep[];
  agents: Agent[];
}

export function AgentTeam({ steps, agents }: AgentTeamProps) {
  const stepCountByAgentId = new Map<string, number>();
  for (const step of steps) {
    const id = step.assignedAgentId ?? step.recommendedAgentId;
    if (!id) continue;
    stepCountByAgentId.set(id, (stepCountByAgentId.get(id) ?? 0) + 1);
  }

  const team = agents
    .filter((a) => stepCountByAgentId.has(a.id))
    .map((a) => ({
      ...a,
      stepCount: stepCountByAgentId.get(a.id) ?? 0,
    }))
    .sort((a, b) => b.stepCount - a.stepCount);

  if (team.length === 0) {
    return null;
  }

  return (
    <SoftCard className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">
          {team.length} agent{team.length === 1 ? "" : "s"} on this outcome
        </h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {team.map((a) => (
          <div
            key={a.id}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1"
            title={a.title ?? a.role}
          >
            <span className="text-sm font-medium text-foreground">{a.name}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {a.title || a.role}
            </span>
            <span className="text-xs text-muted-foreground">
              ·{" "}
              <span className="text-foreground font-medium">{a.stepCount}</span>{" "}
              step{a.stepCount === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
    </SoftCard>
  );
}
