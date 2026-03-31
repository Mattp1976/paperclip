/**
 * Standalone Scheduler v3 — ASI Trading System
 * ==============================================
 * Now includes Exit Engine for automated position management.
 *
 * Schedule:
 *   - Scanner:           every 5 minutes
 *   - Paper Trader:      every 5 minutes (entries only, with risk checks)
 *   - Exit Engine:       every 5 minutes (stop-loss, take-profit, trailing, time)
 *   - Equity Snapshot:   every 5 minutes
 *   - Hypothesis:        every 6 hours + on startup
 *   - Backtest:          every 6 hours (30s after hypothesis)
 *   - Lifecycle checks:  every 1 hour
 *   - Portfolio rebalance: every 6 hours
 *   - Meta-agent:        weekly Sunday at 08:00 UTC
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./db/schema.js";
import { CryptoScanner } from "./agents/scanner.js";
import { HypothesisAgent } from "./agents/hypothesis.js";
import { BacktestAgent } from "./agents/backtest.js";
import { MetaAgent } from "./agents/meta-agent.js";
import { PaperTrader } from "./agents/paper-trader.js";
import { RiskManager } from "./services/risk-manager.js";
import { PortfolioManager } from "./services/portfolio-manager.js";
import { EquityEngine } from "./services/equity-engine.js";
import { ExitEngine } from "./services/exit-engine.js";
import { LifecycleManager, alertManager } from "./services/lifecycle-manager.js";
import { runV2Migration } from "./db/migrate-v2.js";
import { runV3Migration } from "./db/migrate-v3.js";
import { startAPIServer } from "./api.js";

const DATABASE_URL = process.env.DATABASE_URL;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const KRAKEN_API_KEY = process.env.KRAKEN_API_KEY ?? "";

if (!DATABASE_URL) {
  console.error("[Scheduler] DATABASE_URL is required");
  process.exit(1);
}

const sqlClient = postgres(DATABASE_URL, { max: 5 });
const db = drizzle(sqlClient, { schema });

// ─── Original Agents ───
const scanner = new CryptoScanner(db, KRAKEN_API_KEY);
const hypothesis = new HypothesisAgent(db, ANTHROPIC_API_KEY);
const backtest = new BacktestAgent(db, KRAKEN_API_KEY);
const meta = new MetaAgent(db, ANTHROPIC_API_KEY);

// ─── Services ───
const riskManager = new RiskManager(sqlClient);
const portfolioManager = new PortfolioManager(sqlClient);
const equityEngine = new EquityEngine(sqlClient);
const exitEngine = new ExitEngine(sqlClient);
const lifecycleManager = new LifecycleManager(sqlClient);
const alerts = alertManager(sqlClient);

// ─── Paper Trader with Risk Manager ───
const paperTrader = new PaperTrader(db, riskManager);

function now(): string { return new Date().toISOString(); }

async function runSafe(name: string, fn: () => Promise<any>): Promise<void> {
  const start = Date.now();
  console.log(`[${now()}] Starting ${name}...`);
  try {
    await fn();
    console.log(`[${now()}] ${name} completed in ${((Date.now()-start)/1000).toFixed(1)}s`);
  } catch (err) {
    console.error(`[${now()}] ${name} failed after ${((Date.now()-start)/1000).toFixed(1)}s:`, err);
    try {
      await alerts.create("system_error", "critical",
        `${name} failed`, String(err), { agent: name, duration: Date.now()-start });
    } catch(e) { /* alert logging failed, ignore */ }
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
    setTimeout(async () => {
      await runSafe("Portfolio Rebalance", () => portfolioManager.rebalance());
    }, 30_000);
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
  console.log("[ASI Trading System v3] Scheduler starting...");
  console.log(`[${now()}] Database connected`);

  // Run migrations (idempotent)
  await runV2Migration(sqlClient);
  await runV3Migration(sqlClient);

  // Start API
  startAPIServer(PORT);

  // Initial runs
  await runSafe("Scanner (initial)", () => scanner.runCycle());
  console.log(`[${now()}] Triggering initial hypothesis generation...`);
  await runHypothesisAndBacktest();

  // Initial portfolio rebalance
  setTimeout(async () => {
    await runSafe("Portfolio Rebalance (initial)", () => portfolioManager.rebalance());
  }, 45_000);

  // Paper trader + exit engine start 60s after boot
  setTimeout(async () => {
    console.log(`[${now()}] Running initial trade cycle...`);
    await runSafe("Exit Engine (initial)", () => exitEngine.runCycle());
    await runSafe("Paper Trader (initial)", () => paperTrader.runCycle());
    await runSafe("Equity Snapshot (initial)", () => equityEngine.takeSnapshot());
  }, 60_000);

  // ─── Scheduled intervals ───
  // Every 5 minutes: scan, exit checks, entries, snapshot
  setInterval(() => { runSafe("Scanner", () => scanner.runCycle()); }, 5*60*1000);

  // Exit engine runs BEFORE paper trader so closed positions free up slots
  setInterval(async () => {
    await runSafe("Exit Engine", () => exitEngine.runCycle());
    await runSafe("Paper Trader", () => paperTrader.runCycle());
  }, 5*60*1000);

  setInterval(() => { runSafe("Equity Snapshot", () => equityEngine.takeSnapshot()); }, 5*60*1000);

  // Every hour: lifecycle checks, alert checks
  setInterval(async () => {
    await runSafe("Lifecycle Checks", () => lifecycleManager.runLifecycleChecks());
    await runSafe("Alert Checks", () => alerts.checkAndAlert(sqlClient));
  }, 60*60*1000);

  // Every 6 hours: hypothesis, backtest, rebalance
  setInterval(() => { runHypothesisAndBacktest(); }, 6*60*60*1000);

  // Weekly meta
  setInterval(checkWeeklyMeta, 60*1000);

  console.log(`[${now()}] Scheduler v3 active — all agents and services armed`);
  console.log(`[${now()}]   Agents: Scanner, Hypothesis, Backtest, PaperTrader, Meta`);
  console.log(`[${now()}]   Services: RiskManager, PortfolioManager, EquityEngine, ExitEngine, LifecycleManager, Alerts`);
}

// Export for API access
export { riskManager, portfolioManager, equityEngine, exitEngine, lifecycleManager, alerts };

main().catch((err) => { console.error("[Scheduler] Fatal:", err); process.exit(1); });
