/**
 * Portfolio Manager — Capital allocation, rebalancing, portfolio state
 * Manages the portfolio as a system of strategies, not individual trades.
 */
import postgres from "postgres";

type AllocationMethod = "equal_weight" | "sharpe_weighted" | "inverse_drawdown" | "score_weighted";

interface StrategyInfo {
  id: string; name: string; status: string; sharpe: number | null;
  winRate: number | null; maxDrawdown: number | null; totalReturn: number | null;
  tradeCount: number; openPositions: number; realisedPnl: number; unrealisedPnl: number;
}

interface Allocation {
  hypothesisId: string; name: string; weight: number;
  allocatedCapital: number; currentExposure: number;
}

export class PortfolioManager {
  private sql: ReturnType<typeof postgres>;
  constructor(sql: ReturnType<typeof postgres>) { this.sql = sql; }

  async getConfig(): Promise<any> {
    const [row] = await this.sql`SELECT * FROM trading_portfolio_config LIMIT 1`;
    return row;
  }

  async getPortfolioState(): Promise<Record<string, any>> {
    const config = await this.getConfig();
    const totalCapital = parseFloat(config.total_capital);

    const [realised] = await this.sql`
      SELECT COALESCE(SUM(pnl::numeric), 0) AS pnl FROM trading_paper_trades WHERE status = 'closed'`;
    const unrealised = await this.getUnrealisedPnl();
    const currentEquity = totalCapital + parseFloat(realised.pnl) + unrealised;

    const [peakRow] = await this.sql`
      SELECT COALESCE(MAX(total_equity::numeric), ${totalCapital}) AS peak FROM trading_portfolio_equity`;
    const peak = Math.max(parseFloat(peakRow.peak), currentEquity);
    const drawdown = peak > 0 ? (peak - currentEquity) / peak : 0;

    const positions = await this.sql`
      SELECT pt.*, ta.symbol, h.name as hypothesis_name,
        (SELECT ts.price FROM trading_snapshots ts WHERE ts.asset_id = pt.asset_id
         ORDER BY ts.timestamp DESC LIMIT 1) as current_price
      FROM trading_paper_trades pt
      JOIN trading_assets ta ON ta.id = pt.asset_id
      LEFT JOIN trading_hypotheses h ON h.id = pt.hypothesis_id
      WHERE pt.status = 'open'`;

    let totalExposure = 0;
    const openPositions = positions.map((p: any) => {
      const entry = parseFloat(p.entry_price);
      const current = parseFloat(p.current_price || p.entry_price);
      const qty = parseFloat(p.quantity);
      const exposure = current * qty;
      totalExposure += exposure;
      const pnl = p.direction === 'long' ? (current - entry) * qty : (entry - current) * qty;
      const pnlPct = ((current - entry) / entry * 100) * (p.direction === 'long' ? 1 : -1);
      return {
        id: p.id, symbol: p.symbol, direction: p.direction,
        entryPrice: entry, currentPrice: current, quantity: qty,
        exposure, pnl, pnlPct, hypothesisName: p.hypothesis_name,
        entryTime: p.entry_time,
      };
    });

    const allocations = await this.getAllocations();

    const [closedStats] = await this.sql`
      SELECT COUNT(*)::int AS trades,
        COUNT(*) FILTER (WHERE pnl::numeric > 0)::int AS wins,
        COALESCE(AVG(pnl_pct::numeric), 0) AS avg_return,
        COALESCE(SUM(CASE WHEN pnl::numeric > 0 THEN pnl::numeric ELSE 0 END), 0) AS gross_profit,
        COALESCE(SUM(CASE WHEN pnl::numeric < 0 THEN ABS(pnl::numeric) ELSE 0 END), 0.01) AS gross_loss
      FROM trading_paper_trades WHERE status = 'closed'`;

    return {
      totalCapital, currentEquity,
      realisedPnl: parseFloat(realised.pnl), unrealisedPnl: unrealised,
      totalReturn: ((currentEquity - totalCapital) / totalCapital) * 100,
      peakEquity: peak, drawdown: drawdown * 100,
      totalExposure, exposurePct: (totalExposure / totalCapital) * 100,
      openPositions, allocations,
      stats: {
        totalTrades: closedStats.trades, winRate: closedStats.trades > 0
          ? (closedStats.wins / closedStats.trades * 100) : 0,
        avgReturn: parseFloat(closedStats.avg_return),
        profitFactor: parseFloat(closedStats.gross_profit) / parseFloat(closedStats.gross_loss),
      },
      allocationMethod: config.allocation_method,
      timestamp: new Date().toISOString(),
    };
  }

  async getUnrealisedPnl(): Promise<number> {
    const [row] = await this.sql`
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
    return parseFloat(row.pnl);
  }

  async getAllocations(): Promise<Allocation[]> {
    const rows = await this.sql`
      SELECT sa.*, h.name, h.status as hyp_status
      FROM trading_strategy_allocations sa
      JOIN trading_hypotheses h ON h.id = sa.hypothesis_id
      WHERE sa.status = 'active'
      ORDER BY sa.allocation_pct DESC`;

    return rows.map((r: any) => ({
      hypothesisId: r.hypothesis_id,
      name: r.name,
      weight: parseFloat(r.allocation_pct),
      allocatedCapital: parseFloat(r.allocated_capital),
      currentExposure: 0, // filled by caller if needed
    }));
  }

  async rebalance(): Promise<{ allocations: Allocation[]; method: string }> {
    const config = await this.getConfig();
    const method = config.allocation_method as AllocationMethod;
    const totalCapital = parseFloat(config.total_capital);

    // Get eligible strategies (paper_trading or promoted)
    const strategies = await this.sql`
      SELECT h.id, h.name, h.status,
        br.sharpe_ratio, br.win_rate, br.max_drawdown, br.total_return, br.total_trades
      FROM trading_hypotheses h
      LEFT JOIN LATERAL (
        SELECT * FROM trading_backtest_results WHERE hypothesis_id = h.id
        ORDER BY created_at DESC LIMIT 1
      ) br ON true
      WHERE h.status IN ('paper_trading', 'promoted')
      ORDER BY br.sharpe_ratio DESC NULLS LAST`;

    if (strategies.length === 0) return { allocations: [], method };

    // Calculate weights based on method
    let weights: Map<string, number> = new Map();

    if (method === "equal_weight") {
      const w = 1 / strategies.length;
      strategies.forEach((s: any) => weights.set(s.id, w));
    } else if (method === "sharpe_weighted") {
      const sharpes = strategies.map((s: any) => Math.max(0, parseFloat(s.sharpe_ratio || '0')));
      const total = sharpes.reduce((a: number, b: number) => a + b, 0) || 1;
      strategies.forEach((s: any, i: number) => weights.set(s.id, sharpes[i] / total));
    } else if (method === "inverse_drawdown") {
      const inv = strategies.map((s: any) => 1 / (parseFloat(s.max_drawdown || '0.1') + 0.01));
      const total = inv.reduce((a: number, b: number) => a + b, 0) || 1;
      strategies.forEach((s: any, i: number) => weights.set(s.id, inv[i] / total));
    } else { // score_weighted — use sharpe * win_rate
      const scores = strategies.map((s: any) => {
        const sharpe = Math.max(0, parseFloat(s.sharpe_ratio || '0'));
        const wr = parseFloat(s.win_rate || '0.5');
        return sharpe * wr;
      });
      const total = scores.reduce((a: number, b: number) => a + b, 0) || 1;
      strategies.forEach((s: any, i: number) => weights.set(s.id, scores[i] / total));
    }

    // Cap per-strategy exposure
    const maxPct = parseFloat(config.max_exposure_per_strategy);
    for (const [id, w] of weights) {
      if (w > maxPct) weights.set(id, maxPct);
    }
    // Renormalise
    const wTotal = Array.from(weights.values()).reduce((a, b) => a + b, 0);
    if (wTotal > 1) {
      for (const [id, w] of weights) weights.set(id, w / wTotal);
    }

    // Save allocations
    await this.sql`DELETE FROM trading_strategy_allocations WHERE status = 'active'`;
    const allocations: Allocation[] = [];
    for (const s of strategies) {
      const w = weights.get(s.id) || 0;
      const capital = totalCapital * w;
      await this.sql`INSERT INTO trading_strategy_allocations
        (hypothesis_id, allocation_pct, allocated_capital, status, score)
        VALUES (${s.id}, ${w}, ${capital}, 'active', ${parseFloat(s.sharpe_ratio || '0')})`;
      allocations.push({
        hypothesisId: s.id, name: s.name, weight: w,
        allocatedCapital: capital, currentExposure: 0,
      });
    }

    return { allocations, method };
  }

  async getStrategyContribution(): Promise<any[]> {
    const rows = await this.sql`
      SELECT h.id, h.name, h.status,
        COUNT(pt.id)::int AS trade_count,
        COUNT(pt.id) FILTER (WHERE pt.status = 'open')::int AS open_trades,
        COALESCE(SUM(CASE WHEN pt.status='closed' THEN pt.pnl::numeric ELSE 0 END), 0) AS realised_pnl,
        COALESCE(AVG(CASE WHEN pt.status='closed' THEN pt.pnl_pct::numeric END), 0) AS avg_return,
        COUNT(pt.id) FILTER (WHERE pt.status='closed' AND pt.pnl::numeric > 0)::int AS wins,
        COUNT(pt.id) FILTER (WHERE pt.status='closed')::int AS closed_trades
      FROM trading_hypotheses h
      LEFT JOIN trading_paper_trades pt ON pt.hypothesis_id = h.id
      WHERE h.status IN ('paper_trading', 'promoted', 'watchlist')
      GROUP BY h.id, h.name, h.status
      ORDER BY realised_pnl DESC`;

    return rows.map((r: any) => ({
      id: r.id, name: r.name, status: r.status,
      tradeCount: r.trade_count, openTrades: r.open_trades,
      realisedPnl: parseFloat(r.realised_pnl),
      avgReturn: parseFloat(r.avg_return),
      winRate: r.closed_trades > 0 ? (r.wins / r.closed_trades * 100) : 0,
    }));
  }
}
