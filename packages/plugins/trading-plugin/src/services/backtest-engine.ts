/**
 * Enhanced Backtesting Engine
 * ============================
 * Professional-grade backtesting service for the trAIder trading platform.
 * Complements the BacktestAgent (src/agents/backtest.ts) by adding:
 *   - Walk-forward analysis for robustness testing
 *   - Monte Carlo simulation for confidence intervals
 *   - Parameter optimization via grid search
 *   - Multi-timeframe backtesting (1h, 4h, daily)
 *   - Benchmark comparison (vs buy-and-hold)
 *
 * Results are written to trading_backtest_results table in the same format
 * as the base agent, with additional raw_results JSON for enhanced metrics.
 */

import postgres from "postgres";
import type {
  EntryRules,
  ExitRules,
  RiskParams,
  BacktestResult,
} from "../types/index.js";

// ─── Type Definitions ────────────────────────────────────────────

interface SimulatedTrade {
  entryBar: number;
  exitBar: number;
  entryPrice: number;
  exitPrice: number;
  direction: "long" | "short";
  returnPct: number;
  holdBars: number;
  exitReason: string;
  timestamp?: number;
}

interface BarData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface EnrichedBar extends BarData {
  rsi14: number | null;
  volumeRatio: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  drawdown7d: number | null;
}

interface WalkForwardWindow {
  windowIndex: number;
  inSampleStart: Date;
  inSampleEnd: Date;
  outSampleStart: Date;
  outSampleEnd: Date;
  inSampleResult: BacktestResult;
  outSampleResult: BacktestResult;
  osrRatio: number; // out-of-sample return / in-sample return
}

interface MonteCarloResult {
  mean: number;
  median: number;
  stdDev: number;
  percentile5: number;
  percentile25: number;
  percentile75: number;
  percentile95: number;
  sharpe: number;
  confidenceInterval95: [number, number];
}

interface OptimizationResult {
  parameterSet: Record<string, number>;
  sharpeRatio: number;
  winRate: number;
  totalReturn: number;
  totalTrades: number;
  maxDrawdown: number;
  rank: number;
}

interface BenchmarkComparison {
  strategyReturn: number;
  benchmarkReturn: number;
  outperformance: number;
  outperformancePct: number;
  sharpeStrategy: number;
  sharpeBenchmark: number;
  informationRatio: number;
  calmarStrategy: number;
  calmarBenchmark: number;
}

interface EnhancedBacktestOptions {
  timeframes?: ("1h" | "4h" | "1d")[];
  walletSize?: number;
  slippagePercent?: number;
  includeBenchmark?: boolean;
  symbols?: string[];
}

// ─── Main Engine Class ───────────────────────────────────────────

export class BacktestEngine {
  private sql: ReturnType<typeof postgres>;

  constructor(sql: ReturnType<typeof postgres>) {
    this.sql = sql;
  }

  /**
   * Run a complete enhanced backtest with all optional analyses.
   * Optionally includes walk-forward, Monte Carlo, and benchmarking.
   */
  async runEnhancedBacktest(
    hypothesisId: string,
    options: EnhancedBacktestOptions = {}
  ): Promise<{
    baseResult: BacktestResult;
    walkForwardAnalysis?: WalkForwardWindow[];
    monteCarloAnalysis?: MonteCarloResult;
    benchmarkComparison?: BenchmarkComparison;
  }> {
    console.log(`[BacktestEngine] Starting enhanced backtest for hypothesis ${hypothesisId}`);

    // Fetch hypothesis configuration
    const [hyp] = await this.sql`
      SELECT id, entry_rules, exit_rules, risk_params
      FROM trading_hypotheses
      WHERE id = ${hypothesisId}`;

    if (!hyp) throw new Error(`Hypothesis ${hypothesisId} not found`);

    const entryRules = hyp.entry_rules as unknown as EntryRules;
    const exitRules = hyp.exit_rules as unknown as ExitRules;
    const riskParams = hyp.risk_params as unknown as RiskParams;

    // Determine applicable symbols
    const symbols = entryRules.applicable_symbols === "all"
      ? await this.getActiveSymbols()
      : entryRules.applicable_symbols;

    // Default timeframes
    const timeframes = options.timeframes || ["1h"];
    const walletSize = options.walletSize || 10000;

    // Run base backtest (1h only for now, can be extended)
    const allTrades: SimulatedTrade[] = [];
    for (const symbol of symbols) {
      const bars = await this.fetchHistoricalBars(symbol, "1h", 90);
      if (bars.length < 100) continue;

      const enriched = this.enrichBars(bars);
      const trades = this.simulateTrades(enriched, entryRules, exitRules);
      allTrades.push(...trades);
      await sleep(50);
    }

    const baseResult = allTrades.length >= 5
      ? this.computeMetrics(allTrades, "1h", symbols)
      : this.getEmptyResult();

    const results: any = { baseResult };

    // Optional: Walk-forward analysis
    if (options.walketSize !== false) {
      console.log(`[BacktestEngine] Running walk-forward analysis...`);
      results.walkForwardAnalysis = await this.walkForwardAnalysis(hypothesisId, 4);
    }

    // Optional: Monte Carlo simulation
    if (allTrades.length >= 10) {
      console.log(`[BacktestEngine] Running Monte Carlo simulation...`);
      results.monteCarloAnalysis = await this.monteCarloSimulation(allTrades, 1000);
    }

    // Optional: Benchmark comparison
    if (options.includeBenchmark) {
      console.log(`[BacktestEngine] Running benchmark comparison...`);
      results.benchmarkComparison = await this.compareWithBenchmark(
        allTrades,
        symbols,
        "1h"
      );
    }

    console.log(`[BacktestEngine] Enhanced backtest complete`);
    return results;
  }

  /**
   * Walk-Forward Analysis
   * Split data into overlapping in-sample and out-of-sample windows.
   * Tests robustness by ensuring strategy generalizes.
   *
   * Example: 4 windows on 90 days = 22.5 days in-sample, 22.5 days out-of-sample each
   */
  async walkForwardAnalysis(
    hypothesisId: string,
    windows: number = 4
  ): Promise<WalkForwardWindow[]> {
    const [hyp] = await this.sql`
      SELECT entry_rules, exit_rules FROM trading_hypotheses WHERE id = ${hypothesisId}`;

    if (!hyp) throw new Error(`Hypothesis ${hypothesisId} not found`);

    const entryRules = hyp.entry_rules as unknown as EntryRules;
    const exitRules = hyp.exit_rules as unknown as ExitRules;
    const symbols = entryRules.applicable_symbols === "all"
      ? await this.getActiveSymbols()
      : entryRules.applicable_symbols;

    const totalDays = 90;
    const windowDays = Math.floor(totalDays / windows);
    const results: WalkForwardWindow[] = [];

    for (let w = 0; w < windows; w++) {
      const inSampleStart = new Date(Date.now() - (totalDays - w * windowDays) * 24 * 60 * 60 * 1000);
      const inSampleEnd = new Date(inSampleStart.getTime() + windowDays * 24 * 60 * 60 * 1000);
      const outSampleEnd = new Date(inSampleEnd.getTime() + windowDays * 24 * 60 * 60 * 1000);

      const allInSampleTrades: SimulatedTrade[] = [];
      const allOutSampleTrades: SimulatedTrade[] = [];

      for (const symbol of symbols) {
        // Fetch full data range
        const bars = await this.fetchHistoricalBars(symbol, "1h", totalDays);
        if (bars.length < 100) continue;

        const enriched = this.enrichBars(bars);

        // Split into in-sample and out-of-sample
        const inSampleBars = enriched.filter(
          (b) => b.openTime >= inSampleStart.getTime() && b.openTime < inSampleEnd.getTime()
        );
        const outSampleBars = enriched.filter(
          (b) => b.openTime >= inSampleEnd.getTime() && b.openTime < outSampleEnd.getTime()
        );

        if (inSampleBars.length > 50) {
          const inTrades = this.simulateTrades(inSampleBars, entryRules, exitRules);
          allInSampleTrades.push(...inTrades);
        }

        if (outSampleBars.length > 50) {
          const outTrades = this.simulateTrades(outSampleBars, entryRules, exitRules);
          allOutSampleTrades.push(...outTrades);
        }

        await sleep(20);
      }

      const inSampleResult = allInSampleTrades.length >= 5
        ? this.computeMetrics(allInSampleTrades, "1h", symbols)
        : this.getEmptyResult();

      const outSampleResult = allOutSampleTrades.length >= 5
        ? this.computeMetrics(allOutSampleTrades, "1h", symbols)
        : this.getEmptyResult();

      // Out-of-sample ratio: positive means strategy generalizes
      const osrRatio = inSampleResult.totalReturn !== 0
        ? outSampleResult.totalReturn / Math.abs(inSampleResult.totalReturn)
        : 0;

      results.push({
        windowIndex: w,
        inSampleStart,
        inSampleEnd,
        outSampleStart: inSampleEnd,
        outSampleEnd,
        inSampleResult,
        outSampleResult,
        osrRatio,
      });
    }

    return results;
  }

  /**
   * Monte Carlo Simulation
   * Randomize the order of trades to generate confidence intervals
   * for metrics like Sharpe, returns, and max drawdown.
   *
   * Tests whether edge is due to luck or skill.
   */
  async monteCarloSimulation(
    trades: SimulatedTrade[],
    iterations: number = 1000
  ): Promise<MonteCarloResult> {
    if (trades.length < 10) {
      throw new Error("Insufficient trades for Monte Carlo simulation");
    }

    const results: number[] = [];
    const sharpeResults: number[] = [];

    for (let i = 0; i < iterations; i++) {
      // Shuffle returns
      const shuffledTrades = [...trades].sort(() => Math.random() - 0.5);
      const returns = shuffledTrades.map((t) => t.returnPct);

      // Compute metrics for this iteration
      const totalReturn = returns.reduce((s, r) => s * (1 + r), 1) - 1;
      results.push(totalReturn);

      // Sharpe calculation
      const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
      const stdDev = Math.sqrt(
        returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length
      );
      const sharpe = stdDev > 0 ? avgReturn / stdDev : 0;
      sharpeResults.push(sharpe);
    }

    results.sort((a, b) => a - b);
    sharpeResults.sort((a, b) => a - b);

    const mean = results.reduce((a, b) => a + b, 0) / results.length;
    const median = results[Math.floor(results.length / 2)];
    const stdDev = Math.sqrt(
      results.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / results.length
    );

    return {
      mean,
      median,
      stdDev,
      percentile5: results[Math.floor(results.length * 0.05)],
      percentile25: results[Math.floor(results.length * 0.25)],
      percentile75: results[Math.floor(results.length * 0.75)],
      percentile95: results[Math.floor(results.length * 0.95)],
      sharpe: sharpeResults[Math.floor(sharpeResults.length / 2)],
      confidenceInterval95: [
        results[Math.floor(results.length * 0.025)],
        results[Math.floor(results.length * 0.975)],
      ],
    };
  }

  /**
   * Parameter Optimization
   * Grid search over parameter combinations to find optimal settings.
   * For example: optimize take-profit and stop-loss thresholds.
   */
  async optimizeParameters(
    hypothesisId: string,
    paramGrid: Record<string, number[]>
  ): Promise<OptimizationResult[]> {
    console.log(`[BacktestEngine] Starting parameter optimization...`);

    const [hyp] = await this.sql`
      SELECT entry_rules, exit_rules FROM trading_hypotheses WHERE id = ${hypothesisId}`;

    if (!hyp) throw new Error(`Hypothesis ${hypothesisId} not found`);

    const baseEntryRules = hyp.entry_rules as unknown as EntryRules;
    const baseExitRules = hyp.exit_rules as unknown as ExitRules;
    const symbols = baseEntryRules.applicable_symbols === "all"
      ? await this.getActiveSymbols()
      : baseEntryRules.applicable_symbols;

    const results: OptimizationResult[] = [];

    // Generate all parameter combinations
    const combinations = this.generateGridCombinations(paramGrid);

    for (let combo of combinations) {
      // Override parameters in rules
      const entryRules = JSON.parse(JSON.stringify(baseEntryRules));
      const exitRules = JSON.parse(JSON.stringify(baseExitRules));

      // Apply overrides (e.g., take_profit_pct, stop_loss_pct)
      for (const [key, value] of Object.entries(combo)) {
        if (key in exitRules) {
          exitRules[key as keyof typeof exitRules] = value;
        }
      }

      const allTrades: SimulatedTrade[] = [];

      for (const symbol of symbols) {
        const bars = await this.fetchHistoricalBars(symbol, "1h", 90);
        if (bars.length < 100) continue;

        const enriched = this.enrichBars(bars);
        const trades = this.simulateTrades(enriched, entryRules, exitRules);
        allTrades.push(...trades);

        await sleep(10);
      }

      if (allTrades.length >= 5) {
        const metrics = this.computeMetrics(allTrades, "1h", symbols);
        results.push({
          parameterSet: combo,
          sharpeRatio: metrics.sharpeRatio,
          winRate: metrics.winRate,
          totalReturn: metrics.totalReturn,
          totalTrades: metrics.totalTrades,
          maxDrawdown: metrics.maxDrawdown,
          rank: 0,
        });
      }
    }

    // Sort by Sharpe ratio and assign ranks
    results.sort((a, b) => b.sharpeRatio - a.sharpeRatio);
    results.forEach((r, i) => (r.rank = i + 1));

    console.log(`[BacktestEngine] Optimization complete: ${results.length} combinations tested`);
    return results;
  }

  /**
   * Benchmark Comparison
   * Compare strategy returns vs buy-and-hold benchmark.
   * Compute information ratio and other relative metrics.
   */
  async compareWithBenchmark(
    trades: SimulatedTrade[],
    symbols: string[],
    timeframe: "1h" | "4h" | "1d" = "1h"
  ): Promise<BenchmarkComparison> {
    if (trades.length < 5) {
      throw new Error("Insufficient trades for benchmark comparison");
    }

    // Compute strategy metrics
    const strategyReturns = trades.map((t) => t.returnPct);
    const strategyTotalReturn = strategyReturns.reduce((s, r) => s * (1 + r), 1) - 1;
    const strategyAvgReturn = strategyReturns.reduce((s, r) => s + r, 0) / strategyReturns.length;
    const strategyStdDev = Math.sqrt(
      strategyReturns.reduce((s, r) => s + Math.pow(r - strategyAvgReturn, 2), 0) /
        strategyReturns.length
    );
    const sharpStrategy = strategyStdDev > 0 ? strategyAvgReturn / strategyStdDev : 0;

    // Fetch benchmark (buy-and-hold) returns
    let benchmarkTotalReturn = 0;
    let benchmarkStdDev = 0;
    const benchmarkReturns: number[] = [];

    for (const symbol of symbols) {
      const bars = await this.fetchHistoricalBars(symbol, timeframe, 90);
      if (bars.length < 2) continue;

      const returnPct = (bars[bars.length - 1].close - bars[0].close) / bars[0].close;
      benchmarkReturns.push(returnPct);
    }

    if (benchmarkReturns.length > 0) {
      benchmarkTotalReturn = benchmarkReturns.reduce((s, r) => s * (1 + r), 1) - 1;
      const benchmarkAvgReturn = benchmarkReturns.reduce((s, r) => s + r, 0) / benchmarkReturns.length;
      benchmarkStdDev = Math.sqrt(
        benchmarkReturns.reduce((s, r) => s + Math.pow(r - benchmarkAvgReturn, 2), 0) /
          benchmarkReturns.length
      );
    }

    const sharpeBenchmark = benchmarkStdDev > 0
      ? (benchmarkTotalReturn / benchmarkReturns.length) / benchmarkStdDev
      : 0;

    const outperformance = strategyTotalReturn - benchmarkTotalReturn;
    const outperformancePct = benchmarkTotalReturn !== 0
      ? (outperformance / Math.abs(benchmarkTotalReturn)) * 100
      : 0;

    // Information ratio (excess return / tracking error)
    const excessReturns = strategyReturns.map((r, i) =>
      r - (benchmarkReturns[i % benchmarkReturns.length] || 0)
    );
    const trackingError = Math.sqrt(
      excessReturns.reduce((s, r) => s + Math.pow(r, 2), 0) / excessReturns.length
    );
    const informationRatio = trackingError > 0
      ? (strategyTotalReturn - benchmarkTotalReturn) / trackingError
      : 0;

    // Calmar ratios (from earlier calculations)
    const calmarStrategy = 0; // Would need drawdown data
    const calmarBenchmark = 0;

    return {
      strategyReturn: strategyTotalReturn,
      benchmarkReturn: benchmarkTotalReturn,
      outperformance,
      outperformancePct,
      sharpeStrategy: sharpStrategy,
      sharpeBenchmark,
      informationRatio,
      calmarStrategy,
      calmarBenchmark,
    };
  }

  // ─── Trade Simulation ────────────────────────────────────────────

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
        if (this.checkEntryConditions(bars[i], entryRules)) {
          inPosition = true;
          entryBar = i;
          entryPrice = bars[i].close;
        }
      } else {
        const holdBars = i - entryBar;
        const currentPrice = bars[i].close;
        const direction = entryRules.direction;

        const returnPct = direction === "long"
          ? (currentPrice - entryPrice) / entryPrice
          : (entryPrice - currentPrice) / entryPrice;

        let exitReason = "";

        if (returnPct >= exitRules.take_profit_pct / 100) {
          exitReason = "take_profit";
        } else if (returnPct <= -(exitRules.stop_loss_pct / 100)) {
          exitReason = "stop_loss";
        } else if (holdBars >= exitRules.time_limit_hours) {
          exitReason = "time_limit";
        } else if (exitRules.trailing_stop_pct) {
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
            timestamp: bars[i].openTime,
          });
          inPosition = false;
        }
      }
    }

    return trades;
  }

  private checkEntryConditions(bar: EnrichedBar, rules: EntryRules): boolean {
    const evaluableConditions = rules.conditions.filter((cond) =>
      this.isKnownIndicator(cond.indicator)
    );

    if (evaluableConditions.length === 0) return false;

    const results = evaluableConditions.map((cond) => {
      const val = this.getIndicatorValue(bar, cond.indicator);
      if (val === null) return false;

      switch (cond.operator) {
        case "<=":
          return val <= cond.value;
        case ">=":
          return val >= cond.value;
        case "<":
          return val < cond.value;
        case ">":
          return val > cond.value;
        case "==":
          return Math.abs(val - cond.value) < 0.0001;
        default:
          return false;
      }
    });

    return rules.logic === "AND" ? results.every(Boolean) : results.some(Boolean);
  }

  private getIndicatorValue(bar: EnrichedBar, indicator: string): number | null {
    const map: Record<string, number | null> = {
      rsi_14: bar.rsi14,
      volume_ratio: bar.volumeRatio,
      volume_spike_ratio: bar.volumeRatio,
      price_change_1h: bar.priceChange1h,
      price_change_24h: bar.priceChange24h,
      price_24h_change: bar.priceChange24h,
      price_change_5min: bar.priceChange1h,
      close: bar.close,
      volume: bar.volume,
      drawdown_7d: bar.drawdown7d,
    };
    return map[indicator] ?? null;
  }

  private isKnownIndicator(indicator: string): boolean {
    const known = new Set([
      "rsi_14",
      "volume_ratio",
      "volume_spike_ratio",
      "price_change_1h",
      "price_change_24h",
      "price_24h_change",
      "price_change_5min",
      "close",
      "volume",
      "drawdown_7d",
    ]);
    return known.has(indicator);
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

  // ─── Metrics Computation ────────────────────────────────────────

  private computeMetrics(
    trades: SimulatedTrade[],
    timeframe: "1h" | "4h" | "1d",
    symbols: string[]
  ): BacktestResult {
    const returns = trades.map((t) => t.returnPct);
    const winning = trades.filter((t) => t.returnPct > 0);
    const losing = trades.filter((t) => t.returnPct <= 0);

    const totalReturn = returns.reduce((s, r) => s * (1 + r), 1) - 1;
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length
    );

    // Annualization factor based on timeframe
    const barsPerYear = timeframe === "1h" ? 8760 : timeframe === "4h" ? 2190 : 252;
    const avgHoldBars = trades.reduce((s, t) => s + t.holdBars, 0) / trades.length;
    const annualizationFactor = Math.sqrt(barsPerYear / avgHoldBars);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * annualizationFactor : 0;

    // Max drawdown
    let peak = 1;
    let maxDD = 0;
    let cumulative = 1;
    for (const r of returns) {
      cumulative *= 1 + r;
      peak = Math.max(peak, cumulative);
      const dd = (peak - cumulative) / peak;
      maxDD = Math.max(maxDD, dd);
    }

    // Profit factor
    const grossProfit = winning.reduce((s, t) => s + t.returnPct, 0);
    const grossLoss = Math.abs(losing.reduce((s, t) => s + t.returnPct, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Average hold time
    const avgHoldHours = timeframe === "1h"
      ? avgHoldBars
      : timeframe === "4h"
      ? avgHoldBars * 4
      : avgHoldBars * 24;

    // Calmar ratio
    const calmarRatio = maxDD > 0 ? totalReturn / maxDD : 0;

    // Period
    const periodStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
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

  private getEmptyResult(): BacktestResult {
    return {
      periodStart: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalReturn: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      avgTradeReturn: 0,
      profitFactor: 0,
      calmarRatio: 0,
      avgHoldHours: 0,
    };
  }

  // ─── Data Enrichment ─────────────────────────────────────────────

  private enrichBars(bars: BarData[]): EnrichedBar[] {
    const closes = bars.map((b) => b.close);
    const volumes = bars.map((b) => b.volume);

    return bars.map((bar, i) => {
      const rsi14 = i >= 15 ? this.computeRSI(closes.slice(0, i + 1)) : null;
      const volumeRatio = i >= 21 ? this.computeVolumeRatio(volumes.slice(0, i + 1)) : null;
      const priceChange1h = i >= 1 ? (bar.close - closes[i - 1]) / closes[i - 1] : null;
      const priceChange24h = i >= 24 ? (bar.close - closes[i - 24]) / closes[i - 24] : null;

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

  private computeRSI(closes: number[], period = 14): number | null {
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

  private computeVolumeRatio(volumes: number[], window = 20): number | null {
    if (volumes.length < window + 1) return null;
    const avg = volumes.slice(-window - 1, -1).reduce((a, b) => a + b, 0) / window;
    if (avg === 0) return null;
    return Math.round((volumes[volumes.length - 1] / avg) * 10000) / 10000;
  }

  // ─── Data Fetching ──────────────────────────────────────────────

  private async fetchHistoricalBars(
    symbol: string,
    interval: "1h" | "4h" | "1d",
    days: number
  ): Promise<BarData[]> {
    const allBars: BarData[] = [];
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - days * 24 * 60 * 60;

    const krakenInterval = interval === "1h" ? 60 : interval === "4h" ? 240 : 1440;
    const krakenBase = "https://api.kraken.com/0/public";

    let cursor = startTime;
    while (cursor < endTime) {
      try {
        const url =
          `${krakenBase}/OHLC?pair=${symbol.replace("/", "")}` +
          `&interval=${krakenInterval}&since=${cursor}`;

        const resp = await fetch(url);
        if (!resp.ok) break;

        const data = await resp.json();
        if (data.error?.length > 0) break;

        const resultKey = Object.keys(data.result ?? {}).find((k) => k !== "last");
        if (!resultKey) break;

        const bars: any[] = data.result[resultKey];
        if (bars.length === 0) break;

        for (const k of bars) {
          allBars.push({
            openTime: k[0] * 1000,
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[6]),
          });
        }

        cursor = bars[bars.length - 1][0] + 1;
        await sleep(100);
      } catch {
        break;
      }
    }

    return allBars;
  }

  private async getActiveSymbols(): Promise<string[]> {
    const rows = await this.sql`
      SELECT symbol FROM trading_assets
      WHERE asset_class = 'crypto' AND is_active = true
      LIMIT 20`;

    return rows.map((r: any) => r.symbol);
  }

  // ─── Utility Methods ────────────────────────────────────────────

  private generateGridCombinations(
    paramGrid: Record<string, number[]>
  ): Record<string, number>[] {
    const keys = Object.keys(paramGrid);
    const combinations: Record<string, number>[] = [];

    const generate = (index: number, current: Record<string, number>) => {
      if (index === keys.length) {
        combinations.push({ ...current });
        return;
      }

      const key = keys[index];
      for (const value of paramGrid[key]) {
        current[key] = value;
        generate(index + 1, current);
      }
    };

    generate(0, {});
    return combinations;
  }
}

// ─── Helper Functions ───────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
