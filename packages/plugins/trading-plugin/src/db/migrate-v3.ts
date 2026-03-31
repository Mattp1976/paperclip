/**
 * Migration V3 — Exit Engine columns
 * Adds stop_loss, take_profit, trailing_stop_pct, high_water_mark,
 * and max_hold_until to trading_paper_trades for the exit engine.
 */
import type { Sql } from "postgres";

export async function runV3Migration(sql: Sql): Promise<void> {
  console.log("[Migration V3] Adding exit engine columns...");

  const columns = [
    { name: "stop_loss", type: "NUMERIC" },
    { name: "take_profit", type: "NUMERIC" },
    { name: "trailing_stop_pct", type: "NUMERIC" },
    { name: "high_water_mark", type: "NUMERIC" },
    { name: "max_hold_until", type: "TIMESTAMPTZ" },
  ];

  for (const col of columns) {
    try {
      await sql.unsafe(
        `ALTER TABLE trading_paper_trades ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`
      );
      console.log(`[Migration V3] Added column ${col.name}`);
    } catch (e: any) {
      if (e.message?.includes("already exists")) {
        console.log(`[Migration V3] Column ${col.name} already exists`);
      } else {
        console.error(`[Migration V3] Error adding ${col.name}:`, e.message);
      }
    }
  }

  // Backfill existing open positions from hypothesis exit_rules
  try {
    const openTrades = await sql`
      SELECT t.id, t.entry_price, t.direction, t.entry_time, t.metadata,
             h.exit_rules
      FROM trading_paper_trades t
      JOIN trading_hypotheses h ON h.id = t.hypothesis_id
      WHERE t.status = 'open' AND t.stop_loss IS NULL
    `;

    for (const trade of openTrades) {
      const exitRules = trade.exit_rules as any;
      const entryPrice = parseFloat(trade.entry_price);
      const dir = trade.direction;

      const stopLossPct = exitRules?.stop_loss_pct ?? 2;
      const takeProfitPct = exitRules?.take_profit_pct ?? 4;
      const trailingStopPct = exitRules?.trailing_stop_pct ?? 1.2;
      const timeLimitH = exitRules?.time_limit_hours ?? 24;

      const stopLoss = dir === "long"
        ? entryPrice * (1 - stopLossPct / 100)
        : entryPrice * (1 + stopLossPct / 100);

      const takeProfit = dir === "long"
        ? entryPrice * (1 + takeProfitPct / 100)
        : entryPrice * (1 - takeProfitPct / 100);

      const maxHold = new Date(
        new Date(trade.entry_time).getTime() + timeLimitH * 3600000
      );

      await sql`
        UPDATE trading_paper_trades
        SET stop_loss = ${String(stopLoss)},
            take_profit = ${String(takeProfit)},
            trailing_stop_pct = ${String(trailingStopPct)},
            high_water_mark = ${String(entryPrice)},
            max_hold_until = ${maxHold}
        WHERE id = ${trade.id}
      `;
      console.log(`[Migration V3] Backfilled exit levels for trade ${String(trade.id).slice(0, 8)}`);
    }
  } catch (e: any) {
    console.error("[Migration V3] Backfill error:", e.message);
  }

  console.log("[Migration V3] Exit engine columns ready.");
}
