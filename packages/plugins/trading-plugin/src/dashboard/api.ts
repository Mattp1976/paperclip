/**
 * Dashboard API Routes
 * ====================
 * Express-style route handlers for the trading dashboard.
 * Register these with trAIder's HTTP adapter or plugin router.
 *
 * Endpoints:
 *   GET /trading/status        — System overview
 *   GET /trading/signals       — Recent signals (last 24h)
 *   GET /trading/hypotheses    — All active hypotheses with metrics
 *   GET /trading/meta/history  — Meta-agent decision history
 *   POST /trading/config       — Update system config
 */

import { eq, and, gte, desc, sql, inArray } from "drizzle-orm";
import {
  tradingAssets,
  tradingSnapshots,
  tradingSignals,
  tradingHypotheses,
  tradingBacktestResults,
  tradingPaperTrades,
  tradingMetaDecisions,
  tradingConfig,
  tradingAgentLogs,
} from "../db/schema.js";

export function createDashboardRoutes(db: any) {
  return {
    /**
     * GET /trading/status
     * System overview with key metrics.
     */
    async getStatus() {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [assetCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(tradingAssets)
        .where(eq(tradingAssets.isActive, true));

      const [signalCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(tradingSignals)
        .where(gte(tradingSignals.detectedAt, oneDayAgo));

      const hypothesisCounts = await db
        .select({
          status: tradingHypotheses.status,
          count: sql<number>`count(*)`,
        })
        .from(tradingHypotheses)
        .where(
          inArray(tradingHypotheses.status, [
            "draft", "testing", "paper_trading", "live",
          ])
        )
        .groupBy(tradingHypotheses.status);

      const [lastScan] = await db
        .select({ ts: tradingSnapshots.timestamp })
        .from(tradingSnapshots)
        .orderBy(desc(tradingSnapshots.timestamp))
        .limit(1);

      const [lastMeta] = await db
        .select({ ts: tradingMetaDecisions.createdAt })
        .from(tradingMetaDecisions)
        .orderBy(desc(tradingMetaDecisions.createdAt))
        .limit(1);

      const [phase] = await db
        .select({ value: tradingConfig.value })
        .from(tradingConfig)
        .where(eq(tradingConfig.key, "system.phase"));

      return {
        phase: phase?.value ?? 1,
        assets: assetCount?.count ?? 0,
        signals24h: signalCount?.count ?? 0,
        hypotheses: Object.fromEntries(
          hypothesisCounts.map((h: any) => [h.status, h.count])
        ),
        lastScan: lastScan?.ts ?? null,
        lastMetaCycle: lastMeta?.ts ?? null,
      };
    },

    /**
     * GET /trading/signals
     * Recent signals with asset info.
     */
    async getSignals(hours: number = 24) {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      return db
        .select({
          id: tradingSignals.id,
          symbol: tradingAssets.symbol,
          signalType: tradingSignals.signalType,
          severity: tradingSignals.severity,
          value: tradingSignals.value,
          context: tradingSignals.context,
          detectedAt: tradingSignals.detectedAt,
        })
        .from(tradingSignals)
        .innerJoin(tradingAssets, eq(tradingSignals.assetId, tradingAssets.id))
        .where(gte(tradingSignals.detectedAt, since))
        .orderBy(desc(tradingSignals.detectedAt))
        .limit(100);
    },

    /**
     * GET /trading/hypotheses
     * All active hypotheses with their latest backtest and paper trade stats.
     */
    async getHypotheses() {
      const hypotheses = await db
        .select({
          id: tradingHypotheses.id,
          name: tradingHypotheses.name,
          description: tradingHypotheses.description,
          strategyType: tradingHypotheses.strategyType,
          status: tradingHypotheses.status,
          confidence: tradingHypotheses.confidence,
          generation: tradingHypotheses.generation,
          entryRules: tradingHypotheses.entryRules,
          exitRules: tradingHypotheses.exitRules,
          riskParams: tradingHypotheses.riskParams,
          createdAt: tradingHypotheses.createdAt,
          promotedAt: tradingHypotheses.promotedAt,
          retiredAt: tradingHypotheses.retiredAt,
          retirementReason: tradingHypotheses.retirementReason,
        })
        .from(tradingHypotheses)
        .orderBy(desc(tradingHypotheses.confidence));

      // Enrich with latest backtest for each
      const enriched = await Promise.all(
        hypotheses.map(async (h: any) => {
          const [bt] = await db
            .select({
              sharpeRatio: tradingBacktestResults.sharpeRatio,
              winRate: tradingBacktestResults.winRate,
              totalTrades: tradingBacktestResults.totalTrades,
              maxDrawdown: tradingBacktestResults.maxDrawdown,
              profitFactor: tradingBacktestResults.profitFactor,
              totalReturn: tradingBacktestResults.totalReturn,
              createdAt: tradingBacktestResults.createdAt,
            })
            .from(tradingBacktestResults)
            .where(eq(tradingBacktestResults.hypothesisId, h.id))
            .orderBy(desc(tradingBacktestResults.createdAt))
            .limit(1);

          const [ptStats] = await db
            .select({
              trades: sql<number>`count(*)`,
              avgPnl: sql<number>`avg(pnl_pct::float)`,
              totalPnl: sql<number>`sum(pnl_pct::float)`,
            })
            .from(tradingPaperTrades)
            .where(
              and(
                eq(tradingPaperTrades.hypothesisId, h.id),
                eq(tradingPaperTrades.status, "closed")
              )
            );

          return {
            ...h,
            latestBacktest: bt ?? null,
            paperTradeStats:
              ptStats?.trades > 0
                ? {
                    totalTrades: ptStats.trades,
                    avgPnlPct: ptStats.avgPnl,
                    totalPnlPct: ptStats.totalPnl,
                  }
                : null,
          };
        })
      );

      return enriched;
    },

    /**
     * GET /trading/meta/history
     * Meta-agent decision history.
     */
    async getMetaHistory(limit: number = 10) {
      return db
        .select()
        .from(tradingMetaDecisions)
        .orderBy(desc(tradingMetaDecisions.cycleNumber))
        .limit(limit);
    },

    /**
     * GET /trading/logs
     * Recent agent logs.
     */
    async getLogs(limit: number = 50) {
      return db
        .select()
        .from(tradingAgentLogs)
        .orderBy(desc(tradingAgentLogs.createdAt))
        .limit(limit);
    },
  };
}
