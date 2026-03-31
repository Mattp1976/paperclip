/**
 * Strategy Lifecycle Manager + Alert Manager
 * Manages strategy state transitions and system alerts.
 *
 * States: hypothesis → backtesting → candidate → paper_trading → promoted → watchlist → retired/failed
 */
import postgres from "postgres";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["backtesting", "failed"],
  hypothesis: ["backtesting", "failed"],
  backtesting: ["candidate", "testing", "failed"],
  testing: ["candidate", "paper_trading", "failed"],
  candidate: ["paper_trading", "failed"],
  paper_trading: ["promoted", "watchlist", "retired", "failed"],
  promoted: ["watchlist", "retired"],
  watchlist: ["paper_trading", "promoted", "retired", "failed"],
  retired: [],
  failed: [],
};

export class LifecycleManager {
  private sql: ReturnType<typeof postgres>;
  constructor(sql: ReturnType<typeof postgres>) { this.sql = sql; }

  async transition(hypothesisId: number, toStatus: string, reason: string,
    triggeredBy: string = "system"): Promise<boolean> {
    const [hyp] = await this.sql`
      SELECT id, status, name FROM trading_hypotheses WHERE id = ${hypothesisId}`;
    if (!hyp) return false;

    const fromStatus = hyp.status;
    const allowed = VALID_TRANSITIONS[fromStatus] || [];
    if (!allowed.includes(toStatus)) {
      console.log(`[Lifecycle] Invalid transition: ${fromStatus} → ${toStatus} for ${hyp.name}`);
      return false;
    }

    await this.sql`UPDATE trading_hypotheses SET status = ${toStatus},
      updated_at = NOW(),
      promoted_at = ${toStatus === 'promoted' ? new Date() : null},
      retired_at = ${['retired','failed'].includes(toStatus) ? new Date() : null},
      retirement_reason = ${['retired','failed'].includes(toStatus) ? reason : null}
      WHERE id = ${hypothesisId}`;

    await this.sql`INSERT INTO trading_lifecycle_transitions
      (hypothesis_id, from_status, to_status, reason, triggered_by)
      VALUES (${hypothesisId}, ${fromStatus}, ${toStatus}, ${reason}, ${triggeredBy})`;

    console.log(`[Lifecycle] ${hyp.name}: ${fromStatus} → ${toStatus} (${reason})`);
    return true;
  }

  async runLifecycleChecks(): Promise<{ promotions: number; demotions: number; retirements: number }> {
    let promotions = 0, demotions = 0, retirements = 0;

    // 1. Promote: paper_trading strategies with good track record
    const ptStrategies = await this.sql`
      SELECT h.id, h.name,
        COUNT(pt.id) FILTER (WHERE pt.status = 'closed')::int AS closed_trades,
        COUNT(pt.id) FILTER (WHERE pt.status = 'closed' AND pt.pnl::numeric > 0)::int AS wins,
        COALESCE(SUM(CASE WHEN pt.status='closed' THEN pt.pnl::numeric ELSE 0 END), 0) AS total_pnl,
        COALESCE(AVG(CASE WHEN pt.status='closed' THEN pt.pnl_pct::numeric END), 0) AS avg_return
      FROM trading_hypotheses h
      LEFT JOIN trading_paper_trades pt ON pt.hypothesis_id = h.id
      WHERE h.status = 'paper_trading'
      GROUP BY h.id, h.name`;

    for (const s of ptStrategies) {
      const closedTrades = s.closed_trades;
      const winRate = closedTrades > 0 ? s.wins / closedTrades : 0;
      const totalPnl = parseFloat(s.total_pnl);

      // Promote if: 10+ closed trades, >55% win rate, positive P&L
      if (closedTrades >= 10 && winRate > 0.55 && totalPnl > 0) {
        if (await this.transition(s.id, 'promoted',
          `Auto-promoted: ${closedTrades} trades, ${(winRate*100).toFixed(0)}% win rate, $${totalPnl.toFixed(2)} P&L`)) {
          promotions++;
          await alertManager(this.sql).create('strategy_promoted', 'info',
            `Strategy promoted: ${s.name}`,
            `${s.name} promoted after ${closedTrades} trades with ${(winRate*100).toFixed(0)}% win rate`,
            { hypothesisId: s.id, winRate, totalPnl });
        }
      }

      // Demote to watchlist if: 5+ trades, <40% win rate or negative P&L
      if (closedTrades >= 5 && (winRate < 0.4 || totalPnl < -50)) {
        if (await this.transition(s.id, 'watchlist',
          `Performance decline: ${(winRate*100).toFixed(0)}% win rate, $${totalPnl.toFixed(2)} P&L`)) {
          demotions++;
          await alertManager(this.sql).create('strategy_watchlist', 'warning',
            `Strategy demoted: ${s.name}`,
            `${s.name} moved to watchlist — ${(winRate*100).toFixed(0)}% win rate, $${totalPnl.toFixed(2)} P&L`,
            { hypothesisId: s.id });
        }
      }
    }

    // 2. Retire: watchlist strategies that don't recover
    const watchlistStrategies = await this.sql`
      SELECT h.id, h.name, h.updated_at,
        COALESCE(SUM(CASE WHEN pt.status='closed' AND pt.exit_time > h.updated_at
          THEN pt.pnl::numeric ELSE 0 END), 0) AS pnl_since_watchlist
      FROM trading_hypotheses h
      LEFT JOIN trading_paper_trades pt ON pt.hypothesis_id = h.id
      WHERE h.status = 'watchlist'
      GROUP BY h.id, h.name, h.updated_at`;

    for (const s of watchlistStrategies) {
      const daysSinceWatchlist = (Date.now() - new Date(s.updated_at).getTime()) / 86400000;
      if (daysSinceWatchlist > 3 && parseFloat(s.pnl_since_watchlist) < 0) {
        if (await this.transition(s.id, 'retired',
          `No recovery after ${daysSinceWatchlist.toFixed(0)} days on watchlist`)) {
          retirements++;
          await alertManager(this.sql).create('strategy_retired', 'warning',
            `Strategy retired: ${s.name}`,
            `${s.name} retired after failing to recover from watchlist`,
            { hypothesisId: s.id });
        }
      }
    }

    return { promotions, demotions, retirements };
  }

  async getLifecycleHistory(limit: number = 50): Promise<any[]> {
    return this.sql`
      SELECT lt.*, h.name as hypothesis_name
      FROM trading_lifecycle_transitions lt
      JOIN trading_hypotheses h ON h.id = lt.hypothesis_id
      ORDER BY lt.created_at DESC LIMIT ${limit}`;
  }

  async getStrategyStates(): Promise<Record<string, number>> {
    const rows = await this.sql`
      SELECT status, COUNT(*)::int AS c FROM trading_hypotheses GROUP BY status`;
    const result: Record<string, number> = {};
    rows.forEach((r: any) => { result[r.status] = r.c; });
    return result;
  }
}

/* ─── Alert Manager ─── */
export function alertManager(sql: ReturnType<typeof postgres>) {
  return {
    async create(alertType: string, severity: string, title: string,
      message: string, context?: any): Promise<void> {
      await sql`INSERT INTO trading_alerts (alert_type, severity, title, message, context)
        VALUES (${alertType}, ${severity}, ${title}, ${message}, ${JSON.stringify(context || {})})`;
    },

    async getRecent(limit: number = 50): Promise<any[]> {
      return sql`SELECT * FROM trading_alerts ORDER BY created_at DESC LIMIT ${limit}`;
    },

    async getUnread(): Promise<any[]> {
      return sql`SELECT * FROM trading_alerts WHERE is_read = false ORDER BY created_at DESC`;
    },

    async acknowledge(id: number): Promise<void> {
      await sql`UPDATE trading_alerts SET is_read = true, is_acknowledged = true WHERE id = ${id}`;
    },

    async checkAndAlert(sql2: ReturnType<typeof postgres>): Promise<void> {
      // Check portfolio drawdown
      const [config] = await sql`SELECT * FROM trading_portfolio_config LIMIT 1`;
      const [latest] = await sql`
        SELECT drawdown_pct FROM trading_portfolio_equity ORDER BY timestamp DESC LIMIT 1`;
      if (latest && parseFloat(latest.drawdown_pct) > parseFloat(config.max_drawdown) * 0.8) {
        await this.create('drawdown_warning', 'critical',
          'Drawdown approaching limit',
          `Portfolio drawdown at ${(parseFloat(latest.drawdown_pct)*100).toFixed(1)}% (limit: ${parseFloat(config.max_drawdown)*100}%)`);
      }
    },
  };
}
