import { describe, expect, it } from "vitest";
import type { Agent } from "@orqestra/shared";
import { rankAgentsForTask, tokenise } from "./rankAgentsForTask";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: overrides.id ?? "a1",
    companyId: "c1",
    name: overrides.name ?? "Jane",
    urlKey: overrides.urlKey ?? "jane",
    role: overrides.role ?? "general",
    title: overrides.title ?? null,
    icon: null,
    status: overrides.status ?? "active",
    reportsTo: null,
    capabilities: overrides.capabilities ?? null,
    adapterType: "claude_local",
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: { canCreateAgents: false },
    lastHeartbeatAt: overrides.lastHeartbeatAt ?? null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("tokenise", () => {
  it("drops stop-words and short tokens", () => {
    expect(tokenise("the new CEO of research")).toEqual(["ceo", "research"]);
  });

  it("returns empty for null/empty", () => {
    expect(tokenise(null)).toEqual([]);
    expect(tokenise("")).toEqual([]);
  });
});

describe("rankAgentsForTask", () => {
  it("ranks role-label matches above name-only matches", () => {
    const researcher = makeAgent({ id: "r", name: "Otis", role: "researcher" });
    const engineer = makeAgent({ id: "e", name: "Research", role: "engineer" });
    const ranked = rankAgentsForTask([engineer, researcher], {
      taskTitle: "Prep a research memo on UK legal tech",
    });
    expect(ranked[0].agent.id).toBe("r");
    expect(ranked[0].reason).toBe("role match");
  });

  it("uses capabilities freetext when role doesn't match", () => {
    const capAgent = makeAgent({ id: "c", capabilities: "market scan, competitor research, positioning" });
    const plain = makeAgent({ id: "p" });
    const ranked = rankAgentsForTask([plain, capAgent], {
      taskTitle: "Do a competitor scan",
    });
    expect(ranked[0].agent.id).toBe("c");
    expect(ranked[0].reason).toBe("skill match");
  });

  it("penalises paused agents but still includes them", () => {
    const paused = makeAgent({ id: "p", role: "researcher", status: "paused" });
    const active = makeAgent({ id: "a", role: "general", status: "active" });
    const ranked = rankAgentsForTask([paused, active], { taskTitle: "Do research" });
    expect(ranked.map((r) => r.agent.id)).toEqual(["a", "p"]);
    expect(ranked).toHaveLength(2);
  });

  it("breaks score ties by most-recent heartbeat", () => {
    const now = Date.now();
    const older = makeAgent({ id: "old", lastHeartbeatAt: new Date(now - 10_000) });
    const newer = makeAgent({ id: "new", lastHeartbeatAt: new Date(now - 100) });
    const ranked = rankAgentsForTask([older, newer], { taskTitle: "Standup status" });
    expect(ranked[0].agent.id).toBe("new");
  });
});
