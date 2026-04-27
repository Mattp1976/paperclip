import type { Agent } from "@orqestra/shared";

/**
 * Rank agents by how well they fit a task.
 *
 * Signal, in descending weight:
 *   1. Role-label token match  — "research"/"researcher" → +10
 *   2. Capabilities substring  — per token +3
 *   3. Job title substring     — per token +3
 *   4. Name substring          — per token +1
 *   5. Active status bonus     — +5
 *   6. Paused penalty          — −50 (still sortable, not hidden)
 *   7. Tiebreak — last heartbeat (most-recent first)
 *
 * No ML. Just something reasonable you can explain in one paragraph — the
 * kind of ranking an operator would guess on a whiteboard.
 */

const TOKEN_RE = /[a-z0-9]+/g;
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "for", "of", "in", "on", "at", "to",
  "from", "with", "by", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "have", "has", "had", "this", "that", "these", "those",
  "it", "its", "as", "if", "so", "not", "no", "new", "old",
]);

export function tokenise(input: string | null | undefined): string[] {
  if (!input) return [];
  const lower = input.toLowerCase();
  const matches = lower.match(TOKEN_RE);
  if (!matches) return [];
  return matches.filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

export interface RankInput {
  /** The task whose title/description drive the ranking. */
  taskTitle: string;
  taskDescription?: string | null;
}

export interface RankedAgent {
  agent: Agent;
  score: number;
  /** One-word badge explaining why this agent ranked highly ("role match", "keyword", or "" for default). */
  reason: string;
}

export function rankAgentsForTask(agents: Agent[], task: RankInput): RankedAgent[] {
  const tokens = new Set(
    [...tokenise(task.taskTitle), ...tokenise(task.taskDescription ?? "")],
  );

  return agents
    .map<RankedAgent>((agent) => {
      let score = 0;
      let reason = "";

      // 1. Role label — strongest signal.
      const roleTokens = tokenise(agent.role);
      for (const rt of roleTokens) {
        if (tokens.has(rt)) {
          score += 10;
          if (!reason) reason = "role match";
        }
      }

      // 2. Capabilities freetext.
      if (agent.capabilities) {
        const capTokens = tokenise(agent.capabilities);
        const capSet = new Set(capTokens);
        let hits = 0;
        for (const t of tokens) if (capSet.has(t)) hits++;
        if (hits > 0) {
          score += hits * 3;
          if (!reason) reason = "skill match";
        }
      }

      // 3. Title.
      if (agent.title) {
        const titleTokens = tokenise(agent.title);
        const titleSet = new Set(titleTokens);
        let hits = 0;
        for (const t of tokens) if (titleSet.has(t)) hits++;
        if (hits > 0) {
          score += hits * 3;
          if (!reason) reason = "title match";
        }
      }

      // 4. Name.
      const nameTokens = tokenise(agent.name);
      const nameSet = new Set(nameTokens);
      let nameHits = 0;
      for (const t of tokens) if (nameSet.has(t)) nameHits++;
      if (nameHits > 0) score += nameHits * 1;

      // 5. Active bonus.
      if (agent.status === "active") score += 5;

      // 6. Paused penalty.
      if (agent.status === "paused") score -= 50;

      return { agent, score, reason };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tiebreak: most recently active.
      const aHeart = a.agent.lastHeartbeatAt ? new Date(a.agent.lastHeartbeatAt).getTime() : 0;
      const bHeart = b.agent.lastHeartbeatAt ? new Date(b.agent.lastHeartbeatAt).getTime() : 0;
      if (bHeart !== aHeart) return bHeart - aHeart;
      return a.agent.name.localeCompare(b.agent.name);
    });
}
