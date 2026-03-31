import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

async function handleAPI(path: string, res: ServerResponse) {
  try {
    if (path === "/api/prices") {
      const rows = await sql`
        SELECT DISTINCT ON (ta.symbol)
          ta.symbol,
          ts.price,
          ts.price_change_1h,
          ts.price_change_24h,
          ts.volume_24h,
          ts.rsi_14,
          ts.timestamp
        FROM trading_snapshots ts
        JOIN trading_assets ta ON ta.id = ts.asset_id
        ORDER BY ta.symbol, ts.timestamp DESC
      `;
      return json(res, rows);
    }

    if (path === "/api/signals") {
      const rows = await sql`
        SELECT
          s.signal_type,
          s.severity,
          s.value,
          s.context,
          s.is_active,
          s.detected_at,
          ta.symbol
        FROM trading_signals s
        JOIN trading_assets ta ON ta.id = s.asset_id
        ORDER BY s.detected_at DESC
        LIMIT 50
      `;
      return json(res, rows);
    }

    if (path === "/api/stats") {
      const [snap] = await sql`SELECT COUNT(*)::int AS c FROM trading_snapshots`;
      const [sig]  = await sql`SELECT COUNT(*)::int AS c FROM trading_signals`;
      const [hyp]  = await sql`SELECT COUNT(*)::int AS c FROM trading_hypotheses`;
      const [ast]  = await sql`SELECT COUNT(*)::int AS c FROM trading_assets WHERE is_active = true`;
      const [last] = await sql`SELECT MAX(timestamp) AS t FROM trading_snapshots`;
      return json(res, {
        total_snapshots: snap.c,
        total_signals: sig.c,
        total_hypotheses: hyp.c,
        active_assets: ast.c,
        last_scan: last.t,
      });
    }

    if (path === "/api/health") {
      return json(res, {
        service: "asi-trading-agents",
        status: "running",
        uptime: Math.floor(process.uptime()),
      });
    }

    json(res, { error: "not found" }, 404);
  } catch (err: any) {
    console.error("API error:", err);
    json(res, { error: err.message }, 500);
  }
}

export function startAPIServer(port: number): void {
  const pub = join(process.cwd(), "public");

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";

    if (url.startsWith("/api/")) {
      return handleAPI(url, res);
    }

    // Static files
    let filePath = url === "/" ? "/index.html" : url;
    const full = join(pub, filePath);

    if (!existsSync(full)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }

    const ext = extname(full);
    const mime = MIME[ext] || "application/octet-stream";
    const body = readFileSync(full);
    res.writeHead(200, { "Content-Type": mime });
    res.end(body);
  });

  server.listen(port, "0.0.0.0", () => {
    console.log("[api] Dashboard + API running on port " + port);
  });
}
