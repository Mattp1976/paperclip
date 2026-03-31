/**
 * Paper Trader Agent v2 — Now integrated with Risk Manager
 * Every trade passes through pre-trade risk checks with proper position sizing.
 */
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  tradingHypotheses, tradingPaperTrades, tradingSnapshots,
  tradingAssets, tradingAgentLogs,
} from "../db/schema.js";
import type { EntryRules, ExitRules, RiskParams } from "../types/index.js";
import type { RiskManager } from "../services/risk-manager.js";

export class PaperTrader {
  private riskManager: RiskManager | null = null;

  constructor(private db: any, riskManager?: RiskManager) {
    this.riskManager = riskManager ?? null;
  }

  async runCycle(): Promise<void> {
    console.log("[PaperTrader] Checking positions...");
    try {
      await this.checkExits();
      await this.checkEntries();
      await this.log("info", "Cycle complete");
    } catch (err) {
      console.error("[PaperTrader] Cycle error:", err);
      await this.log("error", "Cycle failed", { error: String(err) });
    }
  }

  private async checkExits(): Promise<void> {
    const openTrades = await this.db
      .select({
        id: tradingPaperTrades.id, hypothesisId: tradingPaperTrades.hypothesisId,
        assetId: tradingPaperTrades.assetId, direction: tradingPaperTrades.direction,
        entryPrice: tradingPaperTrades.entryPrice, entryTime: tradingPaperTrades.entryTime,
        quantity: tradingPaperTrades.quantity,
      })
      .from(tradingPaperTrades)
      .where(eq(tradingPaperTrades.status, "open"));

    if (openTrades.length === 0) return;

    for (const trade of openTrades) {
      try {
        const [hyp] = await this.db
          .select({ exitRules: tradingHypotheses.exitRules })
          .from(tradingHypotheses)
          .where(eq(tradingHypotheses.id, trade.hypothesisId)).limit(1);
        if (!hyp) continue;
        const exitRules = hyp.exitRules as ExitRules;

        const [snap] = await this.db
          .select({ price: tradingSnapshots.price })
          .from(tradingSnapshots)
          .where(eq(tradingSnapshots.assetId, trade.assetId))
          .orderBy(desc(tradingSnapshots.timestamp)).limit(1);
        if (!snap) continue;

        const currentPrice = parseFloat(snap.price);
        const entryPrice = parseFloat(trade.entryPrice);
        const holdHours = (Date.now() - new Date(trade.entryTime).getTime()) / 3600000;
        const returnPct = trade.direction === "long"
          ? (currentPrice - entryPrice) / entryPrice * 100
          : (entryPrice - currentPrice) / entryPrice * 100;

        let exitReason: string | null = null;
        if (returnPct >= exitRules.take_profit_pct) exitReason = "take_profit";
        else if (returnPct <= -exitRules.stop_loss_pct) exitReason = "stop_loss";
        else if (holdHours >= exitRules.time_limit_hours) exitReason = "time_limit";

        if (exitReason) {
          const pnl = parseFloat(trade.quantity) * (currentPrice - entryPrice) *
            (trade.direction === "long" ? 1 : -1);

          await this.db.update(tradingPaperTrades).set({
            exitPrice: String(currentPrice), exitTime: new Date(),
            pnl: String(Math.round(pnl * 100) / 100),
            pnlPct: String(Math.round(returnPct * 100) / 100),
            status: "closed", exitReason,
          }).where(eq(tradingPaperTrades.id, trade.id));

          const [asset] = await this.db.select({ symbol: tradingAssets.symbol })
            .from(tradingAssets).where(eq(tradingAssets.id, trade.assetId));

          console.log(`[PaperTrader] CLOSED ${trade.direction.toUpperCase()} ${asset?.symbol ?? "?"}: P&L $${pnl.toFixed(2)} (${returnPct.toFixed(2)}%) - ${exitReason}`);
          await this.log("info", `Closed ${trade.direction} ${asset?.symbol}: $${pnl.toFixed(2)} (${exitReason})`);
        }
      } catch (err) {
        console.error("[PaperTrader] Exit check error:", err);
      }
    }
  }

  private async checkEntries(): Promise<void> {
    const hypotheses = await this.db
      .select({
        id: tradingHypotheses.id, name: tradingHypotheses.name,
        entryRules: tradingHypotheses.entryRules, exitRules: tradingHypotheses.exitRules,
        riskParams: tradingHypotheses.riskParams,
      })
      .from(tradingHypotheses)
      .where(inArray(tradingHypotheses.status, ["paper_trading", "promoted", "testing"]));

    if (hypotheses.length === 0) return;

    const openCounts = await this.db
      .select({ hypothesisId: tradingPaperTrades.hypothesisId, count: sql<number>`count(*)` })
      .from(tradingPaperTrades)
      .where(eq(tradingPaperTrades.status, "open"))
      .groupBy(tradingPaperTrades.hypothesisId);
    const openMap = new Map(openCounts.map((r: any) => [r.hypothesisId, r.count]));

    for (const hyp of hypotheses) {
      try {
        const entryRules = hyp.entryRules as EntryRules;
        const exitRules = hyp.exitRules as ExitRules;
        const riskParams = hyp.riskParams as RiskParams;
        const currentOpen = openMap.get(hyp.id) ?? 0;
        const maxPositions = riskParams.max_concurrent_positions ?? 3;
        if (currentOpen >= maxPositions) continue;

        const symbols: string[] = entryRules.applicable_symbols === "all"
          ? await this.getAllSymbols()
          : entryRules.applicable_symbols;

        for (const symbol of symbols) {
          const [asset] = await this.db.select({ id: tradingAssets.id })
            .from(tradingAssets).where(eq(tradingAssets.symbol, symbol)).limit(1);
          if (!asset) continue;

          const [existing] = await this.db.select({ id: tradingPaperTrades.id })
            .from(tradingPaperTrades)
            .where(and(
              eq(tradingPaperTrades.hypothesisId, hyp.id),
              eq(tradingPaperTrades.assetId, asset.id),
              eq(tradingPaperTrades.status, "open")
            )).limit(1);
          if (existing) continue;

          const [snap] = await this.db.select({
            price: tradingSnapshots.price, rsi14: tradingSnapshots.rsi14,
            volumeRatio: tradingSnapshots.volumeRatio, fundingRate: tradingSnapshots.fundingRate,
            priceChange1h: tradingSnapshots.priceChange1h, priceChange24h: tradingSnapshots.priceChange24h,
          }).from(tradingSnapshots)
            .where(eq(tradingSnapshots.assetId, asset.id))
            .orderBy(desc(tradingSnapshots.timestamp)).limit(1);
          if (!snap) continue;

          if (this.checkConditions(snap, entryRules)) {
            const price = parseFloat(snap.price);
            const stopLossDistance = exitRules.stop_loss_pct / 100;
            const stopLoss = entryRules.direction === 'long'
              ? price * (1 - stopLossDistance)
              : price * (1 + stopLossDistance);

            // ─── Risk Manager gate ───
            let qty: number;
            if (this.riskManager) {
              const decision = await this.riskManager.checkPreTrade({
                hypothesisId: hyp.id, symbol, direction: entryRules.direction,
                price, stopLoss, hypothesisName: hyp.name,
              });
              if (!decision.approved) {
                console.log(`[PaperTrader] BLOCKED ${symbol}: ${decision.reasons.join("; ")}`);
                continue;
              }
              qty = decision.positionSize;
            } else {
              // Fallback: simple position sizing
              const positionPct = riskParams.max_position_pct ?? 2;
              qty = (10000 * positionPct / 100) / price;
            }

            await this.db.insert(tradingPaperTrades).values({
              hypothesisId: hyp.id, assetId: asset.id,
              direction: entryRules.direction, entryPrice: String(price),
              entryTime: new Date(), quantity: String(qty), status: "open",
              metadata: { hypothesis_name: hyp.name, stop_loss: stopLoss },
            });

            console.log(`[PaperTrader] OPENED ${entryRules.direction.toUpperCase()} ${symbol} @ $${price.toFixed(2)} (qty: ${qty.toFixed(6)}) - ${hyp.name}`);
            await this.log("info", `Opened ${entryRules.direction} ${symbol} @ $${price.toFixed(2)} via ${hyp.name}`);
          }
        }
      } catch (err) {
        console.error(`[PaperTrader] Entry error for ${hyp.name}:`, err);
      }
    }
  }

  private checkConditions(snap: any, rules: EntryRules): boolean {
    const knownIndicators = new Set([
      "rsi_14", "volume_ratio", "volume_spike_ratio",
      "funding_rate", "price_change_1h", "price_change_24h",
      "price_24h_change", "close", "price",
    ]);
    const evaluable = rules.conditions.filter(c => knownIndicators.has(c.indicator));
    if (evaluable.length === 0) return false;
    const results = evaluable.map((cond) => {
      const val = this.getVal(snap, cond.indicator);
      if (val === null) return false;
      switch (cond.operator) {
        case "<=": return val <= cond.value;
        case ">=": return val >= cond.value;
        case "<": return val < cond.value;
        case ">": return val > cond.value;
        case "==": return Math.abs(val - cond.value) < 0.001;
        default: return false;
      }
    });
    return rules.logic === "AND" ? results.every(Boolean) : results.some(Boolean);
  }

  private getVal(snap: any, ind: string): number | null {
    const m: Record<string, string | null> = {
      rsi_14: snap.rsi14, volume_ratio: snap.volumeRatio,
      volume_spike_ratio: snap.volumeRatio, funding_rate: snap.fundingRate,
      price_change_1h: snap.priceChange1h, price_change_24h: snap.priceChange24h,
      price_24h_change: snap.priceChange24h, close: snap.price, price: snap.price,
    };
    const raw = m[ind];
    return raw != null ? parseFloat(raw) : null;
  }

  private async getAllSymbols(): Promise<string[]> {
    const rows = await this.db.select({ symbol: tradingAssets.symbol })
      .from(tradingAssets).where(eq(tradingAssets.isActive, true));
    return rows.map((r: any) => r.symbol);
  }

  private async log(level: string, message: string, ctx?: Record<string, unknown>) {
    await this.db.insert(tradingAgentLogs).values({
      agentName: "paper_trader", logLevel: level, message, context: ctx ?? {},
    });
  }
}
