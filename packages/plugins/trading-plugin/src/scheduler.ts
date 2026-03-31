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
import { startAPIServer } from "./api.js";

const DATABASE_URL = process.env.DATABASE_URL;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const KRAKEN_API_KEY = process.env.KRAKEN_API_KEY ?? "";

if (!DATABASE_URL) {
  console.error("[Scheduler] DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 5 });
const db = drizzle(sql, { schema });

const scanner = new CryptoScanner(db, KRAKEN_API_KEY);
const hypothesis = new HypothesisAgent(db, ANTHROPIC_API_KEY);
const backtest = new BacktestAgent(db, KRAKEN_API_KEY);
const meta = new MetaAgent(db, ANTHROPIC_API_KEY);

function now(): string { return new Date().toISOString(); }

async function runSafe(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  console.log(`[${now()}] Starting ${name}...`);
  try {
    await fn();
    console.log(`[${now()}] ${name} completed in ${((Date.now()-start)/1000).toFixed(1)}s`);
  } catch (err) {
    console.error(`[${now()}] ${name} failed after ${((Date.now()-start)/1000).toFixed(1)}s:`, err);
  }
}

let lastHypothesisDay = -1;
let lastBacktestDay = -1;
let lastMetaWeek = -1;

function checkDailyAndWeeklyJobs(): void {
  const utcNow = new Date();
  const hour = utcNow.getUTCHours();
  const minute = utcNow.getUTCMinutes();
  const day = utcNow.getUTCDate();
  const dow = utcNow.getUTCDay();
  const weekNum = Math.floor(utcNow.getTime() / (7*24*60*60*1000));

  if (hour === 6 && minute < 5 && lastHypothesisDay !== day) {
    lastHypothesisDay = day;
    runSafe("Hypothesis Agent", () => hypothesis.runCycle(10));
  }
  if (hour === 7 && minute < 5 && lastBacktestDay !== day) {
    lastBacktestDay = day;
    runSafe("Backtest Agent", () => backtest.runCycle());
  }
  if (dow === 0 && hour === 8 && minute < 5 && lastMetaWeek !== weekNum) {
    lastMetaWeek = weekNum;
    runSafe("Meta-Agent", () => meta.runCycle());
  }
}

const PORT = parseInt(process.env.PORT ?? "3200", 10);

async function main(): Promise<void> {
  console.log("[ASI Trading System] Scheduler starting...");
  console.log(`[${now()}] Database connected`);
  console.log(`[${now()}] Kraken key: ${KRAKEN_API_KEY ? "set" : "NOT SET"}`);
  console.log(`[${now()}] Anthropic key: ${ANTHROPIC_API_KEY ? "set" : "NOT SET"}`);

  startAPIServer(PORT);

  await runSafe("Scanner (initial)", () => scanner.runCycle());

  setInterval(() => { runSafe("Scanner", () => scanner.runCycle()); }, 5*60*1000);
  setInterval(checkDailyAndWeeklyJobs, 60*1000);

  console.log(`[${now()}] Scheduler active`);
}

main().catch((err) => { console.error("[Scheduler] Fatal:", err); process.exit(1); });
