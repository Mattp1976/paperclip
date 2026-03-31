/**
 * Exit Engine — ASI Trading System
 * =================================
 * Runs every cycle (5 min) to check all open positions against exit rules:
 *   1. Stop-loss (fixed price level)
 *   2. Take-profit (fixed price level)
 *   3. Trailing stop (dynamic — ratchets up with price, never down)
 *   4. Time-based exit (max hold duration)
 *
 * The engine updates high_water_mark and adjusts trailing stops in real-time.
 * All exits are logged with reason and P&L.
 */
import type { Sql } from "postgres";

interface OpenPosition {
  id: string;
  hypothesis_id: string;
  asset_id: string;
  direction: string;
  entry_price: string;
  entry_time: Date;
  quantity: string;
  stop_loss: string | null;
  take_profit: string | null;
  trailing_stop_pct: string | null;
  high_water_mark: string | null;
  max_hold_until: Date | null;
  metadata: any;
}

interface ExitResult {
  tradeId: string;
  symbol: string;
  direction: string;
  exitReason: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  holdHours: number;
}

export class ExitEngine {
  constructor(private sql: Sql) {}

  /**
   * Main cycle — check all open positions for exit conditions.
   * Returns array of exits executed this cycle.
   */
  async runCycle(): Promise<ExitResult[]> {
    console.log("[ExitEngine] Checking open positions for exits...");
    const exits: ExitResult[] = [];

    try {
      // Get all open positions with exit levels
      const positions = await this.sql<OpenPosition[]>`
        SELECT t.id, t.hypothesis_id, t.asset_id, t.direction,
               t.entry_price, t.entry_time, t.quantity,
               t.stop_loss, t.take_profit, t.trailing_stop_pct,
               t.high_water_mark, t.max_hold_until, t.metadata
        FROM trading_paper_trades t
        WHERE t.status = 'open'
      `;

      if (positions.length === 0) {
        console.log("[ExitEngine] No open positions.");
        return exits;
      }

      console.log(`[ExitEngine] Evaluating ${positions.length} open positions...`);

      for (const pos of positions) {
        try {
          const result = await this.evaluatePosition(pos);
          if (result) {
            exits.push(result);
          }
        } catch (err) {
          console.error(`[ExitEngine] Error evaluating position ${String(pos.id).slice(0, 8)}:`, err);
        }
      }

      if (exits.length > 0) {
        console.log(`[ExitEngine] Executed ${exits.length} exits this cycle.`);
        for (const e of exits) {
          console.log(`  ${e.direction.toUpperCase()} ${e.symbol}: $${e.pnl.toFixed(2)} (${e.pnlPct.toFixed(2)}%) — ${e.exitReason}`);
        }
      } else {
        console.log("[ExitEngine] No exits triggered.");
      }

    } catch (err) {
      console.error("[ExitEngine] Cycle error:", err);
    }

    return exits;
  }

  /**
   * Evaluate a single position against all exit rules.
   * Updates high_water_mark and trailing stop in real-time.
   */
  private async evaluatePosition(pos: OpenPosition): Promise<ExitResult | null> {
    // Get latest price
    const [snap] = await this.sql`
      SELECT price FROM trading_snapshots
      WHERE asset_id = ${pos.asset_id}
      ORDER BY timestamp DESC LIMIT 1
    `;
    if (!snap) return null;

    const currentPrice = parseFloat(snap.price);
    const entryPrice = parseFloat(pos.entry_price);
    const quantity = parseFloat(pos.quantity);
    const isLong = pos.direction === "long";

    // Calculate return
    const returnPct = isLong
      ? (currentPrice - entryPrice) / entryPrice * 100
      : (entryPrice - currentPrice) / entryPrice * 100;

    // Get asset symbol
    const [asset] = await this.sql`SELECT symbol FROM trading_assets WHERE id = ${pos.asset_id}`;
    const symbol = asset?.symbol ?? "???";

    // ─── 1. Update high-water mark and trailing stop ───
    if (pos.trailing_stop_pct && pos.high_water_mark) {
      const hwm = parseFloat(pos.high_water_mark);
      const trailPct = parseFloat(pos.trailing_stop_pct);
      let newHwm = hwm;
      let newTrailingStop = pos.stop_loss ? parseFloat(pos.stop_loss) : null;

      if (isLong && currentPrice > hwm) {
        // Price made new high — ratchet up the stop
        newHwm = currentPrice;
        newTrailingStop = currentPrice * (1 - trailPct / 100);
        // Only update if trailing stop is higher than current stop
        const currentStop = pos.stop_loss ? parseFloat(pos.stop_loss) : 0;
        if (newTrailingStop > currentStop) {
          await this.sql`
            UPDATE trading_paper_trades
            SET high_water_mark = ${String(newHwm)},
                stop_loss = ${String(newTrailingStop)}
            WHERE id = ${pos.id}
          `;
          console.log(`[ExitEngine] ${symbol} trailing stop ratcheted: $${currentStop.toFixed(2)} → $${newTrailingStop.toFixed(2)} (HWM: $${newHwm.toFixed(2)})`);
        } else {
          // Just update HWM
          await this.sql`
            UPDATE trading_paper_trades SET high_water_mark = ${String(newHwm)} WHERE id = ${pos.id}
          `;
        }
      } else if (!isLong && currentPrice < hwm) {
        // Short: price made new low — ratchet down the stop
        newHwm = currentPrice;
        newTrailingStop = currentPrice * (1 + trailPct / 100);
        const currentStop = pos.stop_loss ? parseFloat(pos.stop_loss) : Infinity;
        if (newTrailingStop < currentStop) {
          await this.sql`
            UPDATE trading_paper_trades
            SET high_water_mark = ${String(newHwm)},
                stop_loss = ${String(newTrailingStop)}
            WHERE id = ${pos.id}
          `;
          console.log(`[ExitEngine] ${symbol} SHORT trailing stop ratcheted: $${currentStop.toFixed(2)} → $${newTrailingStop.toFixed(2)} (HWM: $${newHwm.toFixed(2)})`);
        } else {
          await this.sql`
            UPDATE trading_paper_trades SET high_water_mark = ${String(newHwm)} WHERE id = ${pos.id}
          `;
        }
      }
    }

    // ─── 2. Check exit conditions (priority order) ───
    let exitReason: string | null = null;

    // 2a. Stop-loss
    if (pos.stop_loss) {
      const sl = parseFloat(pos.stop_loss);
      if (isLong && currentPrice <= sl) {
        exitReason = "stop_loss";
      } else if (!isLong && currentPrice >= sl) {
        exitReason = "stop_loss";
      }
    }

    // 2b. Take-profit
    if (!exitReason && pos.take_profit) {
      const tp = parseFloat(pos.take_profit);
      if (isLong && currentPrice >= tp) {
        exitReason = "take_profit";
      } else if (!isLong && currentPrice <= tp) {
        exitReason = "take_profit";
      }
    }

    // 2c. Time-based exit
    if (!exitReason && pos.max_hold_until) {
      if (new Date() >= new Date(pos.max_hold_until)) {
        exitReason = "time_limit";
      }
    }

    // 2d. Fallback: percentage-based from hypothesis (for positions without columns set)
    if (!exitReason && !pos.stop_loss && !pos.take_profit) {
      try {
        const [hyp] = await this.sql`
          SELECT exit_rules FROM trading_hypotheses WHERE id = ${pos.hypothesis_id}
        `;
        if (hyp?.exit_rules) {
          const rules = hyp.exit_rules as any;
          if (returnPct >= (rules.take_profit_pct ?? 999)) exitReason = "take_profit";
          else if (returnPct <= -(rules.stop_loss_pct ?? 999)) exitReason = "stop_loss";
          const holdH = (Date.now() - new Date(pos.entry_time).getTime()) / 3600000;
          if (holdH >= (rules.time_limit_hours ?? 9999)) exitReason = "time_limit";
        }
      } catch (e) {
        // Fallback failed, skip
      }
    }

    if (!exitReason) return null;

    // ─── 3. Execute exit ───
    const pnl = quantity * (currentPrice - entryPrice) * (isLong ? 1 : -1);
    const holdHours = (Date.now() - new Date(pos.entry_time).getTime()) / 3600000;

    await this.sql`
      UPDATE trading_paper_trades
      SET exit_price = ${String(currentPrice)},
          exit_time = NOW(),
          pnl = ${String(Math.round(pnl * 100) / 100)},
          pnl_pct = ${String(Math.round(returnPct * 100) / 100)},
          status = 'closed',
          exit_reason = ${exitReason}
      WHERE id = ${pos.id}
    `;

    console.log(`[ExitEngine] ✘ CLOSED ${pos.direction.toUpperCase()} ${symbol} @ $${currentPrice.toFixed(2)} | P&L: $${pnl.toFixed(2)} (${returnPct.toFixed(2)}%) | Reason: ${exitReason} | Held: ${holdHours.toFixed(1)}h`);

    // Log to agent_logs
    try {
      await this.sql`
        INSERT INTO trading_agent_logs (agent_name, log_level, message, context)
        VALUES ('exit_engine', 'info', ${`Closed ${pos.direction} ${symbol}: $${pnl.toFixed(2)} (${exitReason})`},
                ${JSON.stringify({
                  tradeId: pos.id, symbol, direction: pos.direction,
                  entryPrice, exitPrice: currentPrice, pnl, pnlPct: returnPct,
                  exitReason, holdHours: Math.round(holdHours * 10) / 10,
                })})
      `;
    } catch (e) { /* logging failed, non-critical */ }

    // Log risk event for stop-loss hits
    if (exitReason === "stop_loss") {
      try {
        await this.sql`
          INSERT INTO trading_risk_events (hypothesis_id, event_type, severity, details)
          VALUES (${pos.hypothesis_id}, 'stop_loss_hit', 'warning',
                  ${JSON.stringify({
                    symbol, direction: pos.direction, pnl, pnlPct: returnPct,
                    stopLevel: pos.stop_loss, exitPrice: currentPrice,
                  })})
        `;
      } catch (e) { /* non-critical */ }
    }

    return {
      tradeId: pos.id, symbol, direction: pos.direction,
      exitReason, entryPrice, exitPrice: currentPrice,
      pnl, pnlPct: returnPct, holdHours,
    };
  }

  /**
   * Get status summary of all open positions and their exit levels.
   */
  async getStatus(): Promise<any[]> {
    const rows = await this.sql`
      SELECT t.id, t.direction, t.entry_price, t.quantity,
             t.stop_loss, t.take_profit, t.trailing_stop_pct,
             t.high_water_mark, t.max_hold_until,
             a.symbol,
             s.price as current_price
      FROM trading_paper_trades t
      JOIN trading_assets a ON a.id = t.asset_id
      LEFT JOIN LATERAL (
        SELECT price FROM trading_snapshots
        WHERE asset_id = t.asset_id
        ORDER BY timestamp DESC LIMIT 1
      ) s ON true
      WHERE t.status = 'open'
    `;

    return rows.map(r => {
      const entry = parseFloat(r.entry_price);
      const current = r.current_price ? parseFloat(r.current_price) : entry;
      const isLong = r.direction === "long";
      const pnlPct = isLong
        ? (current - entry) / entry * 100
        : (entry - current) / entry * 100;

      return {
        id: r.id,
        symbol: r.symbol,
        direction: r.direction,
        entryPrice: entry,
        currentPrice: current,
        pnlPct: Math.round(pnlPct * 100) / 100,
        stopLoss: r.stop_loss ? parseFloat(r.stop_loss) : null,
        takeProfit: r.take_profit ? parseFloat(r.take_profit) : null,
        trailingStopPct: r.trailing_stop_pct ? parseFloat(r.trailing_stop_pct) : null,
        highWaterMark: r.high_water_mark ? parseFloat(r.high_water_mark) : null,
        maxHoldUntil: r.max_hold_until,
        distanceToStop: r.stop_loss
          ? (isLong
            ? (current - parseFloat(r.stop_loss)) / current * 100
            : (parseFloat(r.stop_loss) - current) / current * 100)
          : null,
        distanceToTP: r.take_profit
          ? (isLong
            ? (parseFloat(r.take_profit) - current) / current * 100
            : (current - parseFloat(r.take_profit)) / current * 100)
          : null,
      };
    });
  }
}
