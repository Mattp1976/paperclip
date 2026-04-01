/**
 * Interactive Brokers Connector — Futures & Commodities
 * =====================================================
 * Connects to IBKR's Client Portal Web API for:
 *   - Futures (ES, NQ, YM, RTY, CL, GC, SI, NG, ZB, ZN)
 *   - Paper trading via IBKR paper account
 *
 * IBKR Client Portal API: https://www.interactivebrokers.com/api/doc.html
 * Gateway URL (local): https://localhost:5000/v1/api
 * Gateway URL (cloud): configured per-account
 *
 * NOTE: IBKR requires their Client Portal Gateway running locally or
 * IBKR's Web API with OAuth. For Paperclip, we use their Web API
 * with a simplified REST interface.
 */

import { eq, and } from "drizzle-orm";
import {
  tradingAssets,
  tradingSnapshots,
  tradingSignals,
  tradingAgentLogs,
} from "../db/schema.js";
import type { AssetClass } from "../types/index.js";
import type {
  MarketConnector,
  ScanResult,
  OHLCVBar,
  OHLCVInterval,
} from "./interface.js";

// ─── Config ─────────────────────────────────────────────────
// IBKR Client Portal Gateway — user configures their gateway URL
const DEFAULT_GATEWAY_URL = "https://localhost:5000/v1/api";

// Default futures universe — liquid contracts
const DEFAULT_FUTURES_UNIVERSE = [
  // Equity index futures
  { symbol: "ES", name: "E-mini S&P 500", exchange: "CME", conId: 0, multiplier: 50 },
  { symbol: "NQ", name: "E-mini Nasdaq 100", exchange: "CME", conId: 0, multiplier: 20 },
  { symbol: "YM", name: "E-mini Dow Jones", exchange: "CBOT", conId: 0, multiplier: 5 },
  { symbol: "RTY", name: "E-mini Russell 2000", exchange: "CME", conId: 0, multiplier: 50 },
  // Micro futures (popular with smaller accounts)
  { symbol: "MES", name: "Micro E-mini S&P 500", exchange: "CME", conId: 0, multiplier: 5 },
  { symbol: "MNQ", name: "Micro E-mini Nasdaq 100", exchange: "CME", conId: 0, multiplier: 2 },
  // Energy
  { symbol: "CL", name: "Crude Oil WTI", exchange: "NYMEX", conId: 0, multiplier: 1000 },
  { symbol: "NG", name: "Natural Gas", exchange: "NYMEX", conId: 0, multiplier: 10000 },
  // Metals
  { symbol: "GC", name: "Gold", exchange: "COMEX", conId: 0, multiplier: 100 },
  { symbol: "SI", name: "Silver", exchange: "COMEX", conId: 0, multiplier: 5000 },
  { symbol: "HG", name: "Copper", exchange: "COMEX", conId: 0, multiplier: 25000 },
  // Treasuries
  { symbol: "ZB", name: "30-Year Treasury Bond", exchange: "CBOT", conId: 0, multiplier: 1000 },
  { symbol: "ZN", name: "10-Year Treasury Note", exchange: "CBOT", conId: 0, multiplier: 1000 },
  { symbol: "ZF", name: "5-Year Treasury Note", exchange: "CBOT", conId: 0, multiplier: 1000 },
  // Agriculture
  { symbol: "ZC", name: "Corn", exchange: "CBOT", conId: 0, multiplier: 50 },
  { symbol: "ZS", name: "Soybeans", exchange: "CBOT", conId: 0, multiplier: 50 },
  { symbol: "ZW", name: "Wheat", exchange: "CBOT", conId: 0, multiplier: 50 },
  // Currencies (futures, not spot)
  { symbol: "6E", name: "Euro FX", exchange: "CME", conId: 0, multiplier: 125000 },
  { symbol: "6B", name: "British Pound", exchange: "CME", conId: 0, multiplier: 62500 },
  { symbol: "6J", name: "Japanese Yen", exchange: "CME", conId: 0, multiplier: 12500000 },
];

// Signal thresholds for futures
const FUTURES_RSI_OVERSOLD = 25;
const FUTURES_RSI_OVERBOUGHT = 75;
const FUTURES_VOLUME_SPIKE = 3.0;
const FUTURES_DRAWDOWN_THRESHOLD = -0.05;

/**
 * Map OHLCV interval to IBKR bar period.
 * IBKR uses: 1min, 5min, 15min, 1h, 4h, 1d
 */
function toIBKRPeriod(interval: OHLCVInterval): string {
  const map: Record<OHLCVInterval, string> = {
    "1m": "1min", "5m": "5min", "15m": "15min",
    "1h": "1h", "4h": "4h", "1d": "1d",
  };
  return map[interval] ?? "1h";
}

export class IBKRConnector implements MarketConnector {
  readonly id = "ibkr";
  readonly name = "Interactive Brokers (Futures)";
  readonly assetClass: AssetClass = "commodity";

  private gatewayUrl: string;
  private accountId: string;
  private db: any;

  constructor(
    db: any,
    gatewayUrl: string,
    accountId: string,
  ) {
    this.db = db;
    this.gatewayUrl = gatewayUrl || DEFAULT_GATEWAY_URL;
    this.accountId = accountId;
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
    };
  }

  // ─── MarketConnector Interface ───────────────────────────

  async isHealthy(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.gatewayUrl}/iserver/auth/status`, {
        headers: this.headers,
      });
      if (!resp.ok) return false;
      const data = await resp.json() as any;
      return data.authenticated === true;
    } catch {
      return false;
    }
  }

  async runScanCycle(): Promise<ScanResult> {
    const start = Date.now();
    const errors: string[] = [];
    let scanned = 0;
    let signals = 0;

    const assets = await this.getActiveAssets();
    console.log(`[IBKR] Scanning ${assets.length} futures contracts...`);

    for (const asset of assets) {
      try {
        const ticker = asset.symbol.replace("/USD", "");

        // Fetch current market data via IBKR snapshot
        const snapshot = await this.fetchSnapshot(ticker);
        if (!snapshot) {
          console.log(`[IBKR] No snapshot for ${ticker}`);
          continue;
        }

        // Fetch historical bars
        const bars = await this.fetchHistoricalBars(ticker, "1h", 168);
        const closes = bars.map(b => b.close);
        const volumes = bars.map(b => b.volume);
        const rsi = computeRSI(closes);
        const volumeRatio = computeVolumeRatio(volumes);

        const price = snapshot.lastPrice ?? 0;
        const prevClose = snapshot.prevClose ?? price;
        const dayHigh = snapshot.high ?? price;
        const dayLow = snapshot.low ?? price;
        const dayVolume = snapshot.volume ?? 0;
        const priceChange24h = prevClose > 0 ? (price - prevClose) / prevClose : 0;

        let priceChange1h: number | undefined;
        if (closes.length >= 2) {
          const prev = closes[closes.length - 2];
          if (prev > 0) priceChange1h = (price - prev) / prev;
        }

        // Write snapshot to DB
        await this.db.insert(tradingSnapshots).values({
          assetId: asset.id,
          timestamp: new Date(),
          price: String(price),
          volume24h: dayVolume ? String(dayVolume) : null,
          priceChange1h: priceChange1h != null ? String(priceChange1h) : null,
          priceChange24h: String(priceChange24h),
          high24h: String(dayHigh),
          low24h: String(dayLow),
          rsi14: rsi != null ? String(rsi) : null,
          volumeRatio: volumeRatio != null ? String(volumeRatio) : null,
          fundingRate: null,
          rawData: { exchange: "ibkr", ticker, dayVolume },
        });

        // Detect signals
        const sigCount = await this.detectSignals(asset, {
          price, priceChange24h, priceChange1h,
          rsi, volumeRatio, dayHigh, dayLow,
        }, closes, volumes);
        signals += sigCount;
        scanned++;

      } catch (err) {
        const msg = `Scan failed for ${asset.symbol}: ${err}`;
        errors.push(msg);
        console.error(`[IBKR] ${msg}`);
      }
    }

    await this.log("info", `Scan cycle complete: ${scanned}/${assets.length} futures, ${signals} signals`);
    console.log(`[IBKR] Cycle complete: ${scanned} futures, ${signals} signals`);

    return {
      connector: this.id,
      assetsScanned: scanned,
      signalsDetected: signals,
      errors,
      durationMs: Date.now() - start,
    };
  }

  async getPrice(symbol: string): Promise<number | null> {
    try {
      const ticker = symbol.replace("/USD", "");
      const snapshot = await this.fetchSnapshot(ticker);
      return snapshot?.lastPrice ?? null;
    } catch {
      return null;
    }
  }

  async getOHLCV(symbol: string, interval: OHLCVInterval, bars: number): Promise<OHLCVBar[]> {
    const ticker = symbol.replace("/USD", "");
    return this.fetchHistoricalBars(ticker, toIBKRPeriod(interval), bars);
  }

  async getSymbols(): Promise<string[]> {
    return DEFAULT_FUTURES_UNIVERSE.map(f => `${f.symbol}/USD`);
  }

  async getMarketMeta(symbol: string): Promise<Record<string, unknown>> {
    const ticker = symbol.replace("/USD", "");
    const future = DEFAULT_FUTURES_UNIVERSE.find(f => f.symbol === ticker);
    return {
      name: future?.name ?? ticker,
      exchange: future?.exchange ?? "unknown",
      multiplier: future?.multiplier ?? 1,
      type: "FUT",
    };
  }

  // ─── IBKR-Specific Methods ──────────────────────────────

  async getAccount(): Promise<Record<string, unknown>> {
    try {
      const resp = await fetch(
        `${this.gatewayUrl}/portfolio/${this.accountId}/summary`,
        { headers: this.headers }
      );
      if (!resp.ok) return {};
      return await resp.json();
    } catch {
      return {};
    }
  }

  async getPositions(): Promise<any[]> {
    try {
      const resp = await fetch(
        `${this.gatewayUrl}/portfolio/${this.accountId}/positions`,
        { headers: this.headers }
      );
      if (!resp.ok) return [];
      return await resp.json();
    } catch {
      return [];
    }
  }

  async submitOrder(params: {
    conId: number;
    side: "BUY" | "SELL";
    quantity: number;
    orderType: "MKT" | "LMT" | "STP" | "STP_LMT";
    price?: number;
    auxPrice?: number;
    tif: "DAY" | "GTC" | "IOC";
  }): Promise<Record<string, unknown>> {
    const order = {
      conid: params.conId,
      side: params.side,
      quantity: params.quantity,
      orderType: params.orderType,
      tif: params.tif,
      ...(params.price && { price: params.price }),
      ...(params.auxPrice && { auxPrice: params.auxPrice }),
    };

    const resp = await fetch(
      `${this.gatewayUrl}/iserver/account/${this.accountId}/orders`,
      { method: "POST", headers: this.headers, body: JSON.stringify({ orders: [order] }) }
    );
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`IBKR order failed: ${resp.status} ${err}`);
    }
    return await resp.json();
  }

  // ─── Data Fetching ────────────────────────────────────────

  private async fetchSnapshot(ticker: string): Promise<{
    lastPrice: number; prevClose: number;
    high: number; low: number; volume: number;
  } | null> {
    try {
      // IBKR uses conId for market data — for now use search to resolve
      const conId = await this.resolveConId(ticker);
      if (!conId) return null;

      const resp = await fetch(
        `${this.gatewayUrl}/iserver/marketdata/snapshot?conids=${conId}&fields=31,70,71,82,83,87,88`,
        { headers: this.headers }
      );
      if (!resp.ok) return null;
      const data = await resp.json() as any;
      const snap = Array.isArray(data) ? data[0] : data;

      return {
        lastPrice: parseFloat(snap["31"] ?? snap.lastPrice ?? "0"),
        prevClose: parseFloat(snap["87"] ?? snap.prevClose ?? "0"),
        high: parseFloat(snap["70"] ?? snap.high ?? "0"),
        low: parseFloat(snap["71"] ?? snap.low ?? "0"),
        volume: parseFloat(snap["82"] ?? snap.volume ?? "0"),
      };
    } catch {
      return null;
    }
  }

  private async fetchHistoricalBars(
    ticker: string, period: string, count: number
  ): Promise<OHLCVBar[]> {
    try {
      const conId = await this.resolveConId(ticker);
      if (!conId) return [];

      const resp = await fetch(
        `${this.gatewayUrl}/iserver/marketdata/history?conid=${conId}&period=${count}${period}&bar=${period}`,
        { headers: this.headers }
      );
      if (!resp.ok) return [];
      const data = await resp.json() as any;
      return (data.data ?? []).map((b: any) => ({
        time: Math.floor(b.t / 1000), // IBKR returns ms
        open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v ?? 0,
      }));
    } catch {
      return [];
    }
  }

  private conIdCache = new Map<string, number>();

  private async resolveConId(ticker: string): Promise<number | null> {
    if (this.conIdCache.has(ticker)) return this.conIdCache.get(ticker)!;

    try {
      const resp = await fetch(
        `${this.gatewayUrl}/iserver/secdef/search`,
        {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify({ symbol: ticker, secType: "FUT" }),
        }
      );
      if (!resp.ok) return null;
      const data = await resp.json() as any;
      const contract = Array.isArray(data) ? data[0] : null;
      if (!contract?.conid) return null;
      this.conIdCache.set(ticker, contract.conid);
      return contract.conid;
    } catch {
      return null;
    }
  }

  // ─── Signal Detection ─────────────────────────────────────

  private async detectSignals(
    asset: { id: string; symbol: string },
    data: {
      price: number; priceChange24h: number; priceChange1h?: number;
      rsi: number | null; volumeRatio: number | null;
      dayHigh: number; dayLow: number;
    },
    closes: number[],
    volumes: number[]
  ): Promise<number> {
    let count = 0;

    // 1. RSI extremes
    if (data.rsi !== null) {
      if (data.rsi <= FUTURES_RSI_OVERSOLD) {
        await this.writeSignal(asset.id, "rsi_oversold",
          data.rsi <= 15 ? "high" : "medium", data.rsi,
          { symbol: asset.symbol, rsi: data.rsi });
        count++;
      } else if (data.rsi >= FUTURES_RSI_OVERBOUGHT) {
        await this.writeSignal(asset.id, "rsi_overbought",
          data.rsi >= 85 ? "high" : "medium", data.rsi,
          { symbol: asset.symbol, rsi: data.rsi });
        count++;
      }
    }

    // 2. Volume spike
    if (data.volumeRatio !== null && data.volumeRatio >= FUTURES_VOLUME_SPIKE) {
      await this.writeSignal(asset.id, "volume_spike",
        data.volumeRatio >= 5.0 ? "high" : "medium", data.volumeRatio,
        { symbol: asset.symbol, volume_ratio: data.volumeRatio });
      count++;
    }

    // 3. Drawdown from period high
    const drawdown = computeDrawdown(closes);
    if (drawdown !== null && drawdown <= FUTURES_DRAWDOWN_THRESHOLD) {
      await this.writeSignal(asset.id, "drawdown_from_7d_high",
        drawdown <= -0.10 ? "critical" : drawdown <= -0.07 ? "high" : "medium",
        drawdown,
        { symbol: asset.symbol, current_price: data.price, period_high: Math.max(...closes) });
      count++;
    }

    // 4. Limit move detection (futures-specific)
    // Large single-day moves in futures often hit exchange circuit breakers
    if (Math.abs(data.priceChange24h) >= 0.04) {
      const direction = data.priceChange24h > 0 ? "limit_up" : "limit_down";
      await this.writeSignal(asset.id, direction,
        Math.abs(data.priceChange24h) >= 0.07 ? "critical" : "high",
        data.priceChange24h,
        { symbol: asset.symbol, change_24h: data.priceChange24h });
      count++;
    }

    return count;
  }

  // ─── Helpers ──────────────────────────────────────────────

  private async getActiveAssets(): Promise<Array<{ id: string; symbol: string }>> {
    return this.db
      .select({ id: tradingAssets.id, symbol: tradingAssets.symbol })
      .from(tradingAssets)
      .where(and(
        eq(tradingAssets.assetClass, "commodity"),
        eq(tradingAssets.isActive, true)
      ));
  }

  private async writeSignal(
    assetId: string, signalType: string, severity: string,
    value: number, context: Record<string, unknown>
  ): Promise<void> {
    const now = new Date();
    await this.db.insert(tradingSignals).values({
      assetId, signalType, severity,
      value: String(value), context,
      detectedAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });
    console.log(`[IBKR] SIGNAL [${severity}] ${context.symbol}: ${signalType} = ${value}`);
  }

  private async log(level: string, message: string, context?: Record<string, unknown>) {
    await this.db.insert(tradingAgentLogs).values({
      agentName: "scanner_futures", logLevel: level, message, context: context ?? {},
    });
  }

  /**
   * Seed futures assets into the database.
   * Called once during setup.
   */
  async seedAssets(): Promise<number> {
    let added = 0;
    for (const future of DEFAULT_FUTURES_UNIVERSE) {
      const symbol = `${future.symbol}/USD`;
      const existing = await this.db
        .select({ id: tradingAssets.id })
        .from(tradingAssets)
        .where(and(
          eq(tradingAssets.symbol, symbol),
          eq(tradingAssets.exchange, "ibkr")
        ))
        .limit(1);

      if (existing.length === 0) {
        await this.db.insert(tradingAssets).values({
          symbol,
          assetClass: "commodity",
          exchange: "ibkr",
          baseCurrency: future.symbol,
          quoteCurrency: "USD",
          isActive: true,
          metadata: {
            name: future.name,
            exchange: future.exchange,
            multiplier: future.multiplier,
            source: "ibkr",
          },
        });
        added++;
        console.log(`[IBKR] Added futures asset: ${symbol}`);
      }
    }
    console.log(`[IBKR] Seeded ${added} new futures assets (${DEFAULT_FUTURES_UNIVERSE.length} total universe)`);
    return added;
  }
}

// ─── Technical Indicators (shared) ──────────────────────────
function computeRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const deltas = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = deltas.slice(0, period).reduce((s, d) => s + Math.max(d, 0), 0) / period;
  let avgLoss = deltas.slice(0, period).reduce((s, d) => s + Math.max(-d, 0), 0) / period;
  for (let i = period; i < deltas.length; i++) {
    avgGain = (avgGain * (period - 1) + Math.max(deltas[i], 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-deltas[i], 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

function computeVolumeRatio(volumes: number[], window = 20): number | null {
  if (volumes.length < window + 1) return null;
  const avg = volumes.slice(-window - 1, -1).reduce((a, b) => a + b, 0) / window;
  if (avg === 0) return null;
  return Math.round((volumes[volumes.length - 1] / avg) * 10000) / 10000;
}

function computeDrawdown(closes: number[]): number | null {
  if (!closes.length) return null;
  const high = Math.max(...closes);
  if (high === 0) return null;
  return Math.round(((closes[closes.length - 1] - high) / high) * 10000) / 10000;
}
