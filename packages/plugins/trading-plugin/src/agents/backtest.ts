/**
 * Backtest Agent
 * ==============
 * Takes hypotheses in "draft" or "testing" status and evaluates them
 * against 90 days of historical kline data from Kraken.
 *
 * For each hypothesis:
 *   1. Fetches historical candle data for applicable symbols
 *   2. Walks through bars chronologically, checking entry conditions
 *   3. Simulates trades with the hypothesis's exit rules
 *   4. Computes performance metrics (win rate, Sharpe, drawdown, etc.)
 *   5. Writes results to trading_backtest_results
 *   6. Updates hypothesis status based on performance thresholds
 *
 * A hypothesis graduates from "draft" → "testing" after its first
 * backtest, and from "testing" → "paper_trading" if it meets the
 * minimum Sharpe and trade count thresholds.
 */

import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  tradingHypotheses,
  tradingBacktestResults,
  tradingAssets,
  tradingAgentLogs,
} from "../db/schema.js";
import type {
  EntryRules,
  ExitRules,
  RiskParams,
  BacktestResult,
} from "../types/index.js";

const KRAKEN_BASE = "https://api.kraken.com/0/public";
const BACKTEST_DAYS = 90;
const MIN_SHARPE = 1.5;
const MIN_TRADES = 30;

interface SimulatedTrade {
  entryBar: number;
  exitBar: number;
  entryPrice: number;
  exitPrice: number;
  direction: "long" | "short";
  returnPct: number;
  holdBars: number;
  exitReason: string;
}

interface BarData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class BacktestAgent {
  constructor(
    private db: any,
    private krakenApiKey: string
  ) {}

  /**
   * Main cycle: find hypotheses that need backtesting and run them.
   */
  async runCycle(): Promise<void> {
    console.log("[Backtest] Starting backtest cycle...");

    const hypotheses = await this.getTestableHypotheses();
    if (hypotheses.length === 0) {
      console.log("[Backtest] No hypotheses to backtest.");
      await this.log("info", "No testable hypotheses found");
      return;
    }

    console.log(`[Backtest] Found ${hypotheses.length} hypotheses to test`);

    let tested = 0;
    let promoted = 0;
    let failed = 0;

    for (const hyp of hypotheses) {
      try {
        const result = await this.backtestHypothesis(hyp);
        if (!result) {
          console.log(`[Backtest] ${hyp.name}: insufficient data, skipping`);
          continue;
        }

        await this.writeResult(hyp.id, result);
        tested++;

        // Evaluate performance for promotion
        if (result.totalTrades >= MIN_TRADES && result.sharpeRatio >= MIN_SHARPE) {
          await this.updateStatus(hyp.id, hyp.status === "draft" ? "testing" : "paper_trading");
          promoted++;
          console.log(
            `[Backtest] ${hyp.name}: PROMOTED — Sharpe=${result.sharpeRatio.toFixed(2)}, ` +
            `WR=${(result.winRate * 100).toFixed(1)}%, Trades=${result.totalTrades}`
          );
        } else if (result.totalTrades >= MIN_TRADES && result.sharpeRatio < 0.5) {
          await this.updateStatus(hyp.id, "failed", "Backtest Sharpe < 0.5");
          failed++;
          console.log(
            `[Backtest] ${hyp.name}: FAILED — Sharpe=${result.sharpeRatio.toFixed(2)}`
          );
        } else {
          // Keep in current status for more testing
          if (hyp.status === "draft") {
            await this.updateStatus(hyp.id, "testing");
          }
          console.log(
            `[Backtest] ${hyp.name}: Sharpe=${result.sharpeRatio.toFixed(2)}, ` +
            `Trades=${result.totalTrades} — needs more data`
          );
        }

        await sleep(200); // Rate limit
      } catch (err) {
        console.error(`[Backtest] Error testing ${hyp.name}:`, err);
        await this.log("error", `Backtest failed for ${hyp.name}`, { error: String(err) });
      }
    }

    await this.log("info", `Cycle complete: ${tested} tested, ${promoted} promoted, ${failed} failed`);
    console.log(`[Backtest] Cycle complete: ${tested} tested, ${promoted} promoted, ${failed} failed`);
  }

  /**
   * Run a single hypothesis against historical data.
   */
  private async backtestHypothesis(hyp: {
    id: string;
    name: string;
    entryRules: EntryRules;
    exitRules: ExitRules;
    riskParams: RiskParams;
  }): Promise<BacktestResult | null> {
    const symbols = hyp.entryRules.applicable_symbols === "all"
      ? await this.getActiveSymbols()
      : hyp.entryRules.applicable_symbols;

    const allTrades: SimulatedTrade[] = [];

    for (const symbol of symbols) {
      const bars = await this.fetchHistoricalBars(symbol, "1h", BACKTEST_DAYS);
      if (bars.length < 100) continue;

      // Compute indicators for each bar
      const enriched = this.enrichBars(bars);

      // Simulate trades
      const trades = this.simulateTrades(enriched, hyp.entryRules, hyp.exitRules);
      allTrades.push(...trades);

      await sleep(100); // Rate limit between symbols
    }

    if (allTrades.length < 5) return null;

    return this.computeMetrics(allTrades);
  }

  /**
   * Walk through bars and simulate trades according to entry/exit rules.
   */
  private simulateTrades(
    bars: EnrichedBar[],
    entryRules: EntryRules,
    exitRules: ExitRules
  ): SimulatedTrade[] {
    const trades: SimulatedTrade[] = [];
    let inPosition = false;
    let entryBar = 0;
    let entryPrice = 0;

    for (let i = 20; i < bars.length; i++) {
      if (!inPosition) {
        // Check entry conditions
        if (this.checkEntryConditions(bars[i], entryRules)) {
          inPosition = true;
          entryBar = i;
          entryPrice = bars[i].close;
        }
      } else {
        // Check exit conditions
        const holdBars = i - entryBar;
        const currentPrice = bars[i].close;
        const direction = entryRules.direction;

        const returnPct = direction === "long"
          ? (currentPrice - entryPrice) / entryPrice
          : (entryPrice - currentPrice) / entryPrice;

        let exitReason = "";

        // Take profit
        if (returnPct >= exitRules.take_profit_pct / 100) {
          exitReason = "take_profit";
        }
        // Stop loss
        else if (returnPct <= -(exitRules.stop_loss_pct / 100)) {
          exitReason = "stop_loss";
        }
        // Time limit
        else if (holdBars >= exitRules.time_limit_hours) {
          exitReason = "time_limit";
        }
        // Trailing stop (check from high-water mark)
        else if (exitRules.trailing_stop_pct) {
          const hwm = this.getHighWaterMark(bars, entryBar, i, direction);
          const hwmReturn = direction === "long"
            ? (hwm - entryPrice) / entryPrice
            : (entryPrice - hwm) / entryPrice;
          const drawbackFromHwm = hwmReturn - returnPct;
          if (hwmReturn > 0 && drawbackFromHwm >= exitRules.trailing_stop_pct / 100) {
            exitReason = "trailing_stop";
          }
        }

        if (exitReason) {
          trades.push({
            entryBar,
            exitBar: i,
            entryPrice,
            exitPrice: currentPrice,
            direction,
            returnPct,
            holdBars,
            exitReason,
          });
          inPosition = false;
        }
      }
    }

    return trades;
  }

  /**
   * Check whether the current bar satisfies entry conditions.
   */
  private checkEntryConditions(bar: EnrichedBar, rules: EntryRules): boolean {
    const results = rules.conditions.map((cond) => {
      const val = this.getIndicatorValue(bar, cond.indicator);
      if (val === null) return false;

      switch (cond.operator) {
        case "<=": return val <= cond.value;
        case ">=": return val >= cond.value;
        case "<":  return val < cond.value;
        case ">":  return val > cond.value;
        case "==": return Math.abs(val - cond.value) < 0.0001;
        default: return false;
      }
    });

    return rules.logic === "AND"
      ? results.every(Boolean)
      : results.some(Boolean);
  }

  private getIndicatorValue(bar: EnrichedBar, indicator: string): number | null {
    const map: Record<string, number | null> = {
      rsi_14: bar.rsi14,
      volume_ratio: bar.volumeRatio,
      price_change_1h: bar.priceChange1h,
      price_change_24h: bar.priceChange24h,
      close: bar.close,
      volume: bar.volume,
      drawdown_7d: bar.drawdown7d,
    };
    return map[indicator] ?? null;
  }

  private getHighWaterMark(
    bars: EnrichedBar[],
    entryIdx: number,
    currentIdx: number,
    direction: "long" | "short"
  ): number {
    let hwm = bars[entryIdx].close;
    for (let i = entryIdx + 1; i <= currentIdx; i++) {
      if (direction === "long") {
        hwm = Math.max(hwm, bars[i].high);
      } else {
        hwm = Math.min(hwm, bars[i].low);
      }
    }
    return hwm;
  }

  /**
   * Compute aggregate performance metrics from simulated trades.
   */
  private computeMetrics(trades: SimulatedTrade[]): BacktestResult {
    const returns = trades.map((t) => t.returnPct);
    const winning = trades.filter((t) => t.returnPct > 0);
    const losing = trades.filter((t) => t.returnPct <= 0);

    const totalReturn = returns.reduce((s, r) => s * (1 + r), 1) - 1;
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length
    );

    // Annualized Sharpe (assuming hourly bars, ~8760 hours/year)
    const annualizationFactor = Math.sqrt(8760 / (trades.reduce((s, t) => s + t.holdBars, 0) / trades.length));
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * annualizationFactor : 0;

    // Max drawdown from cumulative returns
    let peak = 1;
    let maxDD = 0;
    let cumulative = 1;
    for (const r of returns) {
      cumulative *= (1 + r);
      peak = Math.max(peak, cumulative);
      const dd = (peak - cumulative) / peak;
      maxDD = Math.max(maxDD, dd);
    }

    // Profit factor
    const grossProfit = winning.reduce((s, t) => s + t.returnPct, 0);
    const grossLoss = Math.abs(losing.reduce((s, t) => s + t.returnPct, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Average hold time in hours
    const avgHoldHours = trades.reduce((s, t) => s + t.holdBars, 0) / trades.length;

    // Calmar ratio (annualized return / max drawdown)
    const calmarRatio = maxDD > 0 ? (totalReturn / maxDD) : 0;

    // Period
    const holdBarsRange = trades[trades.length - 1].exitBar - trades[0].entryBar;
    const periodStart = new Date(Date.now() - BACKTEST_DAYS * 24 * 60 * 60 * 1000);
    const periodEnd = new Date();

    return {
      periodStart,
      periodEnd,
      totalTrades: trades.length,
      winningTrades: winning.length,
      losingTrades: losing.length,
      winRate: Math.round((winning.length / trades.length) * 10000) / 10000,
      totalReturn: Math.round(totalReturn * 10000) / 10000,
      sharpeRatio: Math.round(sharpeRatio * 10000) / 10000,
      maxDrawdown: Math.round(maxDD * 10000) / 10000,
      avgTradeReturn: Math.round(avgReturn * 1000000) / 1000000,
      profitFactor: Math.round(profitFactor * 10000) / 10000,
      calmarRatio: Math.round(calmarRatio * 10000) / 10000,
      avgHoldHours: Math.round(avgHoldHours * 100) / 100,
    };
  }

  // ─── Data enrichment ──────────────────────────────────────────

  private enrichBars(bars: BarData[]): EnrichedBar[] {
    const closes = bars.map((b) => b.close);
    const volumes = bars.map((b) => b.volume);

    return bars.map((bar, i) => {
      const rsi14 = i >= 15 ? computeRSI(closes.slice(0, i + 1)) : null;
      const volumeRatio =
        i >= 21 ? computeVolumeRatio(volumes.slice(0, i + 1)) : null;
      const priceChange1h = i >= 1 ? (bar.close - closes[i - 1]) / closes[i - 1] : null;
      const priceChange24h =
        i >= 24 ? (bar.close - closes[i - 24]) / closes[i - 24] : null;

      // 7-day drawdown (168 hourly bars)
      const lookback = Math.min(i + 1, 168);
      const recentCloses = closes.slice(Math.max(0, i + 1 - lookback), i + 1);
      const high7d = Math.max(...recentCloses);
      const drawdown7d = high7d > 0 ? (bar.close - high7d) / high7d : null;

      return {
        ...bar,
        rsi14,
        volumeRatio,
        priceChange1h,
        priceChange24h,
        drawdown7d,
      };
    });
  }

  // ─── Kraken API ───────────────────────────────────────────────

  /**
   * Fetch historical OHLC bars from Kraken.
   * Kraken /OHLC returns max 720 bars per request.
   * For 90 days of hourly data (2160 bars), we page through with 'since'.
   * interval=60 for hourly.
   */
  private async fetchHistoricalBars(
    symbol: string,
    interval: string,
    days: number
  ): Promise<BarData[]> {
    const allBars: BarData[] = [];
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - days * 24 * 60 * 60;

    // Kraken interval in minutes: "1h" → 60
    const krakenInterval = interval === "1h" ? 60 : 60;

    let cursor = startTime;
    while (cursor < endTime) {
      try {
        const url =
          `${KRAKEN_BASE}/OHLC?pair=${symbol}` +
          `&interval=${krakenInterval}&since=${cursor}`;
        const resp = await fetch(url);
        if (!resp.ok) break;

        const data = await resp.json();
        if (data.error?.length > 0) break;

        // Kraken keys the result by pair name (which may differ from input)
        const resultKey = Object.keys(data.result ?? {}).find((k) => k !== "last");
        if (!resultKey) break;

        const bars: any[] = data.result[resultKey];
        if (bars.length === 0) break;

        for (const k of bars) {
          allBars.push({
            openTime: k[0] * 1000, // Convert to ms for consistency
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[6]), // Kraken: index 6 is volume
          });
        }

        // Move cursor past the last bar
        cursor = bars[bars.length - 1][0] + 1;
        await sleep(100); // Kraken rate limit
      } catch {
        break;
      }
    }

    return allBars;
  }

  private async getActiveSymbols(): Promise<string[]> {
    const rows = await this.db
      .select({ symbol: tradingAssets.symbol })
      .from(tradingAssets)
      .where(and(eq(tradingAssets.assetClass, "crypto"), eq(tradingAssets.isActive, true)));
    return rows.map((r: { symbol: string }) => r.symbol);
  }

  // ─── Database operations ──────────────────────────────────────

  private async getTestableHypotheses() {
    return this.db
      .select({
        id: tradingHypotheses.id,
        name: tradingHypotheses.name,
        status: tradingHypotheses.status,
        entryRules: tradingHypotheses.entryRules,
        exitRules: tradingHypotheses.exitRules,
        riskParams: tradingHypotheses.riskParams,
      })
      .from(tradingHypotheses)
      .where(inArray(tradingHypotheses.status, ["draft", "testing"]))
      .orderBy(desc(tradingHypotheses.confidence))
      .limit(10);
  }

  private async writeResult(hypothesisId: string, result: BacktestResult): Promise<void> {
    await this.db.insert(tradingBacktestResults).values({
      hypothesisId,
      periodStart: result.periodStart.toISOString().split("T")[0],
      periodEnd: result.periodEnd.toISOString().split("T")[0],
      totalTrades: result.totalTrades,
      winningTrades: result.winningTrades,
      losingTrades: result.losingTrades,
      winRate: String(result.winRate),
      totalReturn: String(result.totalReturn),
      sharpeRatio: String(result.sharpeRatio),
      maxDrawdown: String(result.maxDrawdown),
      avgTradeReturn: String(result.avgTradeReturn),
      profitFactor: String(result.profitFactor),
      calmarRatio: String(result.calmarRatio),
      avgHoldHours: String(result.avgHoldHours),
      rawResults: {
        trade_count: result.totalTrades,
        win_rate: result.winRate,
        sharpe: result.sharpeRatio,
      },
    });
  }

  private async updateStatus(
    hypothesisId: string,
    status: string,
    retirementReason?: string
  ): Promise<void> {
    const update: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };
    if (status === "paper_trading") {
      update.promotedAt = new Date();
    }
    if (retirementReason) {
      update.retiredAt = new Date();
      update.retirementReason = retirementReason;
    }
    await this.db
      .update(tradingHypotheses)
      .set(update)
      .where(eq(tradingHypotheses.id, hypothesisId));
  }

  private async log(level: string, message: string, context?: Record<string, unknown>) {
    await this.db.insert(tradingAgentLogs).values({
      agentName: "backtest_agent",
      logLevel: level,
      message,
      context: context ?? {},
    });
  }
}

// ─── Indicator helpers (shared with scanner) ───────────────────

interface EnrichedBar extends BarData {
  rsi14: number | null;
  volumeRatio: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  drawdown7d: number | null;
}

function computeRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const deltas = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = deltas.slice(0, period).reduce((s, d) => s + Math.max(d, 0), 0) / period;
  let avgLoss = deltas.slice(0, period).reduce((s, d) => s + Math.max(-d, 0), 0) / period;

  for (let i = period; i < deltas.length; i++) {
    avgGain = (avgGain * (period - 1) + Math.max(deltas[i], 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-deltas[i], 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

function computeVolumeRatio(volumes: number[], window = 20): number | null {
  if (volumes.length < window + 1) return null;
  const avg = volumes.slice(-window - 1, -1).reduce((a, b) => a + b, 0) / window;
  if (avg === 0) return null;
  return Math.round((volumes[volumes.length - 1] / avg) * 10000) / 10000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
