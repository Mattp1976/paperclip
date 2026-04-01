/**
 * Unified Market Connector Interface
 * ====================================
 * Every market (crypto, equities, forex, futures) implements this interface.
 * The intelligence layer (Scanner → Hypothesis → Backtest → Trader) consumes
 * a standardised data format regardless of the underlying exchange/broker.
 */

import type { AssetClass } from "../types/index.js";

// ─── Market Connector Interface ─────────────────────────────
export interface MarketConnector {
  /** Unique identifier for this connector (e.g. "kraken", "alpaca", "oanda") */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Which asset class this connector serves */
  readonly assetClass: AssetClass;

  /** Whether this connector is currently active and healthy */
  isHealthy(): Promise<boolean>;

  /** Run a full scan cycle — fetch prices, compute indicators, write snapshots + signals */
  runScanCycle(): Promise<ScanResult>;

  /** Fetch current price for a single symbol */
  getPrice(symbol: string): Promise<number | null>;

  /** Fetch OHLCV bars for a symbol */
  getOHLCV(symbol: string, interval: OHLCVInterval, bars: number): Promise<OHLCVBar[]>;

  /** Get all tradeable symbols from this connector */
  getSymbols(): Promise<string[]>;

  /** Get market-specific metadata (funding rates for crypto, earnings for equities, etc.) */
  getMarketMeta(symbol: string): Promise<Record<string, unknown>>;
}

// ─── Shared Types ───────────────────────────────────────────
export interface ScanResult {
  connector: string;
  assetsScanned: number;
  signalsDetected: number;
  errors: string[];
  durationMs: number;
}

export type OHLCVInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface OHLCVBar {
  time: number;    // Unix timestamp seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── Connector Registry ─────────────────────────────────────
/**
 * Central registry of all market connectors.
 * The scheduler iterates over active connectors to run scan cycles.
 */
export class ConnectorRegistry {
  private connectors = new Map<string, MarketConnector>();

  register(connector: MarketConnector): void {
    this.connectors.set(connector.id, connector);
    console.log(`[ConnectorRegistry] Registered: ${connector.name} (${connector.assetClass})`);
  }

  get(id: string): MarketConnector | undefined {
    return this.connectors.get(id);
  }

  getAll(): MarketConnector[] {
    return Array.from(this.connectors.values());
  }

  getByAssetClass(assetClass: AssetClass): MarketConnector[] {
    return this.getAll().filter(c => c.assetClass === assetClass);
  }

  async getHealthStatus(): Promise<Record<string, boolean>> {
    const status: Record<string, boolean> = {};
    for (const [id, connector] of this.connectors) {
      try {
        status[id] = await connector.isHealthy();
      } catch {
        status[id] = false;
      }
    }
    return status;
  }
}
