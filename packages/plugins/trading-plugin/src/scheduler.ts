/**
 * Standalone Scheduler — ASI Trading System
 * ==========================================
 * Runs all agents on aggressive schedules for active learning.
 *
 * Schedule:
 *   - Scanner:      every 5 minutes
 *   - Hypothesis:   every 6 hours + on startup after first scan
 *   - Backtest:     every 6 hours (30s after hypothesis)
 *   - Paper Trader: every 5 minutes (alongside scanner)
 *   - Meta-agent:   weekly Sunday at 08:00 UTC
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./db/schema.js";
import { CryptoScanner } from "./agents/scanner.js";
import { HypothesisAgent } from "./agents/hypothesis.js";
import { BacktestAgent } from "./agents/backtest.js";
import { MetaAgent } from "./agents/meta-agent.js";
import { PaperTrader } from "./agents/paper-trader.js";
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
const paperTrader = new PaperTrader(db);

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

let lastHypRun = 0;
let lastMetaWeek = -1;

async function runHypothesisAndBacktest(): Promise<void> {
  const t = Date.now();
  if (t - lastHypRun < 5 * 60 * 60 * 1000) return;
  lastHypRun = t;
  await runSafe("Hypothesis Agent", () => hypothesis.runCycle(10));
  setTimeout(async () => {
    await runSafe("Backtest Agent", () => backtest.runCycle());
  }, 30_000);
}

function checkWeeklyMeta(): void {
  const utcNow = new Date();
  const dow = utcNow.getUTCDay();
  const hour = utcNow.getUTCHours();
  const minute = utcNow.getUTCMinutes();
  const weekNum = Math.floor(utcNow.getTime() / (7*24*60*60*1000));
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

  console.log(`[${now()}] Triggering initial hypothesis generation...`);
  await runHypothesisAndBacktest();

  // Run paper trader immediately on startup (delayed 60s to allow initial data to settle)
  setTimeout(async () => {
    console.log(`[${now()}] Running initial Paper Trader cycle...`);
    await runSafe("Paper Trader (initial)", () => paperTrader.runCycle());
  }, 60_000);

  setInterval(() => { runSafe("Scanner", () => scanner.runCycle()); }, 5*60*1000);
  setInterval(() => { runSafe("Paper Trader", () => paperTrader.runCycle()); }, 5*60*1000);
  setInterval(() => { runHypothesisAndBacktest(); }, 6*60*60*1000);
  setInterval(checkWeeklyMeta, 60*1000);

  console.log(`[${now()}] Scheduler active — all agents armed`);
}

main().catch((err) => { console.error("[Scheduler] Fatal:", err); process.exit(1); });
