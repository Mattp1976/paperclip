/**
 * Paperclip Trading Plugin — Main Entry Point
 * =============================================
 * Registers the ASI Trading System as a Paperclip plugin.
 *
 * Agents:
 *   - Scanner: Monitors 30 crypto assets every 5 min, detects signals
 *   - Hypothesis: Generates testable trading strategies from signals
 *   - Backtest: Runs hypotheses against 90 days of historical data
 *   - Meta-Agent: Weekly review — promotes, retires, evolves hypotheses
 *
 * Integrates with Paperclip's:
 *   - Plugin SDK for worker registration and lifecycle
 *   - PostgreSQL via Drizzle ORM (shared database)
 *   - Task system for scheduling agent cycles
 *   - Dashboard UI for monitoring
 */

import { CryptoScanner } from "./agents/scanner.js";
import { HypothesisAgent } from "./agents/hypothesis.js";
import { BacktestAgent } from "./agents/backtest.js";
import { MetaAgent } from "./agents/meta-agent.js";
import { DEFAULT_CONFIG, type TradingPluginConfig } from "./types/index.js";

export interface TradingPluginContext {
  db: any;  // Drizzle database instance from Paperclip
  anthropicApiKey: string;
  krakenApiKey: string;
  krakenApiSecret: string;
  config?: Partial<TradingPluginConfig>;
}

export class TradingPlugin {
  private scanner: CryptoScanner;
  private hypothesisAgent: HypothesisAgent;
  private backtestAgent: BacktestAgent;
  private metaAgent: MetaAgent;
  private config: TradingPluginConfig;
  private scannerInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private ctx: TradingPluginContext) {
    this.config = { ...DEFAULT_CONFIG, ...ctx.config };

    this.scanner = new CryptoScanner(ctx.db, ctx.krakenApiKey);
    this.hypothesisAgent = new HypothesisAgent(ctx.db, ctx.anthropicApiKey);
    this.backtestAgent = new BacktestAgent(ctx.db, ctx.krakenApiKey);
    this.metaAgent = new MetaAgent(ctx.db, ctx.anthropicApiKey);
  }

  /**
   * Start the trading plugin — begins the scanner loop.
   * Hypothesis, backtest, and meta cycles are triggered separately
   * via Paperclip's task scheduler or cron.
   */
  async start(): Promise<void> {
    console.log("[Trading Plugin] Starting ASI Trading System...");
    console.log(`[Trading Plugin] Phase: ${this.config.phase}`);
    console.log(`[Trading Plugin] Scanner interval: ${this.config.scannerIntervalSeconds}s`);

    // Run initial scan immediately
    await this.scanner.runCycle();

    // Set up recurring scanner
    this.scannerInterval = setInterval(
      () => this.scanner.runCycle().catch(console.error),
      this.config.scannerIntervalSeconds * 1000
    );

    console.log("[Trading Plugin] Scanner running. System active.");
  }

  /**
   * Stop all trading activity.
   */
  async stop(): Promise<void> {
    if (this.scannerInterval) {
      clearInterval(this.scannerInterval);
      this.scannerInterval = null;
    }
    console.log("[Trading Plugin] Stopped.");
  }

  /**
   * Run a hypothesis generation cycle.
   * Call daily via Paperclip's cron/task system.
   */
  async runHypothesisCycle(): Promise<void> {
    await this.hypothesisAgent.runCycle(this.config.maxActiveHypotheses);
  }

  /**
   * Run a backtest cycle on all testable hypotheses.
   * Call daily via Paperclip's cron/task system.
   */
  async runBacktestCycle(): Promise<void> {
    await this.backtestAgent.runCycle();
  }

  /**
   * Run the meta-agent review.
   * Call weekly via Paperclip's cron/task system.
   */
  async runMetaCycle(): Promise<void> {
    await this.metaAgent.runCycle();
  }

  /**
   * Get current system status for the dashboard.
   */
  async getStatus(): Promise<{
    phase: number;
    scannerActive: boolean;
    assetCount: number;
    signalCount24h: number;
    activeHypotheses: number;
    lastScan: Date | null;
    lastMetaCycle: Date | null;
  }> {
    return {
      phase: this.config.phase,
      scannerActive: this.scannerInterval !== null,
      assetCount: await this.scanner.getAssetCount(),
      signalCount24h: await this.scanner.getSignalCount24h(),
      activeHypotheses: await this.hypothesisAgent.getActiveCount(),
      lastScan: await this.scanner.getLastScanTime(),
      lastMetaCycle: await this.metaAgent.getLastCycleDate(),
    };
  }
}

// ─── Plugin Registration ────────────────────────────────────
// This is the shape Paperclip expects for plugin registration.
// The actual registration pattern depends on whether you use
// the Plugin SDK worker pattern or register via routines.
export const PLUGIN_MANIFEST = {
  name: "trading",
  displayName: "ASI Trading System",
  version: "0.1.0",
  description: "Self-improving agent swarm for market analysis and automated trading",
  author: "Paperclip",
  capabilities: [
    "market_scanning",
    "hypothesis_generation",
    "backtesting",
    "paper_trading",
    "meta_optimization",
  ],
  requiredSecrets: [
    "ANTHROPIC_API_KEY",
    "KRAKEN_API_KEY",
    "KRAKEN_API_SECRET",
  ],
  scheduledJobs: [
    {
      name: "scanner",
      description: "Monitor crypto markets for signals",
      interval: "*/5 * * * *",  // Every 5 minutes
      handler: "runScannerCycle",
    },
    {
      name: "hypothesis",
      description: "Generate trading hypotheses from signals",
      cron: "0 6 * * *",  // Daily at 06:00 UTC
      handler: "runHypothesisCycle",
    },
    {
      name: "backtest",
      description: "Backtest hypotheses against historical data",
      cron: "0 7 * * *",  // Daily at 07:00 UTC
      handler: "runBacktestCycle",
    },
    {
      name: "meta_review",
      description: "Weekly review — promote, retire, evolve hypotheses",
      cron: "0 8 * * 0",  // Sunday at 08:00 UTC
      handler: "runMetaCycle",
    },
  ],
};
