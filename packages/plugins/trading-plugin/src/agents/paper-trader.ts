/**
 * Paper Trader Agent v3 — Entry-only, exits delegated to ExitEngine
 * Sets stop_loss, take_profit, trailing_stop_pct, high_water_mark,
 * and max_hold_until on every new position at entry time.
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
    console.log("[PaperTrader] Checking for new entries...");
    try {
      await this.checkEntries();
      await this.log("info", "Cycle complete");
    } catch (err) {
      console.error("[PaperTrader] Cycle error:", err);
      await this.log("error", "Cycle failed", { error: String(err) });
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

            // ─── Calculate exit levels from hypothesis exit_rules ───
            const stopLossPct = exitRules.stop_loss_pct ?? 2;
            const takeProfitPct = exitRules.take_profit_pct ?? 4;
            const trailingStopPct = exitRules.trailing_stop_pct ?? 1.2;
            const timeLimitHours = exitRules.time_limit_hours ?? 24;

            const stopLoss = entryRules.direction === "long"
              ? price * (1 - stopLossPct / 100)
              : price * (1 + stopLossPct / 100);

            const takeProfit = entryRules.direction === "long"
              ? price * (1 + takeProfitPct / 100)
              : price * (1 - takeProfitPct / 100);

            const maxHoldUntil = new Date(Date.now() + timeLimitHours * 3600000);

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
              const positionPct = riskParams.max_position_pct ?? 2;
              qty = (10000 * positionPct / 100) / price;
            }

            // ─── Insert trade with all exit columns set ───
            await this.db.insert(tradingPaperTrades).values({
              hypothesisId: hyp.id, assetId: asset.id,
              direction: entryRules.direction, entryPrice: String(price),
              entryTime: new Date(), quantity: String(qty), status: "open",
              metadata: { hypothesis_name: hyp.name },
            });

            // Set exit columns via raw SQL (Drizzle schema may not have them yet)
            try {
              const [inserted] = await this.db
                .select({ id: tradingPaperTrades.id })
                .from(tradingPaperTrades)
                .where(and(
                  eq(tradingPaperTrades.hypothesisId, hyp.id),
                  eq(tradingPaperTrades.assetId, asset.id),
                  eq(tradingPaperTrades.status, "open")
                ))
                .orderBy(desc(tradingPaperTrades.entryTime))
                .limit(1);

              if (inserted) {
                await this.db.execute(sql\`
                  UPDATE trading_paper_trades
                  SET stop_loss = \${String(stopLoss)},
                      take_profit = \${String(takeProfit)},
                      trailing_stop_pct = \${String(trailingStopPct)},
                      high_water_mark = \${String(price)},
                      max_hold_until = \${maxHoldUntil.toISOString()}::timestamptz
                  WHERE id = \${inserted.id}
                \`);
              }
            } catch (e) {
              console.error("[PaperTrader] Failed to set exit columns:", e);
            }

            console.log(`[PaperTrader] OPENED ${entryRules.direction.toUpperCase()} ${symbol} @ $${price.toFixed(2)} (qty: ${qty.toFixed(6)}) SL: $${stopLoss.toFixed(2)} TP: $${takeProfit.toFixed(2)} — ${hyp.name}`);
            await this.log("info", \`Opened \${entryRules.direction} \${symbol} @ $\${price.toFixed(2)} SL:$\${stopLoss.toFixed(2)} TP:$\${takeProfit.toFixed(2)} via \${hyp.name}\`);
          }
        }
      } catch (err) {
        console.error(\`[PaperTrader] Entry error for \${hyp.name}:\`, err);
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
