import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import postgres from "postgres";
import { RiskManager } from "./services/risk-manager.js";
import { PortfolioManager } from "./services/portfolio-manager.js";
import { EquityEngine } from "./services/equity-engine.js";
import { LifecycleManager, alertManager } from "./services/lifecycle-manager.js";

const sql = postgres(process.env.DATABASE_URL!);
const risk = new RiskManager(sql);
const portfolio = new PortfolioManager(sql);
const equity = new EquityEngine(sql);
const lifecycle = new LifecycleManager(sql);
const alerts = alertManager(sql);

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "application/javascript",
  ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml",
};

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

async function handleAPI(path: string, res: ServerResponse): Promise<void> {
  try {
    // ─── Original endpoints ───
    if (path === "/api/prices") {
      const rows = await sql`
        SELECT DISTINCT ON (ta.symbol)
          ta.symbol, ts.price, ts.price_change_1h,
          ts.price_change_24h, ts.volume_24h, ts.rsi_14, ts.timestamp
        FROM trading_snapshots ts
        JOIN trading_assets ta ON ta.id = ts.asset_id
        ORDER BY ta.symbol, ts.timestamp DESC`;
      return json(res, rows);
    }
    if (path === "/api/signals") {
      const rows = await sql`
        SELECT s.signal_type, s.severity, s.value, s.context, s.is_active,
          s.detected_at, ta.symbol
        FROM trading_signals s
        JOIN trading_assets ta ON ta.id = s.asset_id
        ORDER BY s.detected_at DESC LIMIT 50`;
      return json(res, rows);
    }
    if (path === "/api/hypotheses") {
      const rows = await sql`
        SELECT h.id, h.name, h.description, h.asset_class, h.strategy_type,
          h.confidence, h.status, h.generation, h.created_by,
          h.entry_rules, h.exit_rules, h.risk_params,
          h.promoted_at, h.retired_at, h.retirement_reason,
          h.created_at, h.updated_at
        FROM trading_hypotheses h ORDER BY h.created_at DESC LIMIT 50`;
      return json(res, rows);
    }
    if (path === "/api/paper-trades") {
      const rows = await sql`
        SELECT pt.id, pt.direction, pt.entry_price, pt.exit_price,
          pt.quantity, pt.pnl, pt.pnl_pct, pt.status, pt.exit_reason,
          pt.entry_time, pt.exit_time, pt.metadata,
          ta.symbol, h.name as hypothesis_name
        FROM trading_paper_trades pt
        JOIN trading_assets ta ON ta.id = pt.asset_id
        LEFT JOIN trading_hypotheses h ON h.id = pt.hypothesis_id
        ORDER BY pt.entry_time DESC LIMIT 100`;
      return json(res, rows);
    }
    if (path === "/api/backtest-results") {
      const rows = await sql`
        SELECT br.id, br.sharpe_ratio, br.win_rate, br.max_drawdown,
          br.total_trades, br.total_return, br.profit_factor,
          br.avg_trade_return, br.period_start, br.period_end, br.created_at,
          h.name as hypothesis_name, h.status as hypothesis_status, h.asset_class
        FROM trading_backtest_results br
        JOIN trading_hypotheses h ON h.id = br.hypothesis_id
        ORDER BY br.created_at DESC LIMIT 50`;
      return json(res, rows);
    }
    if (path === "/api/agent-logs") {
      const rows = await sql`
        SELECT agent_name, log_level, message, context, created_at
        FROM trading_agent_logs ORDER BY created_at DESC LIMIT 100`;
      return json(res, rows);
    }
    if (path === "/api/price-history") {
      const rows = await sql`
        SELECT ta.symbol, ts.price, ts.volume_24h, ts.rsi_14, ts.timestamp
        FROM trading_snapshots ts
        JOIN trading_assets ta ON ta.id = ts.asset_id
        WHERE ts.timestamp > NOW() - INTERVAL '7 days'
        ORDER BY ta.symbol, ts.timestamp ASC`;
      return json(res, rows);
    }
    if (path === "/api/stats") {
      const [snap] = await sql`SELECT COUNT(*)::int AS c FROM trading_snapshots`;
      const [sig] = await sql`SELECT COUNT(*)::int AS c FROM trading_signals`;
      const [hyp] = await sql`SELECT COUNT(*)::int AS c FROM trading_hypotheses`;
      const [ast] = await sql`SELECT COUNT(*)::int AS c FROM trading_assets WHERE is_active = true`;
      const [last] = await sql`SELECT MAX(timestamp) AS t FROM trading_snapshots`;
      const [pt] = await sql`SELECT COUNT(*)::int AS c FROM trading_paper_trades`;
      const [bt] = await sql`SELECT COUNT(*)::int AS c FROM trading_backtest_results`;
      return json(res, {
        total_snapshots: snap.c, total_signals: sig.c, total_hypotheses: hyp.c,
        active_assets: ast.c, last_scan: last.t,
        total_paper_trades: pt.c, total_backtests: bt.c,
      });
    }
    if (path === "/api/health") {
      return json(res, { status: "ok", version: "2.0", timestamp: new Date().toISOString() });
    }

    // ─── Portfolio endpoints ───
    if (path === "/api/portfolio") {
      return json(res, await portfolio.getPortfolioState());
    }
    if (path === "/api/portfolio/equity") {
      return json(res, await equity.getEquityCurve(168));
    }
    if (path === "/api/portfolio/drawdown") {
      return json(res, await equity.getDrawdownSeries(168));
    }
    if (path === "/api/portfolio/allocation") {
      return json(res, await portfolio.getAllocations());
    }
    if (path === "/api/portfolio/returns") {
      return json(res, await equity.getReturns());
    }
    if (path === "/api/portfolio/contribution") {
      return json(res, await portfolio.getStrategyContribution());
    }

    // ─── Risk endpoints ───
    if (path === "/api/risk/status") {
      return json(res, await risk.getRiskStatus());
    }
    if (path === "/api/risk/events") {
      const rows = await sql`
        SELECT * FROM trading_risk_events ORDER BY created_at DESC LIMIT 100`;
      return json(res, rows);
    }

    // ─── Strategy lifecycle endpoints ───
    if (path === "/api/strategies/lifecycle") {
      return json(res, await lifecycle.getLifecycleHistory());
    }
    if (path === "/api/strategies/states") {
      return json(res, await lifecycle.getStrategyStates());
    }

    // ─── Reports ───
    if (path === "/api/reports/daily") {
      return json(res, await equity.generateDailyReport());
    }
    if (path === "/api/reports/weekly") {
      return json(res, await equity.generateWeeklyReport());
    }

    // ─── Alerts ───
    if (path === "/api/alerts") {
      return json(res, await alerts.getRecent());
    }
    if (path === "/api/alerts/unread") {
      return json(res, await alerts.getUnread());
    }

    // ─── Positions ───
    if (path === "/api/positions") {
      const rows = await sql`
        SELECT pt.*, ta.symbol, h.name as hypothesis_name,
          (SELECT ts.price FROM trading_snapshots ts WHERE ts.asset_id = pt.asset_id
           ORDER BY ts.timestamp DESC LIMIT 1) as current_price
        FROM trading_paper_trades pt
        JOIN trading_assets ta ON ta.id = pt.asset_id
        LEFT JOIN trading_hypotheses h ON h.id = pt.hypothesis_id
        WHERE pt.status = 'open'
        ORDER BY pt.entry_time DESC`;
      return json(res, rows);
    }

    // ─── Diagnostics ───
    if (path === "/api/diagnostics") {
      const [ptCount] = await sql`SELECT COUNT(*)::int AS c FROM trading_paper_trades`;
      const [openCount] = await sql`SELECT COUNT(*)::int AS c FROM trading_paper_trades WHERE status = 'open'`;
      const [closedCount] = await sql`SELECT COUNT(*)::int AS c FROM trading_paper_trades WHERE status = 'closed'`;
      const [ptLogs] = await sql`SELECT COUNT(*)::int AS c FROM trading_agent_logs WHERE agent_name = 'paper_trader'`;
      const [lastPtLog] = await sql`SELECT message, created_at FROM trading_agent_logs WHERE agent_name = 'paper_trader' ORDER BY created_at DESC LIMIT 1`;
      const [hypCount] = await sql`SELECT COUNT(*)::int AS c FROM trading_hypotheses WHERE status = 'paper_trading'`;
      const recentLogs = await sql`SELECT agent_name, log_level, message, created_at FROM trading_agent_logs ORDER BY created_at DESC LIMIT 20`;
      return json(res, {
        paper_trader: {
          total_trades: ptCount.c, open_positions: openCount.c,
          closed_positions: closedCount.c, log_count: ptLogs.c,
          last_log: lastPtLog ?? null, hypotheses_in_paper_trading: hypCount.c,
        },
        recent_agent_activity: recentLogs,
        timestamp: new Date().toISOString(),
      });
    }


    // ─── Exit Engine Status ───
    if (path === "/api/exits/status") {
      const status = await exitEngine.getStatus();
      return json(res, { ok: true, positions: status, count: status.length });
    }

    // ─── Exit Engine Summary (closed trades) ───
    if (path === "/api/exits/history") {
      const closed = await sql\`
        SELECT t.id, t.direction, t.entry_price, t.exit_price, t.pnl, t.pnl_pct,
               t.exit_reason, t.entry_time, t.exit_time, t.quantity,
               a.symbol, t.stop_loss, t.take_profit
        FROM trading_paper_trades t
        JOIN trading_assets a ON a.id = t.asset_id
        WHERE t.status = 'closed'
        ORDER BY t.exit_time DESC
        LIMIT 50
      \`;
      return json(res, {
        ok: true, trades: closed, count: closed.length,
        summary: {
          totalTrades: closed.length,
          totalPnl: closed.reduce((s: number, t: any) => s + parseFloat(t.pnl || 0), 0),
          winners: closed.filter((t: any) => parseFloat(t.pnl || 0) > 0).length,
          losers: closed.filter((t: any) => parseFloat(t.pnl || 0) <= 0).length,
          byReason: {
            stop_loss: closed.filter((t: any) => t.exit_reason === 'stop_loss').length,
            take_profit: closed.filter((t: any) => t.exit_reason === 'take_profit').length,
            time_limit: closed.filter((t: any) => t.exit_reason === 'time_limit').length,
          }
        }
      });
    }

    return json(res, { error: "Not found" }, 404);
  } catch (err: any) {
    console.error("API error:", err);
    return json(res, { error: err.message }, 500);
  }
}

export function startAPIServer(port: number): void {
  const pubDir = join(import.meta.dirname ?? ".", "../public");
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    if (url.startsWith("/api/")) return handleAPI(url.split("?")[0], res);
    const filePath = join(pubDir, url === "/" ? "operator.html" : url);
    if (existsSync(filePath)) {
      const ext = extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    } else {
      res.writeHead(404); res.end("Not found");
    }
  });
  server.listen(port, () => { console.log("[API] Server v2 listening on port " + port); });
}
