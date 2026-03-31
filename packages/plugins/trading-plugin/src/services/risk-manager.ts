/**
 * Risk Manager — Pre-trade risk checks, position sizing, exposure control
 * Every trade MUST pass through this before execution.
 */
import postgres from "postgres";

interface RiskConfig {
  total_capital: number; risk_per_trade: number; max_open_positions: number;
  max_exposure: number; max_exposure_per_asset: number;
  max_exposure_per_strategy: number; max_daily_loss: number;
  max_weekly_loss: number; max_drawdown: number; max_leverage: number;
  require_stop_loss: boolean; disable_after_consecutive_losses: number;
}

interface TradeRequest {
  hypothesisId: number; symbol: string; direction: "long" | "short";
  price: number; stopLoss?: number; hypothesisName?: string;
}

interface RiskDecision {
  approved: boolean; positionSize: number; capitalAllocated: number;
  reasons: string[];
}

export class RiskManager {
  private sql: ReturnType<typeof postgres>;

  constructor(sql: ReturnType<typeof postgres>) { this.sql = sql; }

  async getConfig(): Promise<RiskConfig> {
    const [row] = await this.sql`SELECT * FROM trading_portfolio_config LIMIT 1`;
    return {
      total_capital: parseFloat(row.total_capital),
      risk_per_trade: parseFloat(row.risk_per_trade),
      max_open_positions: row.max_open_positions,
      max_exposure: parseFloat(row.max_exposure),
      max_exposure_per_asset: parseFloat(row.max_exposure_per_asset),
      max_exposure_per_strategy: parseFloat(row.max_exposure_per_strategy),
      max_daily_loss: parseFloat(row.max_daily_loss),
      max_weekly_loss: parseFloat(row.max_weekly_loss),
      max_drawdown: parseFloat(row.max_drawdown),
      max_leverage: parseFloat(row.max_leverage),
      require_stop_loss: row.require_stop_loss,
      disable_after_consecutive_losses: row.disable_after_consecutive_losses,
    };
  }

  async checkPreTrade(req: TradeRequest): Promise<RiskDecision> {
    const config = await this.getConfig();
    const reasons: string[] = [];
    let approved = true;

    // 1. Check max open positions
    const [openCount] = await this.sql`
      SELECT COUNT(*)::int AS c FROM trading_paper_trades WHERE status = 'open'`;
    if (openCount.c >= config.max_open_positions) {
      approved = false;
      reasons.push(`Max open positions reached (${openCount.c}/${config.max_open_positions})`);
    }

    // 2. Check total exposure
    const exposure = await this.getExposure();
    if (exposure.totalExposurePct >= config.max_exposure) {
      approved = false;
      reasons.push(`Max total exposure reached (${(exposure.totalExposurePct*100).toFixed(1)}%/${config.max_exposure*100}%)`);
    }

    // 3. Check per-asset exposure
    const assetExposure = exposure.byAsset[req.symbol] || 0;
    if (assetExposure / config.total_capital >= config.max_exposure_per_asset) {
      approved = false;
      reasons.push(`Max exposure for ${req.symbol} reached`);
    }

    // 4. Check per-strategy exposure
    const stratExposure = exposure.byStrategy[req.hypothesisId] || 0;
    if (stratExposure / config.total_capital >= config.max_exposure_per_strategy) {
      approved = false;
      reasons.push(`Max exposure for strategy ${req.hypothesisId} reached`);
    }

    // 5. Check daily loss limit
    const dailyLoss = await this.getDailyLoss();
    if (Math.abs(dailyLoss) / config.total_capital >= config.max_daily_loss) {
      approved = false;
      reasons.push(`Daily loss limit reached (${(dailyLoss).toFixed(2)})`);
    }

    // 6. Check weekly loss limit
    const weeklyLoss = await this.getWeeklyLoss();
    if (Math.abs(weeklyLoss) / config.total_capital >= config.max_weekly_loss) {
      approved = false;
      reasons.push(`Weekly loss limit reached (${weeklyLoss.toFixed(2)})`);
    }

    // 7. Check drawdown
    const dd = await this.getCurrentDrawdown();
    if (dd >= config.max_drawdown) {
      approved = false;
      reasons.push(`Max drawdown breached (${(dd*100).toFixed(1)}%/${config.max_drawdown*100}%)`);
    }

    // 8. Stop loss required
    if (config.require_stop_loss && !req.stopLoss) {
      approved = false;
      reasons.push("Stop loss required but not provided");
    }

    // 9. Calculate position size
    let positionSize = 0;
    let capitalAllocated = 0;
    if (approved) {
      const stopDist = req.stopLoss
        ? Math.abs(req.price - req.stopLoss) / req.price
        : 0.02; // default 2% stop
      capitalAllocated = config.total_capital * config.risk_per_trade / stopDist;
      capitalAllocated = Math.min(capitalAllocated, config.total_capital * config.max_exposure_per_strategy);
      positionSize = capitalAllocated / req.price;
      reasons.push(`Position sized: ${positionSize.toFixed(6)} units ($${capitalAllocated.toFixed(2)})`);
    }

    // Log the risk event
    await this.logEvent(
      approved ? "trade_approved" : "trade_blocked",
      approved ? "info" : "warning",
      approved
        ? `Approved ${req.direction} ${req.symbol}: ${positionSize.toFixed(6)} units`
        : `Blocked ${req.direction} ${req.symbol}: ${reasons.join("; ")}`,
      req.hypothesisId, req.symbol, { reasons, price: req.price }
    );

    return { approved, positionSize, capitalAllocated, reasons };
  }

  async getExposure(): Promise<{
    totalExposure: number; totalExposurePct: number;
    byAsset: Record<string, number>; byStrategy: Record<number, number>;
  }> {
    const config = await this.getConfig();
    const positions = await this.sql`
      SELECT pt.hypothesis_id, pt.direction, pt.entry_price, pt.quantity, ta.symbol,
        (SELECT ts.price FROM trading_snapshots ts WHERE ts.asset_id = pt.asset_id
         ORDER BY ts.timestamp DESC LIMIT 1) as current_price
      FROM trading_paper_trades pt
      JOIN trading_assets ta ON ta.id = pt.asset_id
      WHERE pt.status = 'open'`;

    let totalExposure = 0;
    const byAsset: Record<string, number> = {};
    const byStrategy: Record<number, number> = {};

    for (const p of positions) {
      const val = parseFloat(p.current_price || p.entry_price) * parseFloat(p.quantity);
      totalExposure += val;
      byAsset[p.symbol] = (byAsset[p.symbol] || 0) + val;
      byStrategy[p.hypothesis_id] = (byStrategy[p.hypothesis_id] || 0) + val;
    }

    return {
      totalExposure,
      totalExposurePct: totalExposure / config.total_capital,
      byAsset,
      byStrategy,
    };
  }

  async getDailyLoss(): Promise<number> {
    const [row] = await this.sql`
      SELECT COALESCE(SUM(pnl::numeric), 0) AS loss
      FROM trading_paper_trades
      WHERE status = 'closed'
        AND exit_time > NOW() - INTERVAL '24 hours'
        AND pnl::numeric < 0`;
    return parseFloat(row.loss);
  }

  async getWeeklyLoss(): Promise<number> {
    const [row] = await this.sql`
      SELECT COALESCE(SUM(pnl::numeric), 0) AS loss
      FROM trading_paper_trades
      WHERE status = 'closed'
        AND exit_time > NOW() - INTERVAL '7 days'
        AND pnl::numeric < 0`;
    return parseFloat(row.loss);
  }

  async getCurrentDrawdown(): Promise<number> {
    const [peak] = await this.sql`
      SELECT COALESCE(MAX(total_equity::numeric), 100000) AS peak
      FROM trading_portfolio_equity`;
    const config = await this.getConfig();
    const [unrealised] = await this.sql`
      SELECT COALESCE(SUM(
        (CASE WHEN pt.direction = 'long'
          THEN (ts.price::numeric - pt.entry_price::numeric) * pt.quantity::numeric
          ELSE (pt.entry_price::numeric - ts.price::numeric) * pt.quantity::numeric
        END)
      ), 0) AS pnl
      FROM trading_paper_trades pt
      JOIN trading_assets ta ON ta.id = pt.asset_id
      JOIN LATERAL (
        SELECT price FROM trading_snapshots
        WHERE asset_id = pt.asset_id ORDER BY timestamp DESC LIMIT 1
      ) ts ON true
      WHERE pt.status = 'open'`;
    const [realised] = await this.sql`
      SELECT COALESCE(SUM(pnl::numeric), 0) AS pnl
      FROM trading_paper_trades WHERE status = 'closed'`;

    const currentEquity = config.total_capital + parseFloat(realised.pnl) + parseFloat(unrealised.pnl);
    const peakEquity = parseFloat(peak.peak);
    return peakEquity > 0 ? Math.max(0, (peakEquity - currentEquity) / peakEquity) : 0;
  }

  async getRiskStatus(): Promise<Record<string, any>> {
    const config = await this.getConfig();
    const exposure = await this.getExposure();
    const dailyLoss = await this.getDailyLoss();
    const weeklyLoss = await this.getWeeklyLoss();
    const drawdown = await this.getCurrentDrawdown();
    const [openCount] = await this.sql`
      SELECT COUNT(*)::int AS c FROM trading_paper_trades WHERE status = 'open'`;

    return {
      config,
      current: {
        open_positions: openCount.c,
        total_exposure: exposure.totalExposure,
        exposure_pct: exposure.totalExposurePct,
        exposure_by_asset: exposure.byAsset,
        exposure_by_strategy: exposure.byStrategy,
        daily_loss: dailyLoss,
        daily_loss_pct: dailyLoss / config.total_capital,
        weekly_loss: weeklyLoss,
        weekly_loss_pct: weeklyLoss / config.total_capital,
        drawdown_pct: drawdown,
      },
      limits: {
        positions_ok: openCount.c < config.max_open_positions,
        exposure_ok: exposure.totalExposurePct < config.max_exposure,
        daily_loss_ok: Math.abs(dailyLoss) / config.total_capital < config.max_daily_loss,
        weekly_loss_ok: Math.abs(weeklyLoss) / config.total_capital < config.max_weekly_loss,
        drawdown_ok: drawdown < config.max_drawdown,
      },
    };
  }

  async logEvent(eventType: string, severity: string, message: string,
    hypothesisId?: number, assetSymbol?: string, context?: any): Promise<void> {
    await this.sql`INSERT INTO trading_risk_events (event_type, severity, message,
      hypothesis_id, asset_symbol, context) VALUES (
      ${eventType}, ${severity}, ${message},
      ${hypothesisId ?? null}, ${assetSymbol ?? null}, ${JSON.stringify(context || {})})`;
  }
}
