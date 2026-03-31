/**
 * Meta-Agent
 * ==========
 * The self-improving brain of the trading system. Runs weekly
 * (Sunday 08:00 UTC) and reviews all active hypotheses.
 *
 * For each hypothesis, it:
 *   1. Gathers backtest results and paper trade performance
 *   2. Compares against system-wide benchmarks
 *   3. Uses Claude to reason about what to do
 *   4. Takes action: promote, demote, retire, adjust params, spawn variant
 *
 * The meta-agent is what makes this an ASI-inspired system —
 * it's a strategy that creates, evaluates, and evolves other strategies.
 *
 * Decision framework:
 *   - PROMOTE: Strong Sharpe + enough trades → next lifecycle stage
 *   - DEMOTE: Degrading performance → move back one stage
 *   - RETIRE: Consistently poor results → permanent stop
 *   - ADJUST_PARAMS: Borderline performance → tweak thresholds
 *   - SPAWN_VARIANT: Promising signal → create child hypothesis
 *   - HOLD: Insufficient data → wait another cycle
 */

import Anthropic from "@anthropic-ai/sdk";
import { eq, and, desc, gte, sql, inArray } from "drizzle-orm";
import {
  tradingHypotheses,
  tradingBacktestResults,
  tradingPaperTrades,
  tradingMetaDecisions,
  tradingSignals,
  tradingAgentLogs,
} from "../db/schema.js";
import type {
  MetaAction,
  MetaDecision,
  MetaAnalysis,
  EntryRules,
  ExitRules,
  RiskParams,
} from "../types/index.js";

const MODEL = "claude-haiku-4-5-20251001";

interface HypothesisWithMetrics {
  id: string;
  name: string;
  description: string;
  strategyType: string;
  status: string;
  confidence: string;
  generation: number;
  entryRules: EntryRules;
  exitRules: ExitRules;
  riskParams: RiskParams;
  createdAt: Date;
  latestBacktest: {
    sharpeRatio: string;
    winRate: string;
    totalTrades: number;
    maxDrawdown: string;
    profitFactor: string;
    totalReturn: string;
  } | null;
  paperTradeStats: {
    totalTrades: number;
    winRate: number;
    avgPnlPct: number;
    totalPnlPct: number;
  } | null;
}

export class MetaAgent {
  private anthropic: Anthropic;

  constructor(
    private db: any,
    anthropicApiKey: string
  ) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
  }

  /**
   * Main weekly review cycle.
   */
  async runCycle(): Promise<void> {
    console.log("[Meta] Starting weekly meta-agent review...");

    // Get the current cycle number
    const cycleNumber = await this.getNextCycleNumber();
    console.log(`[Meta] Cycle #${cycleNumber}`);

    // Gather all active hypotheses with their performance data
    const hypotheses = await this.gatherHypothesesWithMetrics();
    if (hypotheses.length === 0) {
      console.log("[Meta] No active hypotheses to review.");
      await this.log("info", "No active hypotheses for review");
      return;
    }

    console.log(`[Meta] Reviewing ${hypotheses.length} active hypotheses...`);

    // Get system-wide context
    const signalStats = await this.getSignalStats();
    const systemContext = this.buildSystemContext(hypotheses, signalStats);

    // Ask Claude to analyze and make decisions
    const analysis = await this.analyzeWithClaude(hypotheses, systemContext);

    // Execute decisions
    let executed = 0;
    for (const decision of analysis.decisions) {
      try {
        await this.executeDecision(decision);
        executed++;
        console.log(`[Meta] ${decision.action.toUpperCase()} → ${decision.hypothesis_id}: ${decision.reason}`);
      } catch (err) {
        console.error(`[Meta] Failed to execute decision for ${decision.hypothesis_id}:`, err);
        await this.log("error", `Decision execution failed: ${decision.hypothesis_id}`, {
          error: String(err),
          decision,
        });
      }
    }

    // Write the meta-decision record
    await this.writeCycleRecord(cycleNumber, analysis, hypotheses);

    await this.log("info", `Cycle #${cycleNumber} complete: ${executed}/${analysis.decisions.length} decisions executed`, {
      focus_areas: analysis.focus_areas,
      risk_assessment: analysis.risk_assessment,
    });

    console.log(`[Meta] Cycle #${cycleNumber} complete: ${executed} decisions executed`);
    console.log(`[Meta] System observations: ${analysis.system_observations}`);
  }

  /**
   * Use Claude to analyze all hypotheses and make decisions.
   */
  private async analyzeWithClaude(
    hypotheses: HypothesisWithMetrics[],
    systemContext: string
  ): Promise<MetaAnalysis> {
    const hypothesisSummaries = hypotheses
      .map((h) => {
        const bt = h.latestBacktest;
        const pt = h.paperTradeStats;
        return `
### ${h.name} (ID: ${h.id})
- Status: ${h.status} | Strategy: ${h.strategyType} | Gen: ${h.generation} | Confidence: ${h.confidence}
- Created: ${h.createdAt.toISOString().split("T")[0]}
- Backtest: ${bt ? `Sharpe=${bt.sharpeRatio}, WR=${bt.winRate}, Trades=${bt.totalTrades}, DD=${bt.maxDrawdown}, PF=${bt.profitFactor}, Return=${bt.totalReturn}` : "No backtest yet"}
- Paper Trades: ${pt ? `Trades=${pt.totalTrades}, WR=${(pt.winRate * 100).toFixed(1)}%, AvgPnL=${pt.avgPnlPct.toFixed(2)}%, TotalPnL=${pt.totalPnlPct.toFixed(2)}%` : "No paper trades"}
- Entry: ${JSON.stringify(h.entryRules.conditions)} [${h.entryRules.logic}] → ${h.entryRules.direction}
- Exit: TP=${h.exitRules.take_profit_pct}% SL=${h.exitRules.stop_loss_pct}% TimeLimit=${h.exitRules.time_limit_hours}h`;
      })
      .join("\n");

    const prompt = `You are the meta-agent of an ASI-inspired trading system. Your role is to review all active hypotheses and make decisions to improve the system's overall performance.

## System Context
${systemContext}

## Active Hypotheses
${hypothesisSummaries}

## Decision Framework
For EACH hypothesis, choose exactly one action:
- **promote**: Move to next lifecycle stage (draft→testing→paper_trading→live). Requires strong performance.
- **demote**: Move back one stage. Use when performance is degrading.
- **retire**: Permanently stop this hypothesis. Use for consistently poor performers.
- **adjust_params**: Modify entry/exit thresholds. Include specific new_params.
- **spawn_variant**: Create a child hypothesis with modifications. Include new_params with the changes.
- **hold**: Do nothing, wait for more data. Use when evidence is insufficient.

## Rules
1. Be conservative — only promote when evidence is strong
2. Retire aggressively — failed hypotheses waste resources
3. When spawning variants, explain what you'd change and why
4. Consider correlation between hypotheses — don't over-concentrate in one strategy type
5. Maximum 3 hypotheses in paper_trading at any time
6. For adjust_params, provide specific entry_rules, exit_rules, or risk_params modifications

## Response Format
Return a JSON object with this exact structure:
\`\`\`json
{
  "decisions": [
    {
      "hypothesis_id": "uuid",
      "action": "promote|demote|retire|adjust_params|spawn_variant|hold",
      "reason": "Brief explanation",
      "new_params": null
    }
  ],
  "system_observations": "Overall observations about system performance and market conditions",
  "focus_areas": ["area1", "area2"],
  "risk_assessment": "Current system-wide risk assessment"
}
\`\`\`

Only return the JSON object, no additional text.`;

    const response = await this.anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[Meta] No valid JSON in Claude response, using fallback");
      return {
        decisions: hypotheses.map((h) => ({
          hypothesis_id: h.id,
          action: "hold" as MetaAction,
          reason: "Meta-agent could not parse response",
        })),
        system_observations: "Analysis failed — using hold for all hypotheses",
        focus_areas: [],
        risk_assessment: "Unknown",
      };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        decisions: (parsed.decisions ?? []).map((d: any) => ({
          hypothesis_id: d.hypothesis_id,
          action: d.action as MetaAction,
          reason: d.reason ?? "",
          new_params: d.new_params ?? undefined,
        })),
        system_observations: parsed.system_observations ?? "",
        focus_areas: parsed.focus_areas ?? [],
        risk_assessment: parsed.risk_assessment ?? "",
      };
    } catch {
      console.error("[Meta] Failed to parse Claude response");
      return {
        decisions: hypotheses.map((h) => ({
          hypothesis_id: h.id,
          action: "hold" as MetaAction,
          reason: "Parse error — defaulting to hold",
        })),
        system_observations: "Parse error",
        focus_areas: [],
        risk_assessment: "Unknown",
      };
    }
  }

  /**
   * Execute a single meta-decision.
   */
  private async executeDecision(decision: MetaDecision): Promise<void> {
    switch (decision.action) {
      case "promote":
        await this.promoteHypothesis(decision.hypothesis_id);
        break;

      case "demote":
        await this.demoteHypothesis(decision.hypothesis_id);
        break;

      case "retire":
        await this.retireHypothesis(decision.hypothesis_id, decision.reason);
        break;

      case "adjust_params":
        if (decision.new_params) {
          await this.adjustParams(decision.hypothesis_id, decision.new_params);
        }
        break;

      case "spawn_variant":
        await this.spawnVariant(decision.hypothesis_id, decision.new_params ?? {});
        break;

      case "hold":
        // No action needed
        break;
    }
  }

  private async promoteHypothesis(id: string): Promise<void> {
    const [hyp] = await this.db
      .select({ status: tradingHypotheses.status })
      .from(tradingHypotheses)
      .where(eq(tradingHypotheses.id, id));

    if (!hyp) return;

    const promotionMap: Record<string, string> = {
      draft: "testing",
      testing: "paper_trading",
      paper_trading: "live",
    };

    const nextStatus = promotionMap[hyp.status];
    if (!nextStatus) return;

    await this.db
      .update(tradingHypotheses)
      .set({
        status: nextStatus,
        promotedAt: nextStatus === "paper_trading" || nextStatus === "live" ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(tradingHypotheses.id, id));
  }

  private async demoteHypothesis(id: string): Promise<void> {
    const [hyp] = await this.db
      .select({ status: tradingHypotheses.status })
      .from(tradingHypotheses)
      .where(eq(tradingHypotheses.id, id));

    if (!hyp) return;

    const demotionMap: Record<string, string> = {
      live: "paper_trading",
      paper_trading: "testing",
      testing: "draft",
    };

    const prevStatus = demotionMap[hyp.status];
    if (!prevStatus) return;

    await this.db
      .update(tradingHypotheses)
      .set({ status: prevStatus, updatedAt: new Date() })
      .where(eq(tradingHypotheses.id, id));
  }

  private async retireHypothesis(id: string, reason: string): Promise<void> {
    await this.db
      .update(tradingHypotheses)
      .set({
        status: "retired",
        retiredAt: new Date(),
        retirementReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(tradingHypotheses.id, id));
  }

  private async adjustParams(
    id: string,
    params: Record<string, unknown>
  ): Promise<void> {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (params.entry_rules) update.entryRules = params.entry_rules;
    if (params.exit_rules) update.exitRules = params.exit_rules;
    if (params.risk_params) update.riskParams = params.risk_params;

    await this.db
      .update(tradingHypotheses)
      .set(update)
      .where(eq(tradingHypotheses.id, id));
  }

  private async spawnVariant(
    parentId: string,
    modifications: Record<string, unknown>
  ): Promise<void> {
    const [parent] = await this.db
      .select()
      .from(tradingHypotheses)
      .where(eq(tradingHypotheses.id, parentId));

    if (!parent) return;

    const variantName = `${parent.name} v${(parent.generation ?? 1) + 1}`;
    const entryRules = modifications.entry_rules ?? parent.entryRules;
    const exitRules = modifications.exit_rules ?? parent.exitRules;
    const riskParams = modifications.risk_params ?? parent.riskParams;

    await this.db.insert(tradingHypotheses).values({
      name: variantName,
      description: `Variant of "${parent.name}". ${modifications.description ?? "Parameters adjusted by meta-agent."}`,
      assetClass: parent.assetClass,
      strategyType: parent.strategyType,
      entryRules,
      exitRules,
      riskParams,
      status: "draft",
      confidence: String(Math.max(0, parseFloat(parent.confidence ?? "50") - 10)),
      generation: (parent.generation ?? 1) + 1,
      parentId,
      createdBy: "meta_agent",
    });
  }

  // ─── Data gathering ───────────────────────────────────────────

  private async gatherHypothesesWithMetrics(): Promise<HypothesisWithMetrics[]> {
    const hypotheses = await this.db
      .select()
      .from(tradingHypotheses)
      .where(
        inArray(tradingHypotheses.status, ["draft", "testing", "paper_trading", "live"])
      )
      .orderBy(desc(tradingHypotheses.confidence));

    const results: HypothesisWithMetrics[] = [];

    for (const hyp of hypotheses) {
      // Get latest backtest
      const [latestBt] = await this.db
        .select({
          sharpeRatio: tradingBacktestResults.sharpeRatio,
          winRate: tradingBacktestResults.winRate,
          totalTrades: tradingBacktestResults.totalTrades,
          maxDrawdown: tradingBacktestResults.maxDrawdown,
          profitFactor: tradingBacktestResults.profitFactor,
          totalReturn: tradingBacktestResults.totalReturn,
        })
        .from(tradingBacktestResults)
        .where(eq(tradingBacktestResults.hypothesisId, hyp.id))
        .orderBy(desc(tradingBacktestResults.createdAt))
        .limit(1);

      // Get paper trade stats
      const ptRows = await this.db
        .select({
          pnlPct: tradingPaperTrades.pnlPct,
          status: tradingPaperTrades.status,
        })
        .from(tradingPaperTrades)
        .where(
          and(
            eq(tradingPaperTrades.hypothesisId, hyp.id),
            eq(tradingPaperTrades.status, "closed")
          )
        );

      let paperTradeStats = null;
      if (ptRows.length > 0) {
        const pnls = ptRows.map((r: any) => parseFloat(r.pnlPct ?? "0"));
        const wins = pnls.filter((p: number) => p > 0).length;
        paperTradeStats = {
          totalTrades: ptRows.length,
          winRate: wins / ptRows.length,
          avgPnlPct: pnls.reduce((s: number, p: number) => s + p, 0) / pnls.length,
          totalPnlPct: pnls.reduce((s: number, p: number) => s + p, 0),
        };
      }

      results.push({
        id: hyp.id,
        name: hyp.name,
        description: hyp.description,
        strategyType: hyp.strategyType,
        status: hyp.status,
        confidence: hyp.confidence,
        generation: hyp.generation ?? 1,
        entryRules: hyp.entryRules as EntryRules,
        exitRules: hyp.exitRules as ExitRules,
        riskParams: hyp.riskParams as RiskParams,
        createdAt: hyp.createdAt,
        latestBacktest: latestBt ?? null,
        paperTradeStats,
      });
    }

    return results;
  }

  private async getSignalStats(): Promise<{ total: number; byType: Record<string, number> }> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const typeRows = await this.db
      .select({
        signalType: tradingSignals.signalType,
        count: sql<number>`count(*)`,
      })
      .from(tradingSignals)
      .where(gte(tradingSignals.detectedAt, oneWeekAgo))
      .groupBy(tradingSignals.signalType);

    const byType: Record<string, number> = {};
    let total = 0;
    for (const row of typeRows) {
      byType[row.signalType] = row.count;
      total += row.count;
    }

    return { total, byType };
  }

  private buildSystemContext(
    hypotheses: HypothesisWithMetrics[],
    signalStats: { total: number; byType: Record<string, number> }
  ): string {
    const statusCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    for (const h of hypotheses) {
      statusCounts[h.status] = (statusCounts[h.status] ?? 0) + 1;
      typeCounts[h.strategyType] = (typeCounts[h.strategyType] ?? 0) + 1;
    }

    return `
## System Overview
- Total active hypotheses: ${hypotheses.length}
- By status: ${Object.entries(statusCounts).map(([k, v]) => `${k}=${v}`).join(", ")}
- By strategy type: ${Object.entries(typeCounts).map(([k, v]) => `${k}=${v}`).join(", ")}

## Signal Activity (Last 7 Days)
- Total signals: ${signalStats.total}
- By type: ${Object.entries(signalStats.byType).map(([k, v]) => `${k}=${v}`).join(", ")}

## System Rules
- Max 3 hypotheses in paper_trading at once
- Min Sharpe 1.5 to promote from testing → paper_trading
- Min 30 trades in backtest for meaningful evaluation
- Retire hypotheses older than 30 days with Sharpe < 0.5`;
  }

  // ─── Database operations ──────────────────────────────────────

  private async getNextCycleNumber(): Promise<number> {
    const result = await this.db
      .select({ max: sql<number>`coalesce(max(cycle_number), 0)` })
      .from(tradingMetaDecisions);
    return (result[0]?.max ?? 0) + 1;
  }

  async getLastCycleDate(): Promise<Date | null> {
    const result = await this.db
      .select({ date: tradingMetaDecisions.createdAt })
      .from(tradingMetaDecisions)
      .orderBy(desc(tradingMetaDecisions.createdAt))
      .limit(1);
    return result[0]?.date ?? null;
  }

  private async writeCycleRecord(
    cycleNumber: number,
    analysis: MetaAnalysis,
    hypotheses: HypothesisWithMetrics[]
  ): Promise<void> {
    const performanceSummary = hypotheses.map((h) => ({
      id: h.id,
      name: h.name,
      status: h.status,
      sharpe: h.latestBacktest?.sharpeRatio ?? null,
      paperPnl: h.paperTradeStats?.totalPnlPct ?? null,
    }));

    await this.db.insert(tradingMetaDecisions).values({
      cycleNumber,
      cycleDate: new Date().toISOString().split("T")[0],
      decisions: analysis.decisions,
      reasoning: `${analysis.system_observations}\n\nFocus areas: ${analysis.focus_areas.join(", ")}\n\nRisk: ${analysis.risk_assessment}`,
      performanceSummary,
    });
  }

  private async log(level: string, message: string, context?: Record<string, unknown>) {
    await this.db.insert(tradingAgentLogs).values({
      agentName: "meta_agent",
      logLevel: level,
      message,
      context: context ?? {},
    });
  }
}
