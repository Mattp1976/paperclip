/**
 * Hypothesis Agent
 * ================
 * Reads active signals from the scanner and uses Claude to generate
 * testable trading hypotheses with explicit entry/exit rules.
 *
 * Each hypothesis is a self-contained strategy definition:
 *   - Entry conditions (indicator thresholds, logic gates)
 *   - Exit rules (TP, SL, trailing stop, time limit)
 *   - Risk parameters (position size, max concurrent)
 *   - Applicable symbols and direction (long/short)
 *
 * The agent clusters related signals, builds context, and prompts
 * Claude to propose strategies. Duplicate/similar hypotheses are
 * detected and skipped.
 */

import Anthropic from "@anthropic-ai/sdk";
import { eq, and, gte, desc, sql, inArray } from "drizzle-orm";
import {
  tradingSignals,
  tradingHypotheses,
  tradingSnapshots,
  tradingAssets,
  tradingAgentLogs,
} from "../db/schema.js";
import type {
  EntryRules,
  ExitRules,
  RiskParams,
  StrategyType,
  HypothesisStatus,
} from "../types/index.js";

const MODEL = "claude-haiku-4-5-20251001";

interface SignalCluster {
  assetSymbol: string;
  assetId: string;
  signals: Array<{
    signalType: string;
    severity: string;
    value: string;
    context: Record<string, unknown>;
    detectedAt: Date;
  }>;
  latestSnapshot: {
    price: string;
    rsi14: string | null;
    volumeRatio: string | null;
    fundingRate: string | null;
    priceChange24h: string | null;
  } | null;
}

interface ClaudeHypothesisProposal {
  name: string;
  description: string;
  strategy_type: StrategyType;
  entry_rules: EntryRules;
  exit_rules: ExitRules;
  risk_params: RiskParams;
  confidence: number;
  reasoning: string;
}

export class HypothesisAgent {
  private anthropic: Anthropic;

  constructor(
    private db: any,
    anthropicApiKey: string
  ) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
  }

  /**
   * Main cycle: gather recent signals, cluster by asset, generate hypotheses.
   */
  async runCycle(maxActive: number = 20): Promise<void> {
    console.log("[Hypothesis] Starting hypothesis generation cycle...");

    // Check how many active hypotheses exist
    const activeCount = await this.getActiveCount();
    const slots = maxActive - activeCount;
    if (slots <= 0) {
      console.log(`[Hypothesis] Already at max capacity (${activeCount}/${maxActive}). Skipping.`);
      await this.log("info", `Skipped: at capacity (${activeCount}/${maxActive})`);
      return;
    }

    // Get recent unexpired signals (last 24h)
    const recentSignals = await this.getRecentSignals();
    if (recentSignals.length === 0) {
      console.log("[Hypothesis] No recent signals to process.");
      await this.log("info", "No recent signals found");
      return;
    }

    // Cluster signals by asset
    const clusters = await this.clusterSignals(recentSignals);
    console.log(`[Hypothesis] Found ${clusters.length} signal clusters across assets`);

    // Get existing hypothesis names to avoid duplicates
    const existingNames = await this.getExistingHypothesisNames();

    let generated = 0;
    for (const cluster of clusters) {
      if (generated >= slots) break;

      try {
        const proposals = await this.generateHypotheses(cluster, existingNames);
        for (const proposal of proposals) {
          if (generated >= slots) break;
          if (existingNames.has(proposal.name.toLowerCase())) {
            console.log(`[Hypothesis] Skipping duplicate: ${proposal.name}`);
            continue;
          }

          await this.writeHypothesis(proposal);
          existingNames.add(proposal.name.toLowerCase());
          generated++;
          console.log(`[Hypothesis] Created: ${proposal.name} (confidence: ${proposal.confidence})`);
        }
      } catch (err) {
        console.error(`[Hypothesis] Error generating for ${cluster.assetSymbol}:`, err);
        await this.log("error", `Generation failed for ${cluster.assetSymbol}`, {
          error: String(err),
        });
      }
    }

    await this.log("info", `Cycle complete: generated ${generated} hypotheses from ${clusters.length} clusters`);
    console.log(`[Hypothesis] Cycle complete: ${generated} new hypotheses`);
  }

  /**
   * Ask Claude to generate hypotheses from a cluster of signals.
   */
  private async generateHypotheses(
    cluster: SignalCluster,
    existingNames: Set<string>
  ): Promise<ClaudeHypothesisProposal[]> {
    const signalSummary = cluster.signals
      .map(
        (s) =>
          `- ${s.signalType} [${s.severity}]: value=${s.value} at ${s.detectedAt.toISOString()}`
      )
      .join("\n");

    const snapshotSummary = cluster.latestSnapshot
      ? `Price: ${cluster.latestSnapshot.price}, RSI: ${cluster.latestSnapshot.rsi14 ?? "N/A"}, ` +
        `Volume Ratio: ${cluster.latestSnapshot.volumeRatio ?? "N/A"}, ` +
        `Funding: ${cluster.latestSnapshot.fundingRate ?? "N/A"}, ` +
        `24h Change: ${cluster.latestSnapshot.priceChange24h ?? "N/A"}`
      : "No recent snapshot available";

    const existingList =
      existingNames.size > 0
        ? `\nExisting hypothesis names (avoid duplicates):\n${[...existingNames].slice(0, 20).join(", ")}`
        : "";

    const prompt = `You are a quantitative trading strategist. Analyze these market signals for ${cluster.assetSymbol} and propose 1-2 testable trading hypotheses.

## Current Signals
${signalSummary}

## Latest Market Snapshot
${snapshotSummary}
${existingList}

## Requirements
Each hypothesis must include:
1. A unique descriptive name
2. Strategy type: one of "mean_reversion", "momentum", "breakout", "funding_arb", "correlation", "sentiment"
3. Entry rules with specific indicator thresholds
4. Exit rules with take-profit, stop-loss, and time limits
5. Risk parameters
6. Confidence score (0-100) based on signal strength and market context
7. Brief reasoning

## Response Format
Return a JSON array of hypothesis objects. Each must match this structure exactly:
\`\`\`json
[
  {
    "name": "string — unique descriptive name",
    "description": "string — what the strategy does and why",
    "strategy_type": "mean_reversion|momentum|breakout|funding_arb|correlation|sentiment",
    "entry_rules": {
      "conditions": [
        { "indicator": "rsi_14", "operator": "<=", "value": 30 }
      ],
      "logic": "AND",
      "applicable_symbols": ["${cluster.assetSymbol}"],
      "direction": "long"
    },
    "exit_rules": {
      "take_profit_pct": 5.0,
      "stop_loss_pct": 2.5,
      "time_limit_hours": 48,
      "trailing_stop_pct": 1.5
    },
    "risk_params": {
      "max_position_pct": 2,
      "max_concurrent_positions": 3,
      "min_volume_24h_usd": 10000000
    },
    "confidence": 65,
    "reasoning": "string — why this hypothesis makes sense given the signals"
  }
]
\`\`\`

Only return the JSON array, no additional text.`;

    const response = await this.anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from response (handles markdown code blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("[Hypothesis] No valid JSON array in Claude response");
      return [];
    }

    try {
      const proposals: ClaudeHypothesisProposal[] = JSON.parse(jsonMatch[0]);
      return proposals.filter(
        (p) =>
          p.name &&
          p.strategy_type &&
          p.entry_rules &&
          p.exit_rules &&
          p.confidence >= 0 &&
          p.confidence <= 100
      );
    } catch {
      console.error("[Hypothesis] Failed to parse Claude response as JSON");
      return [];
    }
  }

  // ─── Database operations ──────────────────────────────────────

  private async writeHypothesis(proposal: ClaudeHypothesisProposal): Promise<void> {
    await this.db.insert(tradingHypotheses).values({
      name: proposal.name,
      description: proposal.description,
      assetClass: "crypto",
      strategyType: proposal.strategy_type,
      entryRules: proposal.entry_rules,
      exitRules: proposal.exit_rules,
      riskParams: proposal.risk_params,
      status: "draft" as HypothesisStatus,
      confidence: String(proposal.confidence),
      generation: 1,
      createdBy: "hypothesis_agent",
    });
  }

  private async getRecentSignals() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.db
      .select({
        assetId: tradingSignals.assetId,
        signalType: tradingSignals.signalType,
        severity: tradingSignals.severity,
        value: tradingSignals.value,
        context: tradingSignals.context,
        detectedAt: tradingSignals.detectedAt,
      })
      .from(tradingSignals)
      .where(
        and(
          eq(tradingSignals.isActive, true),
          gte(tradingSignals.detectedAt, oneDayAgo)
        )
      )
      .orderBy(desc(tradingSignals.detectedAt));
  }

  private async clusterSignals(signals: any[]): Promise<SignalCluster[]> {
    // Group by assetId
    const grouped = new Map<string, any[]>();
    for (const sig of signals) {
      const list = grouped.get(sig.assetId) || [];
      list.push(sig);
      grouped.set(sig.assetId, list);
    }

    const clusters: SignalCluster[] = [];
    for (const [assetId, sigs] of grouped) {
      // Get the asset symbol
      const [asset] = await this.db
        .select({ symbol: tradingAssets.symbol })
        .from(tradingAssets)
        .where(eq(tradingAssets.id, assetId))
        .limit(1);

      if (!asset) continue;

      // Get the latest snapshot for context
      const [snapshot] = await this.db
        .select({
          price: tradingSnapshots.price,
          rsi14: tradingSnapshots.rsi14,
          volumeRatio: tradingSnapshots.volumeRatio,
          fundingRate: tradingSnapshots.fundingRate,
          priceChange24h: tradingSnapshots.priceChange24h,
        })
        .from(tradingSnapshots)
        .where(eq(tradingSnapshots.assetId, assetId))
        .orderBy(desc(tradingSnapshots.timestamp))
        .limit(1);

      clusters.push({
        assetSymbol: asset.symbol,
        assetId,
        signals: sigs,
        latestSnapshot: snapshot ?? null,
      });
    }

    // Sort clusters by number of signals (most active first)
    clusters.sort((a, b) => b.signals.length - a.signals.length);
    return clusters;
  }

  private async getExistingHypothesisNames(): Promise<Set<string>> {
    const rows = await this.db
      .select({ name: tradingHypotheses.name })
      .from(tradingHypotheses)
      .where(
        inArray(tradingHypotheses.status, ["draft", "testing", "paper_trading", "live"])
      );
    return new Set(rows.map((r: { name: string }) => r.name.toLowerCase()));
  }

  async getActiveCount(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(tradingHypotheses)
      .where(
        inArray(tradingHypotheses.status, ["draft", "testing", "paper_trading", "live"])
      );
    return result[0]?.count ?? 0;
  }

  private async log(level: string, message: string, context?: Record<string, unknown>) {
    await this.db.insert(tradingAgentLogs).values({
      agentName: "hypothesis_agent",
      logLevel: level,
      message,
      context: context ?? {},
    });
  }
}
