import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css",
  ".js": "application/javascript", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml",
};

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=10" });
  res.end(JSON.stringify(data));
}

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = req.url === "/" ? "/index.html" : (req.url || "/index.html");
  const safePath = url.split("?")[0].split("#")[0];
  const fullPath = join(process.cwd(), "public", safePath);
  if (!existsSync(fullPath)) {
    const idx = join(process.cwd(), "public", "index.html");
    if (existsSync(idx)) { res.writeHead(200, {"Content-Type":"text/html; charset=utf-8"}); res.end(readFileSync(idx)); return; }
    res.writeHead(404); res.end("Not Found"); return;
  }
  const ext = extname(fullPath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  res.end(readFileSync(fullPath));
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || "/";
  try {
    if (url === "/api/prices") {
      const rows = await sql\`SELECT DISTINCT ON (a.symbol) a.symbol, a.name, s.price, s.volume_24h, s.rsi_14, s.funding_rate, s.volume_ratio, s.created_at FROM trading_assets a JOIN trading_snapshots s ON s.asset_id = a.id WHERE a.is_active = true ORDER BY a.symbol, s.created_at DESC\`;
      json(res, rows);
    } else if (url === "/api/signals") {
      const rows = await sql\`SELECT s.signal_type, s.direction, s.strength, s.confidence, s.metadata, s.created_at, a.symbol, a.name FROM trading_signals s JOIN trading_assets a ON a.id = s.asset_id ORDER BY s.created_at DESC LIMIT 50\`;
      json(res, rows);
    } else if (url === "/api/stats") {
      const [sn] = await sql\`SELECT COUNT(*)::int AS c FROM trading_snapshots\`;
      const [si] = await sql\`SELECT COUNT(*)::int AS c FROM trading_signals\`;
      const [a2] = await sql\`SELECT COUNT(*)::int AS c FROM trading_assets WHERE is_active = true\`;
      const [hy] = await sql\`SELECT COUNT(*)::int AS c FROM trading_hypotheses\`;
      const [lo] = await sql\`SELECT COUNT(*)::int AS c FROM trading_agent_logs\`;
      const [la] = await sql\`SELECT MAX(created_at) AS t FROM trading_snapshots\`;
      json(res, { total_snapshots: sn.c, total_signals: si.c, active_assets: a2.c, total_hypotheses: hy.c, total_agent_logs: lo.c, last_scan: la.t, uptime_seconds: Math.floor(process.uptime()) });
    } else if (url === "/api/health") {
      json(res, { service: "asi-trading-agents", status: "running", uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
    } else if (url.startsWith("/api/")) {
      json(res, { error: "Not Found" }, 404);
    } else {
      serveStatic(req, res);
    }
  } catch (err: any) {
    console.error("[API] Error:", err.message);
    json(res, { error: "Internal server error" }, 500);
  }
}

export function startAPIServer(port: number): void {
  const server = createServer(handleRequest);
  server.listen(port, "0.0.0.0", () => { console.log("[API] Dashboard + API on port " + port); });
}