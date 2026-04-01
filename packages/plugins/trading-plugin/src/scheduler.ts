/**
 * Standalone Scheduler v5 — ASI Multi-Market Trading System
 * ===========================================================
 * Now supports multiple market connectors (crypto + equities + more).
 *
 * Schedule:
 *   - Crypto Scanner:    every 5 minutes
 *   - Equity Scanner:    every 5 minutes (when Alpaca keys present)
 *   - Paper Trader:      every 5 minutes (entries only, with risk checks)
 *   - Exit Engine:       every 5 minutes (stop-loss, take-profit, trailing, time)
 *   - Equity Snapshot:   every 5 minutes
 *   - Hypothesis:        every 6 hours + on startup (cross-market aware)
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
import { CorrelationEngine } from "./services/correlation-engine.js";
import { NotificationService } from "./services/notification-service.js";
import { LifecycleManager, alertManager } from "./services/lifecycle-manager.js";
import { runV2Migration } from "./db/migrate-v2.js";
import { runV3Migration } from "./db/migrate-v3.js";
import { runV4Migration } from "./db/migrate-v4.js";
import { startAPIServer } from "./api.js";
import { ConnectorRegistry } from "./connectors/interface.js";
import { AlpacaConnector } from "./connectors/alpaca.js";

const DATABASE_URL = process.env.DATABASE_URL;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const KRAKEN_API_KEY = process.env.KRAKEN_API_KEY ?? "";
const ALPACA_API_KEY = process.env.ALPACA_API_KEY ?? "";
const ALPACA_API_SECRET = process.env.ALPACA_API_SECRET ?? "";

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
const correlationEngine = new CorrelationEngine(sqlClient);
const notifier = new NotificationService(sqlClient);
const lifecycleManager = new LifecycleManager(sqlClient);
const alerts = alertManager(sqlClient);

// ─── Paper Trader with Risk Manager ───
const paperTrader = new PaperTrader(db, riskManager);

// ─── Multi-Market Connectors ───
const connectorRegistry = new ConnectorRegistry();
const hasAlpaca = ALPACA_API_KEY.length > 0 && ALPACA_API_SECRET.length > 0;
let alpacaConnector: AlpacaConnector | null = null;

if (hasAlpaca) {
  alpacaConnector = new AlpacaConnector(db, ALPACA_API_KEY, ALPACA_API_SECRET);
  connectorRegistry.register(alpacaConnector);
  console.log("[Scheduler] Alpaca connector registered (US Equities)");
} else {
  console.log("[Scheduler] No Alpaca keys — equity scanning disabled");
}

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
  console.log("[ASI Trading System v5] Multi-Market Scheduler starting...");
  console.log(`[${now()}] Database connected`);

  // Run migrations (idempotent)
  await runV2Migration(sqlClient);
  await runV3Migration(sqlClient);
  await runV4Migration(sqlClient);

  // Seed equity assets if Alpaca is configured
  if (alpacaConnector) {
    await runSafe("Alpaca Asset Seeding", () => alpacaConnector!.seedAssets());
    // Activate equity assets in DB
    await sqlClient`
      UPDATE trading_assets SET is_active = true
      WHERE asset_class = 'equity' AND exchange = 'alpaca'
    `;
    // Mark Alpaca connector as active
    await sqlClient`
      UPDATE trading_connector_config SET is_active = true WHERE id = 'alpaca'
    `;
    console.log(`[${now()}] Alpaca equity assets activated`);
  }

  // Start API
  startAPIServer(PORT);

  // ─── Initial runs: Crypto ───
  await runSafe("Crypto Scanner (initial)", () => scanner.runCycle());

  // ─── Initial runs: Equities ───
  if (alpacaConnector) {
    await runSafe("Equity Scanner (initial)", async () => {
      const result = await alpacaConnector!.runScanCycle();
      console.log(`[${now()}] Equity scan: ${result.assetsScanned} assets, ${result.signalsDetected} signals`);
    });
  }

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

  // Every 5 minutes: crypto scan
  setInterval(() => { runSafe("Crypto Scanner", () => scanner.runCycle()); }, 5*60*1000);

  // Every 5 minutes: equity scan (when Alpaca keys present)
  if (alpacaConnector) {
    setInterval(async () => {
      await runSafe("Equity Scanner", async () => {
        const result = await alpacaConnector!.runScanCycle();
        // Update connector stats
        await sqlClient`
          UPDATE trading_connector_config
          SET last_scan_at = NOW(), scan_count = scan_count + 1, updated_at = NOW()
          WHERE id = 'alpaca'
        `;
      });
    }, 5*60*1000);
  }

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
    // Send daily summary at ~08:00 UTC
    const utcH = new Date().getUTCHours();
    if (utcH === 8) await runSafe("Daily Summary", () => notifier.sendDailySummary());
  }, 60*60*1000);

  // Every 6 hours: hypothesis, backtest, rebalance
  setInterval(() => { runHypothesisAndBacktest(); }, 6*60*60*1000);

  // Weekly meta
  setInterval(checkWeeklyMeta, 60*1000);

  // ─── Connector health checks (every 30 min) ───
  setInterval(async () => {
    for (const conn of connectorRegistry.getAll()) {
      try {
        const healthy = await conn.isHealthy();
        if (!healthy) {
          console.warn(`[${now()}] Connector ${conn.id} health check FAILED`);
          await sqlClient`
            UPDATE trading_connector_config
            SET last_error = 'Health check failed', error_count = error_count + 1, updated_at = NOW()
            WHERE id = ${conn.id}
          `;
        }
      } catch (err) {
        console.error(`[${now()}] Connector ${conn.id} health check error:`, err);
      }
    }
  }, 30*60*1000);

  const markets = ["crypto"];
  if (hasAlpaca) markets.push("equity");
  console.log(`[${now()}] Scheduler v5 active — multi-market system armed`);
  console.log(`[${now()}]   Markets: ${markets.join(", ")}`);
  console.log(`[${now()}]   Agents: Scanner, Hypothesis, Backtest, PaperTrader, Meta`);
  console.log(`[${now()}]   Services: RiskManager, PortfolioManager, EquityEngine, ExitEngine, CorrelationEngine, Notifier, LifecycleManager, Alerts`);
  console.log(`[${now()}]   Connectors: ${connectorRegistry.getAll().map(c => c.name).join(", ") || "crypto (built-in)"}`);
}

// Export for API access
export { riskManager, portfolioManager, equityEngine, exitEngine, correlationEngine, notifier, lifecycleManager, alerts, connectorRegistry, alpacaConnector };

main().catch((err) => { console.error("[Scheduler] Fatal:", err); process.exit(1); });
