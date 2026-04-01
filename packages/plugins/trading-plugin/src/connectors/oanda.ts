/**
 * OANDA Connector — Forex Markets
 * =================================
 * Connects to OANDA's v20 REST API for:
 *   - Major, minor & exotic currency pairs
 *   - Practice (paper) trading ($100K simulated)
 *   - Live trading
 *
 * API Docs: https://developer.oanda.com/rest-live-v20/
 * Practice URL: https://api-fxpractice.oanda.com
 * Live URL:     https://api-fxtrade.oanda.com
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
const OANDA_PRACTICE_URL = "https://api-fxpractice.oanda.com";
const OANDA_LIVE_URL = "https://api-fxtrade.oanda.com";

// Default forex universe — liquid major & minor pairs
const DEFAULT_FOREX_UNIVERSE = [
  // Major pairs
  { symbol: "EUR/USD", instrument: "EUR_USD", name: "Euro / US Dollar" },
  { symbol: "GBP/USD", instrument: "GBP_USD", name: "British Pound / US Dollar" },
  { symbol: "USD/JPY", instrument: "USD_JPY", name: "US Dollar / Japanese Yen" },
  { symbol: "USD/CHF", instrument: "USD_CHF", name: "US Dollar / Swiss Franc" },
  { symbol: "AUD/USD", instrument: "AUD_USD", name: "Australian Dollar / US Dollar" },
  { symbol: "USD/CAD", instrument: "USD_CAD", name: "US Dollar / Canadian Dollar" },
  { symbol: "NZD/USD", instrument: "NZD_USD", name: "New Zealand Dollar / US Dollar" },
  // Minor/cross pairs
  { symbol: "EUR/GBP", instrument: "EUR_GBP", name: "Euro / British Pound" },
  { symbol: "EUR/JPY", instrument: "EUR_JPY", name: "Euro / Japanese Yen" },
  { symbol: "GBP/JPY", instrument: "GBP_JPY", name: "British Pound / Japanese Yen" },
  { symbol: "EUR/AUD", instrument: "EUR_AUD", name: "Euro / Australian Dollar" },
  { symbol: "EUR/CHF", instrument: "EUR_CHF", name: "Euro / Swiss Franc" },
  { symbol: "AUD/JPY", instrument: "AUD_JPY", name: "Australian Dollar / Japanese Yen" },
  { symbol: "GBP/AUD", instrument: "GBP_AUD", name: "British Pound / Australian Dollar" },
  { symbol: "GBP/CHF", instrument: "GBP_CHF", name: "British Pound / Swiss Franc" },
  // Commodity-linked
  { symbol: "AUD/CAD", instrument: "AUD_CAD", name: "Australian Dollar / Canadian Dollar" },
  { symbol: "NZD/CAD", instrument: "NZD_CAD", name: "New Zealand Dollar / Canadian Dollar" },
  { symbol: "CAD/JPY", instrument: "CAD_JPY", name: "Canadian Dollar / Japanese Yen" },
  // Metals (via OANDA)
  { symbol: "XAU/USD", instrument: "XAU_USD", name: "Gold / US Dollar" },
  { symbol: "XAG/USD", instrument: "XAG_USD", name: "Silver / US Dollar" },
];

// Signal thresholds for forex
const FOREX_RSI_OVERSOLD = 25;
const FOREX_RSI_OVERBOUGHT = 75;
const FOREX_VOLUME_SPIKE = 2.0;
const FOREX_DRAWDOWN_THRESHOLD = -0.03; // 3% drawdown (forex moves less)
const FOREX_SPREAD_ALERT = 0.005; // alert if spread > 0.5%

/**
 * Map OHLCV interval to OANDA granularity.
 * OANDA uses: M1, M5, M15, H1, H4, D
 */
function toOandaGranularity(interval: OHLCVInterval): string {
  const map: Record<OHLCVInterval, string> = {
    "1m": "M1", "5m": "M5", "15m": "M15",
    "1h": "H1", "4h": "H4", "1d": "D",
  };
  return map[interval] ?? "H1";
}

export class OandaConnector implements MarketConnector {
  readonly id = "oanda";
  readonly name = "OANDA (Forex & Metals)";
  readonly assetClass: AssetClass = "forex";

  private apiKey: string;
  private accountId: string;
  private isPractice: boolean;
  private db: any;

  constructor(
    db: any,
    apiKey: string,
    accountId: string,
    isPractice = true
  ) {
    this.db = db;
    this.apiKey = apiKey;
    this.accountId = accountId;
    this.isPractice = isPractice;
  }

  private get baseUrl(): string {
    return this.isPractice ? OANDA_PRACTICE_URL : OANDA_LIVE_URL;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "Accept-Datetime-Format": "RFC3339",
    };
  }

  // ─── MarketConnector Interface ───────────────────────────

  async isHealthy(): Promise<boolean> {
    try {
      const resp = await fetch(
        `${this.baseUrl}/v3/accounts/${this.accountId}/summary`,
        { headers: this.headers }
      );
      if (!resp.ok) return false;
      const data = await resp.json() as any;
      return data.account != null;
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
    console.log(`[OANDA] Scanning ${assets.length} forex pairs...`);

    // Fetch pricing for all instruments in one batch call
    const instruments = assets.map(a => this.toOandaInstrument(a.symbol));
    const pricing = await this.fetchBatchPricing(instruments);
    const barsMap = await this.fetchBatchCandles(instruments, "H1", 168);

    for (const asset of assets) {
      try {
        const instrument = this.toOandaInstrument(asset.symbol);
        const quote = pricing[instrument];
        const bars = barsMap[instrument] ?? [];

        if (!quote) {
          console.log(`[OANDA] No pricing for ${instrument}`);
          continue;
        }

        const closes = bars.map(b => b.close);
        const volumes = bars.map(b => b.volume);
        const rsi = computeRSI(closes);
        const volumeRatio = computeVolumeRatio(volumes);

        const bid = parseFloat(quote.bids?.[0]?.price ?? "0");
        const ask = parseFloat(quote.asks?.[0]?.price ?? "0");
        const mid = (bid + ask) / 2;
        const spread = ask > 0 ? (ask - bid) / ask : 0;

        let priceChange24h = 0;
        if (closes.length >= 24) {
          const prev = closes[closes.length - 24];
          if (prev > 0) priceChange24h = (mid - prev) / prev;
        }

        let priceChange1h: number | undefined;
        if (closes.length >= 2) {
          const prev = closes[closes.length - 2];
          if (prev > 0) priceChange1h = (mid - prev) / prev;
        }

        const dayHigh = closes.length > 0 ? Math.max(...closes.slice(-24)) : mid;
        const dayLow = closes.length > 0 ? Math.min(...closes.slice(-24)) : mid;

        // Write snapshot to DB
        await this.db.insert(tradingSnapshots).values({
          assetId: asset.id,
          timestamp: new Date(),
          price: String(mid),
          volume24h: null, // forex doesn't have traditional volume
          priceChange1h: priceChange1h != null ? String(priceChange1h) : null,
          priceChange24h: String(priceChange24h),
          high24h: String(dayHigh),
          low24h: String(dayLow),
          rsi14: rsi != null ? String(rsi) : null,
          volumeRatio: volumeRatio != null ? String(volumeRatio) : null,
          fundingRate: null,
          rawData: { exchange: "oanda", instrument, spread, bid, ask },
        });

        // Detect signals
        const sigCount = await this.detectSignals(asset, {
          price: mid, priceChange24h, priceChange1h,
          rsi, volumeRatio, spread, dayHigh, dayLow,
        }, closes, volumes);
        signals += sigCount;
        scanned++;

      } catch (err) {
        const msg = `Scan failed for ${asset.symbol}: ${err}`;
        errors.push(msg);
        console.error(`[OANDA] ${msg}`);
      }
    }

    await this.log("info", `Scan cycle complete: ${scanned}/${assets.length} pairs, ${signals} signals`);
    console.log(`[OANDA] Cycle complete: ${scanned} pairs, ${signals} signals`);

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
      const instrument = this.toOandaInstrument(symbol);
      const resp = await fetch(
        `${this.baseUrl}/v3/accounts/${this.accountId}/pricing?instruments=${instrument}`,
        { headers: this.headers }
      );
      if (!resp.ok) return null;
      const data = await resp.json() as any;
      const price = data.prices?.[0];
      if (!price) return null;
      const bid = parseFloat(price.bids?.[0]?.price ?? "0");
      const ask = parseFloat(price.asks?.[0]?.price ?? "0");
      return (bid + ask) / 2;
    } catch {
      return null;
    }
  }

  async getOHLCV(symbol: string, interval: OHLCVInterval, bars: number): Promise<OHLCVBar[]> {
    const instrument = this.toOandaInstrument(symbol);
    const granularity = toOandaGranularity(interval);
    try {
      const resp = await fetch(
        `${this.baseUrl}/v3/instruments/${instrument}/candles?granularity=${granularity}&count=${bars}&price=M`,
        { headers: this.headers }
      );
      if (!resp.ok) return [];
      const data = await resp.json() as any;
      return (data.candles ?? [])
        .filter((c: any) => c.complete)
        .map((c: any) => ({
          time: Math.floor(new Date(c.time).getTime() / 1000),
          open: parseFloat(c.mid?.o ?? "0"),
          high: parseFloat(c.mid?.h ?? "0"),
          low: parseFloat(c.mid?.l ?? "0"),
          close: parseFloat(c.mid?.c ?? "0"),
          volume: c.volume ?? 0,
        }));
    } catch {
      return [];
    }
  }

  async getSymbols(): Promise<string[]> {
    return DEFAULT_FOREX_UNIVERSE.map(p => p.symbol);
  }

  async getMarketMeta(symbol: string): Promise<Record<string, unknown>> {
    const instrument = this.toOandaInstrument(symbol);
    try {
      const resp = await fetch(
        `${this.baseUrl}/v3/accounts/${this.accountId}/instruments?instruments=${instrument}`,
        { headers: this.headers }
      );
      if (!resp.ok) return {};
      const data = await resp.json() as any;
      const inst = data.instruments?.[0];
      if (!inst) return {};
      return {
        name: inst.displayName,
        type: inst.type,
        pipLocation: inst.pipLocation,
        displayPrecision: inst.displayPrecision,
        tradeUnitsPrecision: inst.tradeUnitsPrecision,
        minimumTradeSize: inst.minimumTradeSize,
        maximumOrderUnits: inst.maximumOrderUnits,
        marginRate: inst.marginRate,
        financing: inst.financing,
      };
    } catch {
      return {};
    }
  }

  // ─── OANDA-Specific Methods ──────────────────────────────

  async getAccount(): Promise<Record<string, unknown>> {
    try {
      const resp = await fetch(
        `${this.baseUrl}/v3/accounts/${this.accountId}/summary`,
        { headers: this.headers }
      );
      if (!resp.ok) return {};
      const data = await resp.json() as any;
      return data.account ?? {};
    } catch {
      return {};
    }
  }

  async getPositions(): Promise<any[]> {
    try {
      const resp = await fetch(
        `${this.baseUrl}/v3/accounts/${this.accountId}/openPositions`,
        { headers: this.headers }
      );
      if (!resp.ok) return [];
      const data = await resp.json() as any;
      return data.positions ?? [];
    } catch {
      return [];
    }
  }

  async submitOrder(params: {
    instrument: string;
    units: number; // positive=long, negative=short
    type: "MARKET" | "LIMIT" | "STOP";
    price?: number;
    takeProfitPrice?: number;
    stopLossPrice?: number;
  }): Promise<Record<string, unknown>> {
    const order: any = {
      type: params.type,
      instrument: this.toOandaInstrument(params.instrument),
      units: String(params.units),
      timeInForce: params.type === "MARKET" ? "FOK" : "GTC",
    };
    if (params.price) order.price = String(params.price);
    if (params.takeProfitPrice) order.takeProfitOnFill = { price: String(params.takeProfitPrice) };
    if (params.stopLossPrice) order.stopLossOnFill = { price: String(params.stopLossPrice) };

    const resp = await fetch(
      `${this.baseUrl}/v3/accounts/${this.accountId}/orders`,
      { method: "POST", headers: this.headers, body: JSON.stringify({ order }) }
    );
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`OANDA order failed: ${resp.status} ${err}`);
    }
    return await resp.json();
  }

  // ─── Batch Data Fetching ──────────────────────────────────

  private async fetchBatchPricing(instruments: string[]): Promise<Record<string, any>> {
    try {
      const instStr = instruments.join(",");
      const resp = await fetch(
        `${this.baseUrl}/v3/accounts/${this.accountId}/pricing?instruments=${instStr}`,
        { headers: this.headers }
      );
      if (!resp.ok) return {};
      const data = await resp.json() as any;
      const result: Record<string, any> = {};
      for (const price of data.prices ?? []) {
        result[price.instrument] = price;
      }
      return result;
    } catch {
      return {};
    }
  }

  private async fetchBatchCandles(
    instruments: string[],
    granularity: string,
    count: number
  ): Promise<Record<string, OHLCVBar[]>> {
    const result: Record<string, OHLCVBar[]> = {};
    // OANDA doesn't support multi-instrument candle requests, so we batch sequentially
    // but with a small delay to respect rate limits
    for (const instrument of instruments) {
      try {
        const resp = await fetch(
          `${this.baseUrl}/v3/instruments/${instrument}/candles?granularity=${granularity}&count=${count}&price=M`,
          { headers: this.headers }
        );
        if (!resp.ok) continue;
        const data = await resp.json() as any;
        result[instrument] = (data.candles ?? [])
          .filter((c: any) => c.complete)
          .map((c: any) => ({
            time: Math.floor(new Date(c.time).getTime() / 1000),
            open: parseFloat(c.mid?.o ?? "0"),
            high: parseFloat(c.mid?.h ?? "0"),
            low: parseFloat(c.mid?.l ?? "0"),
            close: parseFloat(c.mid?.c ?? "0"),
            volume: c.volume ?? 0,
          }));
      } catch {
        // Skip instrument on error
      }
    }
    return result;
  }

  // ─── Signal Detection ─────────────────────────────────────

  private async detectSignals(
    asset: { id: string; symbol: string },
    data: {
      price: number; priceChange24h: number; priceChange1h?: number;
      rsi: number | null; volumeRatio: number | null;
      spread: number; dayHigh: number; dayLow: number;
    },
    closes: number[],
    volumes: number[]
  ): Promise<number> {
    let count = 0;

    // 1. RSI extremes
    if (data.rsi !== null) {
      if (data.rsi <= FOREX_RSI_OVERSOLD) {
        await this.writeSignal(asset.id, "rsi_oversold",
          data.rsi <= 15 ? "high" : "medium", data.rsi,
          { symbol: asset.symbol, rsi: data.rsi });
        count++;
      } else if (data.rsi >= FOREX_RSI_OVERBOUGHT) {
        await this.writeSignal(asset.id, "rsi_overbought",
          data.rsi >= 85 ? "high" : "medium", data.rsi,
          { symbol: asset.symbol, rsi: data.rsi });
        count++;
      }
    }

    // 2. Volume spike (tick volume)
    if (data.volumeRatio !== null && data.volumeRatio >= FOREX_VOLUME_SPIKE) {
      await this.writeSignal(asset.id, "volume_spike",
        data.volumeRatio >= 4.0 ? "high" : "medium", data.volumeRatio,
        { symbol: asset.symbol, volume_ratio: data.volumeRatio });
      count++;
    }

    // 3. Drawdown from period high
    const drawdown = computeDrawdown(closes);
    if (drawdown !== null && drawdown <= FOREX_DRAWDOWN_THRESHOLD) {
      await this.writeSignal(asset.id, "drawdown_from_7d_high",
        drawdown <= -0.06 ? "critical" : drawdown <= -0.04 ? "high" : "medium",
        drawdown,
        { symbol: asset.symbol, current_price: data.price, period_high: Math.max(...closes) });
      count++;
    }

    // 4. Spread alert (forex-specific — wide spreads indicate illiquidity)
    if (data.spread >= FOREX_SPREAD_ALERT) {
      await this.writeSignal(asset.id, "spread_alert",
        data.spread >= 0.01 ? "high" : "medium", data.spread,
        { symbol: asset.symbol, spread: data.spread });
      count++;
    }

    return count;
  }

  // ─── Helpers ──────────────────────────────────────────────

  private toOandaInstrument(symbol: string): string {
    // Convert "EUR/USD" → "EUR_USD"
    return symbol.replace("/", "_");
  }

  private async getActiveAssets(): Promise<Array<{ id: string; symbol: string }>> {
    return this.db
      .select({ id: tradingAssets.id, symbol: tradingAssets.symbol })
      .from(tradingAssets)
      .where(and(
        eq(tradingAssets.assetClass, "forex"),
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
    console.log(`[OANDA] SIGNAL [${severity}] ${context.symbol}: ${signalType} = ${value}`);
  }

  private async log(level: string, message: string, context?: Record<string, unknown>) {
    await this.db.insert(tradingAgentLogs).values({
      agentName: "scanner_forex", logLevel: level, message, context: context ?? {},
    });
  }

  /**
   * Seed forex assets into the database.
   * Called once during setup to populate the trading_assets table.
   */
  async seedAssets(): Promise<number> {
    let added = 0;
    for (const pair of DEFAULT_FOREX_UNIVERSE) {
      const existing = await this.db
        .select({ id: tradingAssets.id })
        .from(tradingAssets)
        .where(and(
          eq(tradingAssets.symbol, pair.symbol),
          eq(tradingAssets.exchange, "oanda")
        ))
        .limit(1);

      if (existing.length === 0) {
        const [base, quote] = pair.symbol.split("/");
        await this.db.insert(tradingAssets).values({
          symbol: pair.symbol,
          assetClass: "forex",
          exchange: "oanda",
          baseCurrency: base,
          quoteCurrency: quote,
          isActive: true,
          metadata: { name: pair.name, instrument: pair.instrument, source: "oanda" },
        });
        added++;
        console.log(`[OANDA] Added forex asset: ${pair.symbol}`);
      }
    }
    console.log(`[OANDA] Seeded ${added} new forex assets (${DEFAULT_FOREX_UNIVERSE.length} total universe)`);
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
