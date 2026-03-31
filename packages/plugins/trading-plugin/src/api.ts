import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
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
        SELECT h.id, h.title, h.status, h.direction, h.timeframe,
          h.confidence_score, h.created_at, h.updated_at,
          h.entry_rules, h.exit_rules, h.risk_params,
          ta.symbol
        FROM trading_hypotheses h
        JOIN trading_assets ta ON ta.id = h.asset_id
        ORDER BY h.created_at DESC LIMIT 50`;
      return json(res, rows);
    }

    if (path === "/api/paper-trades") {
      const rows = await sql`
        SELECT pt.id, pt.direction, pt.entry_price, pt.exit_price,
          pt.quantity, pt.pnl, pt.pnl_pct, pt.status, pt.exit_reason,
          pt.opened_at, pt.closed_at,
          ta.symbol, h.title as hypothesis_title
        FROM trading_paper_trades pt
        JOIN trading_assets ta ON ta.id = pt.asset_id
        LEFT JOIN trading_hypotheses h ON h.id = pt.hypothesis_id
        ORDER BY pt.opened_at DESC LIMIT 100`;
      return json(res, rows);
    }

    if (path === "/api/backtest-results") {
      const rows = await sql`
        SELECT br.id, br.sharpe_ratio, br.win_rate, br.max_drawdown,
          br.total_trades, br.total_return, br.profit_factor,
          br.avg_trade_pnl, br.created_at,
          h.title as hypothesis_title, h.status as hypothesis_status,
          ta.symbol
        FROM trading_backtest_results br
        JOIN trading_hypotheses h ON h.id = br.hypothesis_id
        JOIN trading_assets ta ON ta.id = h.asset_id
        ORDER BY br.created_at DESC LIMIT 50`;
      return json(res, rows);
    }

    if (path === "/api/agent-logs") {
      const rows = await sql`
        SELECT agent_name, action, details, created_at
        FROM trading_agent_logs
        ORDER BY created_at DESC LIMIT 100`;
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

    if (path === "/api/portfolio") {
      const open = await sql`
        SELECT pt.direction, pt.entry_price, pt.quantity, pt.opened_at,
          ta.symbol,
          (SELECT ts.price FROM trading_snapshots ts WHERE ts.asset_id = pt.asset_id ORDER BY ts.timestamp DESC LIMIT 1) as current_price
        FROM trading_paper_trades pt
        JOIN trading_assets ta ON ta.id = pt.asset_id
        WHERE pt.status = 'open'
        ORDER BY pt.opened_at DESC`;

      const closed = await sql`
        SELECT COALESCE(SUM(pnl), 0) as total_pnl,
          COUNT(*) as total_trades,
          COUNT(*) FILTER (WHERE pnl > 0) as winning_trades,
          COUNT(*) FILTER (WHERE pnl <= 0) as losing_trades,
          COALESCE(AVG(pnl_pct), 0) as avg_pnl_pct
        FROM trading_paper_trades
        WHERE status = 'closed'`;

      const equity = await sql`
        SELECT DATE_TRUNC('hour', closed_at) as time,
          SUM(pnl) OVER (ORDER BY closed_at) as cumulative_pnl
        FROM trading_paper_trades
        WHERE status = 'closed'
        ORDER BY closed_at`;

      return json(res, {
        open_positions: open,
        performance: closed[0],
        equity_curve: equity
      });
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
        total_snapshots: snap.c,
        total_signals: sig.c,
        total_hypotheses: hyp.c,
        active_assets: ast.c,
        last_scan: last.t,
        total_paper_trades: pt.c,
        total_backtests: bt.c
      });
    }

    if (path === "/api/health") {
      return json(res, { status: "ok", timestamp: new Date().toISOString() });
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

    if (url.startsWith("/api/")) {
      return handleAPI(url.split("?")[0], res);
    }

    const filePath = join(pubDir, url === "/" ? "index.html" : url);
    if (existsSync(filePath)) {
      const ext = extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(port, () => {
    console.log("[API] Server listening on port " + port);
  });
}
