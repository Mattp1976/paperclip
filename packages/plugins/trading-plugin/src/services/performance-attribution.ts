/**
 * Performance Attribution Engine — ASI Trading System
 * ====================================================
 * Breaks down P&L by strategy, asset, time period, and exit reason.
 * Computes risk-adjusted returns (Sharpe, Sortino, max drawdown).
 * Provides equity curve data for charting.
 */

import type { Sql } from "postgres";

interface StrategyStats {
  strategy: string;
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnlPct: number;
  avgWinPct: number;
  avgLossPct: number;
  bestTradePct: number;
  worstTradePct: number;
  profitFactor: number;
  avgHoldHours: number;
  exitReasons: Record<string, number>;
}

interface AssetStats {
  symbol: string;
  totalTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnlPct: number;
  longTrades: number;
  shortTrades: number;
  longWinRate: number;
  shortWinRate: number;
}

interface RiskMetrics {
  totalReturn: number;
  totalReturnPct: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  currentDrawdown: number;
  currentDrawdownPct: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  calmarRatio: number | null;
  avgDailyReturn: number;
  dailyVolatility: number;
  peakEquity: number;
  currentEquity: number;
  startingEquity: number;
  equityDataPoints: number;
}

interface EquityPoint {
  timestamp: string;
  totalEquity: number;
  allocatedCapital: number;
  unrealisedPnl: number;
  realisedPnl: number;
  drawdownPct: number;
  openPositions: number;
  dailyReturn: number;
}

interface DailyPnl {
  date: string;
  pnl: number;
  tradesClosed: number;
  cumPnl: number;
}

interface FullAttribution {
  overview: {
    totalTrades: number;
    openTrades: number;
    closedTrades: number;
    winRate: number;
    totalPnl: number;
    avgPnlPct: number;
    profitFactor: number;
    avgHoldHours: number;
  };
  byStrategy: StrategyStats[];
  byAsset: AssetStats[];
  riskMetrics: RiskMetrics;
  equityCurve: EquityPoint[];
  dailyPnl: DailyPnl[];
  exitBreakdown: Record<string, { count: number; avgPnlPct: number }>;
}

export class PerformanceAttribution {
  constructor(private sql: Sql) {}

  /** Full attribution report */
  async getFullReport(): Promise<FullAttribution> {
    const [overview, byStrategy, byAsset, riskMetrics, equityCurve, dailyPnl, exitBreakdown] =
      await Promise.all([
        this.getOverview(),
        this.getByStrategy(),
        this.getByAsset(),
        this.getRiskMetrics(),
        this.getEquityCurve(),
        this.getDailyPnl(),
        this.getExitBreakdown(),
      ]);
    return { overview, byStrategy, byAsset, riskMetrics, equityCurve, dailyPnl, exitBreakdown };
  }

  /** High-level trade stats */
  async getOverview() {
    const rows = await this.sql`
      SELECT
        COUNT(*)::int as total_trades,
        COUNT(*) FILTER (WHERE t.status = 'open')::int as open_trades,
        COUNT(*) FILTER (WHERE t.status = 'closed')::int as closed_trades,
        COUNT(*) FILTER (WHERE t.status = 'closed' AND t.pnl > 0)::int as wins,
        COUNT(*) FILTER (WHERE t.status = 'closed' AND t.pnl <= 0)::int as losses,
        COALESCE(SUM(t.pnl) FILTER (WHERE t.status = 'closed'), 0)::numeric as total_pnl,
        COALESCE(AVG(t.pnl_pct) FILTER (WHERE t.status = 'closed'), 0)::numeric as avg_pnl_pct,
        COALESCE(SUM(t.pnl) FILTER (WHERE t.status = 'closed' AND t.pnl > 0), 0)::numeric as gross_profit,
        COALESCE(ABS(SUM(t.pnl) FILTER (WHERE t.status = 'closed' AND t.pnl < 0)), 0.01)::numeric as gross_loss,
        COALESCE(AVG(EXTRACT(EPOCH FROM (t.exit_time - t.entry_time)) / 3600) FILTER (WHERE t.status = 'closed'), 0)::numeric as avg_hold_hours
      FROM trading_paper_trades t
    `;
    const r = rows[0];
    const closed = Number(r.closed_trades) || 0;
    const wins = Number(r.wins) || 0;
    return {
      totalTrades: Number(r.total_trades),
      openTrades: Number(r.open_trades),
      closedTrades: closed,
      winRate: closed > 0 ? Math.round((wins / closed) * 10000) / 100 : 0,
      totalPnl: Math.round(Number(r.total_pnl) * 100) / 100,
      avgPnlPct: Math.round(Number(r.avg_pnl_pct) * 100) / 100,
      profitFactor: Math.round((Number(r.gross_profit) / Number(r.gross_loss)) * 100) / 100,
      avgHoldHours: Math.round(Number(r.avg_hold_hours) * 10) / 10,
    };
  }

  /** Attribution by strategy type */
  async getByStrategy(): Promise<StrategyStats[]> {
    const rows = await this.sql`
      SELECT
        COALESCE(h.strategy_type, 'unknown') as strategy,
        COUNT(*)::int as total_trades,
        COUNT(*) FILTER (WHERE t.status = 'open')::int as open_trades,
        COUNT(*) FILTER (WHERE t.status = 'closed')::int as closed_trades,
        COUNT(*) FILTER (WHERE t.status = 'closed' AND t.pnl > 0)::int as wins,
        COUNT(*) FILTER (WHERE t.status = 'closed' AND t.pnl <= 0)::int as losses,
        COALESCE(SUM(t.pnl) FILTER (WHERE t.status = 'closed'), 0)::numeric as total_pnl,
        COALESCE(AVG(t.pnl_pct) FILTER (WHERE t.status = 'closed'), 0)::numeric as avg_pnl_pct,
        COALESCE(AVG(t.pnl_pct) FILTER (WHERE t.status = 'closed' AND t.pnl > 0), 0)::numeric as avg_win_pct,
        COALESCE(AVG(t.pnl_pct) FILTER (WHERE t.status = 'closed' AND t.pnl < 0), 0)::numeric as avg_loss_pct,
        COALESCE(MAX(t.pnl_pct) FILTER (WHERE t.status = 'closed'), 0)::numeric as best_trade_pct,
        COALESCE(MIN(t.pnl_pct) FILTER (WHERE t.status = 'closed'), 0)::numeric as worst_trade_pct,
        COALESCE(SUM(t.pnl) FILTER (WHERE t.status = 'closed' AND t.pnl > 0), 0)::numeric as gross_profit,
        COALESCE(ABS(SUM(t.pnl) FILTER (WHERE t.status = 'closed' AND t.pnl < 0)), 0.01)::numeric as gross_loss,
        COALESCE(AVG(EXTRACT(EPOCH FROM (t.exit_time - t.entry_time)) / 3600) FILTER (WHERE t.status = 'closed'), 0)::numeric as avg_hold_hours
      FROM trading_paper_trades t
      LEFT JOIN trading_hypotheses h ON t.hypothesis_id = h.id
      GROUP BY h.strategy_type
      ORDER BY total_pnl DESC
    `;

    // Get exit reasons per strategy
    const exitRows = await this.sql`
      SELECT
        COALESCE(h.strategy_type, 'unknown') as strategy,
        t.exit_reason,
        COUNT(*)::int as cnt
      FROM trading_paper_trades t
      LEFT JOIN trading_hypotheses h ON t.hypothesis_id = h.id
      WHERE t.status = 'closed' AND t.exit_reason IS NOT NULL
      GROUP BY h.strategy_type, t.exit_reason
    `;
    const exitMap: Record<string, Record<string, number>> = {};
    for (const er of exitRows) {
      const s = String(er.strategy);
      if (!exitMap[s]) exitMap[s] = {};
      exitMap[s][String(er.exit_reason)] = Number(er.cnt);
    }

    return rows.map((r: any) => {
      const closed = Number(r.closed_trades) || 0;
      const wins = Number(r.wins) || 0;
      return {
        strategy: String(r.strategy),
        totalTrades: Number(r.total_trades),
        openTrades: Number(r.open_trades),
        closedTrades: closed,
        wins,
        losses: Number(r.losses),
        winRate: closed > 0 ? Math.round((wins / closed) * 10000) / 100 : 0,
        totalPnl: Math.round(Number(r.total_pnl) * 100) / 100,
        avgPnlPct: Math.round(Number(r.avg_pnl_pct) * 100) / 100,
        avgWinPct: Math.round(Number(r.avg_win_pct) * 100) / 100,
        avgLossPct: Math.round(Number(r.avg_loss_pct) * 100) / 100,
        bestTradePct: Math.round(Number(r.best_trade_pct) * 100) / 100,
        worstTradePct: Math.round(Number(r.worst_trade_pct) * 100) / 100,
        profitFactor: Math.round((Number(r.gross_profit) / Number(r.gross_loss)) * 100) / 100,
        avgHoldHours: Math.round(Number(r.avg_hold_hours) * 10) / 10,
        exitReasons: exitMap[String(r.strategy)] || {},
      };
    });
  }

  /** Attribution by asset */
  async getByAsset(): Promise<AssetStats[]> {
    const rows = await this.sql`
      SELECT
        a.symbol,
        COUNT(*)::int as total_trades,
        COUNT(*) FILTER (WHERE t.status = 'closed')::int as closed_trades,
        COUNT(*) FILTER (WHERE t.status = 'closed' AND t.pnl > 0)::int as wins,
        COUNT(*) FILTER (WHERE t.status = 'closed' AND t.pnl <= 0)::int as losses,
        COALESCE(SUM(t.pnl) FILTER (WHERE t.status = 'closed'), 0)::numeric as total_pnl,
        COALESCE(AVG(t.pnl_pct) FILTER (WHERE t.status = 'closed'), 0)::numeric as avg_pnl_pct,
        COUNT(*) FILTER (WHERE t.direction = 'long')::int as long_trades,
        COUNT(*) FILTER (WHERE t.direction = 'short')::int as short_trades,
        COUNT(*) FILTER (WHERE t.direction = 'long' AND t.status = 'closed')::int as long_closed,
        COUNT(*) FILTER (WHERE t.direction = 'long' AND t.status = 'closed' AND t.pnl > 0)::int as long_wins,
        COUNT(*) FILTER (WHERE t.direction = 'short' AND t.status = 'closed')::int as short_closed,
        COUNT(*) FILTER (WHERE t.direction = 'short' AND t.status = 'closed' AND t.pnl > 0)::int as short_wins
      FROM trading_paper_trades t
      JOIN trading_assets a ON t.asset_id = a.id
      GROUP BY a.symbol
      ORDER BY total_pnl DESC
    `;
    return rows.map((r: any) => {
      const closed = Number(r.closed_trades) || 0;
      const wins = Number(r.wins) || 0;
      const lc = Number(r.long_closed) || 0;
      const lw = Number(r.long_wins) || 0;
      const sc = Number(r.short_closed) || 0;
      const sw = Number(r.short_wins) || 0;
      return {
        symbol: String(r.symbol),
        totalTrades: Number(r.total_trades),
        closedTrades: closed,
        wins, losses: Number(r.losses),
        winRate: closed > 0 ? Math.round((wins / closed) * 10000) / 100 : 0,
        totalPnl: Math.round(Number(r.total_pnl) * 100) / 100,
        avgPnlPct: Math.round(Number(r.avg_pnl_pct) * 100) / 100,
        longTrades: Number(r.long_trades),
        shortTrades: Number(r.short_trades),
        longWinRate: lc > 0 ? Math.round((lw / lc) * 10000) / 100 : 0,
        shortWinRate: sc > 0 ? Math.round((sw / sc) * 10000) / 100 : 0,
      };
    });
  }

  /** Risk-adjusted return metrics from equity curve */
  async getRiskMetrics(): Promise<RiskMetrics> {
    const rows = await this.sql`
      SELECT
        timestamp, total_equity, allocated_capital,
        unrealised_pnl, realised_pnl, drawdown, drawdown_pct,
        peak_equity, daily_return, open_positions
      FROM trading_portfolio_equity
      ORDER BY timestamp ASC
    `;

    if (rows.length < 2) {
      return {
        totalReturn: 0, totalReturnPct: 0,
        maxDrawdown: 0, maxDrawdownPct: 0,
        currentDrawdown: 0, currentDrawdownPct: 0,
        sharpeRatio: null, sortinoRatio: null, calmarRatio: null,
        avgDailyReturn: 0, dailyVolatility: 0,
        peakEquity: 0, currentEquity: 0, startingEquity: 0,
        equityDataPoints: rows.length,
      };
    }

    const first = rows[0];
    const last = rows[rows.length - 1];
    const startEq = Number(first.total_equity);
    const curEq = Number(last.total_equity);
    const peakEq = Math.max(...rows.map((r: any) => Number(r.peak_equity || r.total_equity)));

    // Compute daily returns (sample every ~24h)
    const dailyReturns: number[] = [];
    let prevEq = startEq;
    let prevTs = new Date(String(first.timestamp)).getTime();
    for (let i = 1; i < rows.length; i++) {
      const ts = new Date(String(rows[i].timestamp)).getTime();
      const eq = Number(rows[i].total_equity);
      // Bucket by ~4h intervals for finer granularity (we snapshot every 5 min)
      if (ts - prevTs >= 4 * 3600 * 1000 && prevEq > 0) {
        dailyReturns.push((eq - prevEq) / prevEq);
        prevEq = eq;
        prevTs = ts;
      }
    }

    const avgRet = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
    const variance = dailyReturns.length > 1
      ? dailyReturns.reduce((acc, r) => acc + Math.pow(r - avgRet, 2), 0) / (dailyReturns.length - 1)
      : 0;
    const vol = Math.sqrt(variance);

    // Downside deviation for Sortino
    const downsideReturns = dailyReturns.filter(r => r < 0);
    const downsideVar = downsideReturns.length > 1
      ? downsideReturns.reduce((acc, r) => acc + r * r, 0) / (downsideReturns.length - 1)
      : 0;
    const downsideDev = Math.sqrt(downsideVar);

    // Annualise (6 periods per day at 4h intervals × 365)
    const periodsPerYear = 6 * 365;
    const annReturn = avgRet * periodsPerYear;
    const annVol = vol * Math.sqrt(periodsPerYear);
    const annDownside = downsideDev * Math.sqrt(periodsPerYear);

    const maxDD = Math.max(...rows.map((r: any) => Number(r.drawdown || 0)));
    const maxDDPct = Math.max(...rows.map((r: any) => Math.abs(Number(r.drawdown_pct || 0))));
    const curDD = Number(last.drawdown || 0);
    const curDDPct = Math.abs(Number(last.drawdown_pct || 0));

    return {
      totalReturn: Math.round((curEq - startEq) * 100) / 100,
      totalReturnPct: startEq > 0 ? Math.round(((curEq - startEq) / startEq) * 10000) / 100 : 0,
      maxDrawdown: Math.round(maxDD * 100) / 100,
      maxDrawdownPct: Math.round(maxDDPct * 100) / 100,
      currentDrawdown: Math.round(curDD * 100) / 100,
      currentDrawdownPct: Math.round(curDDPct * 100) / 100,
      sharpeRatio: annVol > 0 ? Math.round((annReturn / annVol) * 100) / 100 : null,
      sortinoRatio: annDownside > 0 ? Math.round((annReturn / annDownside) * 100) / 100 : null,
      calmarRatio: maxDDPct > 0 ? Math.round((annReturn / (maxDDPct / 100)) * 100) / 100 : null,
      avgDailyReturn: Math.round(avgRet * 10000) / 100,
      dailyVolatility: Math.round(vol * 10000) / 100,
      peakEquity: Math.round(peakEq * 100) / 100,
      currentEquity: Math.round(curEq * 100) / 100,
      startingEquity: Math.round(startEq * 100) / 100,
      equityDataPoints: rows.length,
    };
  }

  /** Equity curve for charting */
  async getEquityCurve(limit: number = 500): Promise<EquityPoint[]> {
    const rows = await this.sql`
      SELECT
        timestamp, total_equity, allocated_capital,
        unrealised_pnl, realised_pnl, drawdown_pct,
        open_positions, daily_return
      FROM trading_portfolio_equity
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;
    return rows.reverse().map((r: any) => ({
      timestamp: String(r.timestamp),
      totalEquity: Math.round(Number(r.total_equity) * 100) / 100,
      allocatedCapital: Math.round(Number(r.allocated_capital) * 100) / 100,
      unrealisedPnl: Math.round(Number(r.unrealised_pnl) * 100) / 100,
      realisedPnl: Math.round(Number(r.realised_pnl) * 100) / 100,
      drawdownPct: Math.round(Number(r.drawdown_pct || 0) * 100) / 100,
      openPositions: Number(r.open_positions),
      dailyReturn: Math.round(Number(r.daily_return || 0) * 100) / 100,
    }));
  }

  /** P&L by day */
  async getDailyPnl(): Promise<DailyPnl[]> {
    const rows = await this.sql`
      SELECT
        DATE(exit_time) as trade_date,
        COALESCE(SUM(pnl), 0)::numeric as daily_pnl,
        COUNT(*)::int as trades_closed
      FROM trading_paper_trades
      WHERE status = 'closed' AND exit_time IS NOT NULL
      GROUP BY DATE(exit_time)
      ORDER BY trade_date ASC
    `;
    let cumPnl = 0;
    return rows.map((r: any) => {
      const pnl = Math.round(Number(r.daily_pnl) * 100) / 100;
      cumPnl += pnl;
      return {
        date: String(r.trade_date),
        pnl,
        tradesClosed: Number(r.trades_closed),
        cumPnl: Math.round(cumPnl * 100) / 100,
      };
    });
  }

  /** Exit reason breakdown with avg P&L per reason */
  async getExitBreakdown(): Promise<Record<string, { count: number; avgPnlPct: number }>> {
    const rows = await this.sql`
      SELECT
        COALESCE(exit_reason, 'unknown') as reason,
        COUNT(*)::int as cnt,
        COALESCE(AVG(pnl_pct), 0)::numeric as avg_pnl_pct
      FROM trading_paper_trades
      WHERE status = 'closed'
      GROUP BY exit_reason
      ORDER BY cnt DESC
    `;
    const result: Record<string, { count: number; avgPnlPct: number }> = {};
    for (const r of rows) {
      result[String(r.reason)] = {
        count: Number(r.cnt),
        avgPnlPct: Math.round(Number(r.avg_pnl_pct) * 100) / 100,
      };
    }
    return result;
  }

  /** Hypothesis-level detail for a specific strategy */
  async getHypothesisDetail(strategyType: string) {
    const rows = await this.sql`
      SELECT
        h.id, h.name, h.strategy_type, h.confidence, h.status as hyp_status,
        COUNT(t.id)::int as trades,
        COUNT(*) FILTER (WHERE t.status = 'closed')::int as closed,
        COUNT(*) FILTER (WHERE t.status = 'closed' AND t.pnl > 0)::int as wins,
        COALESCE(SUM(t.pnl) FILTER (WHERE t.status = 'closed'), 0)::numeric as total_pnl,
        COALESCE(AVG(t.pnl_pct) FILTER (WHERE t.status = 'closed'), 0)::numeric as avg_pnl_pct
      FROM trading_hypotheses h
      LEFT JOIN trading_paper_trades t ON t.hypothesis_id = h.id
      WHERE h.strategy_type = ${strategyType}
      GROUP BY h.id, h.name, h.strategy_type, h.confidence, h.status
      ORDER BY total_pnl DESC
    `;
    return rows.map((r: any) => ({
      id: String(r.id),
      name: String(r.name),
      strategy: String(r.strategy_type),
      confidence: Number(r.confidence),
      status: String(r.hyp_status),
      trades: Number(r.trades),
      closed: Number(r.closed),
      wins: Number(r.wins),
      winRate: Number(r.closed) > 0 ? Math.round((Number(r.wins) / Number(r.closed)) * 10000) / 100 : 0,
      totalPnl: Math.round(Number(r.total_pnl) * 100) / 100,
      avgPnlPct: Math.round(Number(r.avg_pnl_pct) * 100) / 100,
    }));
  }
}
