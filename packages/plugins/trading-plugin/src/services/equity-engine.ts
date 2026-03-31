/**
 * Equity Engine — Portfolio equity tracking, drawdown, returns
 * Takes periodic snapshots to build equity curve time series.
 */
import postgres from "postgres";

export class EquityEngine {
  private sql: ReturnType<typeof postgres>;
  constructor(sql: ReturnType<typeof postgres>) { this.sql = sql; }

  async takeSnapshot(): Promise<Record<string, any>> {
    const [config] = await this.sql`SELECT * FROM trading_portfolio_config LIMIT 1`;
    const totalCapital = parseFloat(config.total_capital);

    // Realised P&L
    const [realised] = await this.sql`
      SELECT COALESCE(SUM(pnl::numeric), 0) AS pnl FROM trading_paper_trades WHERE status = 'closed'`;

    // Unrealised P&L
    const [unrealised] = await this.sql`
      SELECT COALESCE(SUM(
        CASE WHEN pt.direction = 'long'
          THEN (ts.price::numeric - pt.entry_price::numeric) * pt.quantity::numeric
          ELSE (pt.entry_price::numeric - ts.price::numeric) * pt.quantity::numeric
        END), 0) AS pnl
      FROM trading_paper_trades pt
      JOIN trading_assets ta ON ta.id = pt.asset_id
      JOIN LATERAL (
        SELECT price FROM trading_snapshots WHERE asset_id = pt.asset_id
        ORDER BY timestamp DESC LIMIT 1
      ) ts ON true
      WHERE pt.status = 'open'`;

    // Exposure
    const [exposure] = await this.sql`
      SELECT COALESCE(SUM(
        (SELECT ts.price::numeric FROM trading_snapshots ts
         WHERE ts.asset_id = pt.asset_id ORDER BY ts.timestamp DESC LIMIT 1)
        * pt.quantity::numeric
      ), 0) AS total
      FROM trading_paper_trades pt WHERE pt.status = 'open'`;

    const [openCount] = await this.sql`
      SELECT COUNT(*)::int AS c FROM trading_paper_trades WHERE status = 'open'`;

    // Allocated capital
    const [alloc] = await this.sql`
      SELECT COALESCE(SUM(allocated_capital::numeric), 0) AS total
      FROM trading_strategy_allocations WHERE status = 'active'`;

    const realisedPnl = parseFloat(realised.pnl);
    const unrealisedPnl = parseFloat(unrealised.pnl);
    const totalEquity = totalCapital + realisedPnl + unrealisedPnl;
    const totalExposure = parseFloat(exposure.total);
    const allocatedCapital = parseFloat(alloc.total);

    // Get peak
    const [peakRow] = await this.sql`
      SELECT COALESCE(MAX(total_equity::numeric), 0) AS peak FROM trading_portfolio_equity`;
    const peakEquity = Math.max(parseFloat(peakRow.peak), totalEquity);
    const drawdown = peakEquity > 0 ? peakEquity - totalEquity : 0;
    const drawdownPct = peakEquity > 0 ? drawdown / peakEquity : 0;

    // Daily return
    const [prevSnap] = await this.sql`
      SELECT total_equity FROM trading_portfolio_equity
      WHERE timestamp < NOW() - INTERVAL '23 hours'
      ORDER BY timestamp DESC LIMIT 1`;
    const prevEquity = prevSnap ? parseFloat(prevSnap.total_equity) : totalCapital;
    const dailyReturn = prevEquity > 0 ? ((totalEquity - prevEquity) / prevEquity) * 100 : 0;

    // Insert snapshot
    await this.sql`INSERT INTO trading_portfolio_equity
      (total_equity, allocated_capital, available_capital,
       unrealised_pnl, realised_pnl, total_exposure, exposure_pct,
       drawdown, drawdown_pct, peak_equity, open_positions, daily_return)
      VALUES (
        ${totalEquity}, ${allocatedCapital}, ${totalCapital - allocatedCapital},
        ${unrealisedPnl}, ${realisedPnl}, ${totalExposure},
        ${totalCapital > 0 ? totalExposure / totalCapital : 0},
        ${drawdown}, ${drawdownPct}, ${peakEquity},
        ${openCount.c}, ${dailyReturn}
      )`;

    return {
      totalEquity, allocatedCapital, availableCapital: totalCapital - allocatedCapital,
      unrealisedPnl, realisedPnl, totalExposure,
      exposurePct: totalCapital > 0 ? (totalExposure / totalCapital) * 100 : 0,
      drawdown, drawdownPct: drawdownPct * 100, peakEquity,
      openPositions: openCount.c, dailyReturn,
    };
  }

  async getEquityCurve(hours: number = 168): Promise<any[]> {
    return this.sql`
      SELECT timestamp, total_equity, drawdown_pct, exposure_pct,
        unrealised_pnl, realised_pnl, open_positions, daily_return
      FROM trading_portfolio_equity
      WHERE timestamp > NOW() - make_interval(hours => ${hours})
      ORDER BY timestamp ASC`;
  }

  async getDrawdownSeries(hours: number = 168): Promise<any[]> {
    return this.sql`
      SELECT timestamp, drawdown, drawdown_pct, peak_equity, total_equity
      FROM trading_portfolio_equity
      WHERE timestamp > NOW() - make_interval(hours => ${hours})
      ORDER BY timestamp ASC`;
  }

  async getReturns(): Promise<Record<string, any>> {
    const [config] = await this.sql`SELECT total_capital FROM trading_portfolio_config LIMIT 1`;
    const capital = parseFloat(config.total_capital);

    const [daily] = await this.sql`
      SELECT COALESCE(SUM(pnl::numeric), 0) AS pnl
      FROM trading_paper_trades WHERE status='closed' AND exit_time > NOW() - INTERVAL '24 hours'`;
    const [weekly] = await this.sql`
      SELECT COALESCE(SUM(pnl::numeric), 0) AS pnl
      FROM trading_paper_trades WHERE status='closed' AND exit_time > NOW() - INTERVAL '7 days'`;
    const [monthly] = await this.sql`
      SELECT COALESCE(SUM(pnl::numeric), 0) AS pnl
      FROM trading_paper_trades WHERE status='closed' AND exit_time > NOW() - INTERVAL '30 days'`;
    const [total] = await this.sql`
      SELECT COALESCE(SUM(pnl::numeric), 0) AS pnl FROM trading_paper_trades WHERE status='closed'`;

    // Volatility (annualised from daily snapshots)
    const dailyReturns = await this.sql`
      SELECT daily_return::numeric AS r FROM trading_portfolio_equity
      WHERE daily_return IS NOT NULL AND timestamp > NOW() - INTERVAL '30 days'
      ORDER BY timestamp ASC`;
    const returns = dailyReturns.map((r: any) => parseFloat(r.r));
    const mean = returns.length > 0 ? returns.reduce((a: number, b: number) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 1
      ? returns.reduce((sum: number, r: number) => sum + (r - mean) ** 2, 0) / (returns.length - 1) : 0;
    const dailyVol = Math.sqrt(variance);
    const annualisedVol = dailyVol * Math.sqrt(365);
    const sharpe = annualisedVol > 0 ? (mean * 365) / annualisedVol : 0;

    // Sortino (downside vol only)
    const downReturns = returns.filter((r: number) => r < 0);
    const downVariance = downReturns.length > 1
      ? downReturns.reduce((sum: number, r: number) => sum + r ** 2, 0) / (downReturns.length - 1) : 0;
    const downsideVol = Math.sqrt(downVariance) * Math.sqrt(365);
    const sortino = downsideVol > 0 ? (mean * 365) / downsideVol : 0;

    return {
      daily: { pnl: parseFloat(daily.pnl), pct: (parseFloat(daily.pnl) / capital) * 100 },
      weekly: { pnl: parseFloat(weekly.pnl), pct: (parseFloat(weekly.pnl) / capital) * 100 },
      monthly: { pnl: parseFloat(monthly.pnl), pct: (parseFloat(monthly.pnl) / capital) * 100 },
      total: { pnl: parseFloat(total.pnl), pct: (parseFloat(total.pnl) / capital) * 100 },
      volatility: annualisedVol, sharpe, sortino,
    };
  }

  async generateDailyReport(): Promise<Record<string, any>> {
    const snapshot = await this.takeSnapshot();
    const returns = await this.getReturns();

    const strategies = await this.sql`
      SELECT h.name, h.status,
        COUNT(pt.id) FILTER (WHERE pt.status='open')::int AS open,
        COUNT(pt.id) FILTER (WHERE pt.status='closed' AND pt.exit_time > NOW() - INTERVAL '24 hours')::int AS closed_today,
        COALESCE(SUM(CASE WHEN pt.status='closed' AND pt.exit_time > NOW() - INTERVAL '24 hours'
          THEN pt.pnl::numeric ELSE 0 END), 0) AS daily_pnl
      FROM trading_hypotheses h
      LEFT JOIN trading_paper_trades pt ON pt.hypothesis_id = h.id
      WHERE h.status IN ('paper_trading', 'promoted', 'watchlist')
      GROUP BY h.id, h.name, h.status ORDER BY daily_pnl DESC`;

    const [riskEvents] = await this.sql`
      SELECT COUNT(*)::int AS c FROM trading_risk_events
      WHERE created_at > NOW() - INTERVAL '24 hours'`;

    const [alerts] = await this.sql`
      SELECT COUNT(*)::int AS c FROM trading_alerts
      WHERE created_at > NOW() - INTERVAL '24 hours'`;

    return {
      date: new Date().toISOString().slice(0, 10),
      portfolio: snapshot, returns,
      strategies, riskEventsToday: riskEvents.c, alertsToday: alerts.c,
    };
  }

  async generateWeeklyReport(): Promise<Record<string, any>> {
    const daily = await this.generateDailyReport();
    const equityCurve = await this.getEquityCurve(168);
    const drawdownSeries = await this.getDrawdownSeries(168);

    const [lifecycle] = await this.sql`
      SELECT
        COUNT(*) FILTER (WHERE to_status = 'paper_trading')::int AS promotions,
        COUNT(*) FILTER (WHERE to_status IN ('watchlist', 'retired', 'failed'))::int AS demotions
      FROM trading_lifecycle_transitions
      WHERE created_at > NOW() - INTERVAL '7 days'`;

    const riskEvents = await this.sql`
      SELECT event_type, severity, message, created_at
      FROM trading_risk_events
      WHERE created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC LIMIT 20`;

    return {
      ...daily,
      equityCurve: equityCurve.length,
      drawdownSeries: drawdownSeries.length,
      weeklyLifecycle: lifecycle,
      weeklyRiskEvents: riskEvents,
    };
  }
}
