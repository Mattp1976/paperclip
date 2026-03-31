/**
 * Standalone Scheduler — ASI Trading System
 * ==========================================
 * Runs all four agents on their respective schedules.
 * Designed to run as a standalone service alongside Paperclip,
 * sharing the same PostgreSQL database.
 *
 * Schedule:
 *   - Scanner:    every 5 minutes
 *   - Hypothesis: daily at 06:00 UTC
 *   - Backtest:   daily at 07:00 UTC
 *   - Meta-agent: weekly Sunday at 08:00 UTC
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./db/schema.js";
import { CryptoScanner } from "./agents/scanner.js";
import { HypothesisAgent } from "./agents/hypothesis.js";
import { BacktestAgent } from "./agents/backtest.js";
import { MetaAgent } from "./agents/meta-agent.js";

// ─── Environment ───────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const KRAKEN_API_KEY = process.env.KRAKEN_API_KEY ?? "";

if (!DATABASE_URL) {
  console.error("[Scheduler] DATABASE_URL is required");
  process.exit(1);
}

// ─── Database ──────────────────────────────────────────────
const sql = postgres(DATABASE_URL, { max: 5 });
const db = drizzle(sql, { schema });

// ─── Agents ────────────────────────────────────────────────
const scanner = new CryptoScanner(db, KRAKEN_API_KEY);
const hypothesis = new HypothesisAgent(db, ANTHROPIC_API_KEY);
const backtest = new BacktestAgent(db, KRAKEN_API_KEY);
const meta = new MetaAgent(db, ANTHROPIC_API_KEY);

// ─── Helpers ───────────────────────────────────────────────
function now(): string {
  return new Date().toISOString();
}

async function runSafe(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  console.log(`[${now()}] ▶ Starting ${name}...`);
  try {
    await fn();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[${now()}] ✓ ${name} completed in ${elapsed}s`);
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`[${now()}] ✗ ${name} failed after ${elapsed}s:`, err);
  }
}

// ─── Schedule Logic ────────────────────────────────────────
// Simple cron-like scheduler using setInterval + hour/minute checks

let lastHypothesisDay = -1;
let lastBacktestDay = -1;
let lastMetaWeek = -1;

function checkDailyAndWeeklyJobs(): void {
  const utcNow = new Date();
  const hour = utcNow.getUTCHours();
  const minute = utcNow.getUTCMinutes();
  const day = utcNow.getUTCDate();
  const dow = utcNow.getUTCDay(); // 0 = Sunday
  const weekNum = Math.floor(utcNow.getTime() / (7 * 24 * 60 * 60 * 1000));

  // Hypothesis: daily at 06:00 UTC
  if (hour === 6 && minute < 5 && lastHypothesisDay !== day) {
    lastHypothesisDay = day;
    runSafe("Hypothesis Agent", () => hypothesis.runCycle(10));
  }

  // Backtest: daily at 07:00 UTC
  if (hour === 7 && minute < 5 && lastBacktestDay !== day) {
    lastBacktestDay = day;
    runSafe("Backtest Agent", () => backtest.runCycle());
  }

  // Meta-agent: Sunday at 08:00 UTC
  if (dow === 0 && hour === 8 && minute < 5 && lastMetaWeek !== weekNum) {
    lastMetaWeek = weekNum;
    runSafe("Meta-Agent", () => meta.runCycle());
  }
}

// ─── Health Check Server ───────────────────────────────────
import { createServer } from "node:http";

const PORT = parseInt(process.env.PORT ?? "3200", 10);
const healthServer = createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      service: "asi-trading-agents",
      status: "running",
      uptime: process.uptime(),
      timestamp: now(),
    }));
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

// ─── Main ──────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   ASI Trading System — Standalone Scheduler  ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`[${now()}] Database connected`);
  console.log(`[${now()}] Kraken API key: ${KRAKEN_API_KEY ? "configured" : "NOT SET (public endpoints only)"}`);
  console.log(`[${now()}] Anthropic key: ${ANTHROPIC_API_KEY ? "configured" : "NOT SET"}`);
  console.log("");

  // Start health check server
  healthServer.listen(PORT, () => {
    console.log(`[${now()}] Health check server on port ${PORT}`);
  });

  // Run initial scanner cycle immediately
  await runSafe("Scanner (initial)", () => scanner.runCycle());

  // Scanner: every 5 minutes
  setInterval(() => {
    runSafe("Scanner", () => scanner.runCycle());
  }, 5 * 60 * 1000);

  // Check daily/weekly jobs every minute
  setInterval(checkDailyAndWeeklyJobs, 60 * 1000);

  console.log(`[${now()}] Scheduler active — Scanner every 5m, Hypothesis @ 06:00, Backtest @ 07:00, Meta @ Sunday 08:00`);
}

main().catch((err) => {
  console.error("[Scheduler] Fatal error:", err);
  process.exit(1);
});
