/**
 * Crypto Scanner Agent
 * ====================
 * Monitors top 30 crypto assets on Kraken every 5 minutes.
 * Detects: drawdowns, volume spikes, RSI extremes, funding rate anomalies.
 * Writes snapshots and signals to trAIder's PostgreSQL via Drizzle.
 *
 * Uses Kraken REST API (UK-accessible):
 *   - Spot: https://api.kraken.com/0/public/
 *   - Futures: https://futures.kraken.com/derivatives/api/v3/
 */

import { eq, desc, and, gte, sql } from "drizzle-orm";
import {
  tradingAssets,
  tradingSnapshots,
  tradingSignals,
  tradingAgentLogs,
} from "../db/schema.js";
import type { MarketSnapshot, Signal, Severity } from "../types/index.js";

const KRAKEN_BASE = "https://api.kraken.com/0/public";
const KRAKEN_FUTURES = "https://futures.kraken.com/derivatives/api/v3";

// Signal thresholds
const DRAWDOWN_THRESHOLD = -0.15;
const VOLUME_SPIKE_THRESHOLD = 3.0;
const RSI_OVERSOLD = 30;
const RSI_OVERBOUGHT = 70;
const FUNDING_RATE_EXTREME = 0.001;

/**
 * Mapping from our internal symbols (e.g. "XBTUSDT") to Kraken pair names.
 * Kraken's API uses its own pair naming Ã¢ÂÂ this map handles the translation.
 * The scanner will try the symbol directly first, then fall back to this map.
 */
const KRAKEN_PAIR_MAP: Record<string, string> = {
  "BTC/USD": "XBTUSD",
  "ETH/USD": "ETHUSD",
  "SOL/USD": "SOLUSD",
  "XRP/USD": "XRPUSD",
  "ADA/USD": "ADAUSD",
  "AVAX/USD": "AVAXUSD",
  "DOT/USD": "DOTUSD",
  "LINK/USD": "LINKUSD",
  "MATIC/USD": "POLUSD",  // Polygon rebranded MATIC â POL on Kraken
  "ATOM/USD": "ATOMUSD",
  "UNI/USD": "UNIUSD",
  "LTC/USD": "LTCUSD",
  "DOGE/USD": "XDGUSD",  // Kraken uses XDG internally for DOGE,
  "SHIB/USD": "SHIBUSD",
  "FIL/USD": "FILUSD",
};

/**
 * Kraken Futures uses "PF_" prefix for perpetual futures tickers.
 * e.g. PF_XBTUSD for BTC perpetual.
 */
const FUTURES_TICKER_MAP: Record<string, string> = {
  "BTC/USD": "PF_XBTUSD",
  "ETH/USD": "PF_ETHUSD",
  "XRP/USD": "PF_XRPUSD",
  "SOL/USD": "PF_SOLUSD",
  "ADA/USD": "PF_ADAUSD",
  "DOGE/USD": "PF_DOGEUSD",
  "DOT/USD": "PF_DOTUSD",
  "LINK/USD": "PF_LINKUSD",
  "AVAX/USD": "PF_AVAXUSD",
  "LTC/USD": "PF_LTCUSD",
  "ATOM/USD": "PF_ATOMUSD",
  "MATIC/USD": "PF_POLUSD",
};
/**
 * Generic fallback: convert DB symbol format "BASE/QUOTE" to Kraken pair.
 * Handles Kraken-specific naming (BTCâXBT, MATICâPOL, DOGEâDOGE).
 */
function dbSymbolToKrakenPair(symbol: string): string {
  const [base, quote] = symbol.split("/");
  const krakenBase = base === "BTC" ? "XBT" : base === "MATIC" ? "POL" : base;
  return krakenBase + (quote || "USD");
}

export class CryptoScanner {
  constructor(
    private db: any,
    private krakenApiKey: string
  ) {}

  async runCycle(): Promise<void> {
    const assets = await this.getActiveAssets();
    console.log(`[Scanner] Scanning ${assets.length} assets via Kraken...`);

    // Fetch all tickers in one call (Kraken supports batch)
    const allTickers = await this.fetchAllTickers();
    const allFunding = await this.fetchAllFundingRates();

    let scanned = 0;
    for (const asset of assets) {
      try {
        await this.scanAsset(asset, allTickers, allFunding);
        scanned++;
        await sleep(150); // Rate limiting (Kraken allows ~15 req/s for public)
      } catch (err) {
        console.error(`[Scanner] Error scanning ${asset.symbol}:`, err);
        await this.log("error", `Scan failed for ${asset.symbol}`, { error: String(err) });
      }
    }

    await this.log("info", `Scan cycle complete: ${scanned}/${assets.length} assets`);
    console.log(`[Scanner] Cycle complete: ${scanned} assets scanned`);
  }

  private async scanAsset(
    asset: { id: string; symbol: string },
    allTickers: Record<string, any>,
    allFunding: Record<string, number>
  ): Promise<void> {
    const krakenPair = KRAKEN_PAIR_MAP[asset.symbol] ?? dbSymbolToKrakenPair(asset.symbol);

    // Find this asset's ticker in the batch response
    const ticker = this.findTicker(krakenPair, allTickers);
    if (!ticker) {
      console.log(`[Scanner] No ticker data for ${asset.symbol} (${krakenPair})`);
      return;
    }

    // Fetch OHLC (klines) individually Ã¢ÂÂ Kraken only supports one pair per OHLC call
    const klines = await this.fetchOHLC(krakenPair, 60, 168); // 60 = 1h interval

    const closes = klines.map((k) => k.close);
    const volumes = klines.map((k) => k.volume);

    const rsi = computeRSI(closes);
    const volumeRatio = computeVolumeRatio(volumes);

    // Kraken ticker: a=ask, b=bid, c=last trade, v=volume, p=vwap, t=trades, l=low, h=high, o=open
    const price = parseFloat(ticker.c[0]); // last trade price
    const volume24h = parseFloat(ticker.v[1]) * price; // 24h volume in quote currency
    const open24h = parseFloat(ticker.o);
    const high24h = parseFloat(ticker.h[1]); // 24h high
    const low24h = parseFloat(ticker.l[1]);  // 24h low
    const priceChange24h = open24h > 0 ? (price - open24h) / open24h : 0;

    let priceChange1h: number | undefined;
    if (closes.length >= 2) {
      const prev = closes[closes.length - 2];
      if (prev > 0) priceChange1h = (price - prev) / prev;
    }

    // Funding rate from futures
    const futuresTicker = FUTURES_TICKER_MAP[asset.symbol] ?? undefined;
    const fundingRate = futuresTicker ? (allFunding[futuresTicker] ?? undefined) : undefined;

    // Write snapshot
    const snapshot: MarketSnapshot = {
      assetId: asset.id,
      timestamp: new Date(),
      price,
      volume24h,
      priceChange1h,
      priceChange24h,
      high24h,
      low24h,
      rsi14: rsi ?? undefined,
      volumeRatio: volumeRatio ?? undefined,
      fundingRate,
    };

    await this.db.insert(tradingSnapshots).values({
      assetId: asset.id,
      timestamp: snapshot.timestamp,
      price: String(snapshot.price),
      volume24h: snapshot.volume24h ? String(snapshot.volume24h) : null,
      priceChange1h: snapshot.priceChange1h ? String(snapshot.priceChange1h) : null,
      priceChange24h: snapshot.priceChange24h ? String(snapshot.priceChange24h) : null,
      high24h: snapshot.high24h ? String(snapshot.high24h) : null,
      low24h: snapshot.low24h ? String(snapshot.low24h) : null,
      rsi14: snapshot.rsi14 ? String(snapshot.rsi14) : null,
      volumeRatio: snapshot.volumeRatio ? String(snapshot.volumeRatio) : null,
      fundingRate: snapshot.fundingRate ? String(snapshot.fundingRate) : null,
      rawData: { exchange: "kraken", pair: krakenPair, kline_count: closes.length },
    });

    // Detect signals
    await this.detectSignals(asset, snapshot, closes, volumes);
  }

  private async detectSignals(
    asset: { id: string; symbol: string },
    snapshot: MarketSnapshot,
    closes: number[],
    volumes: number[]
  ): Promise<void> {
    // 1. Drawdown from 7d high
    const drawdown = computeDrawdown(closes);
    if (drawdown !== null && drawdown <= DRAWDOWN_THRESHOLD) {
      const severity: Severity = drawdown <= -0.25 ? "critical" : drawdown <= -0.20 ? "high" : "medium";
      await this.writeSignal(asset.id, "drawdown_from_7d_high", severity, drawdown, {
        symbol: asset.symbol, current_price: snapshot.price, period_high: Math.max(...closes),
      });
    }

    // 2. Volume spike
    if (snapshot.volumeRatio && snapshot.volumeRatio >= VOLUME_SPIKE_THRESHOLD) {
      const severity: Severity = snapshot.volumeRatio >= 5.0 ? "high" : "medium";
      await this.writeSignal(asset.id, "volume_spike", severity, snapshot.volumeRatio, {
        symbol: asset.symbol, volume_ratio: snapshot.volumeRatio,
      });
    }

    // 3. RSI extremes
    if (snapshot.rsi14 !== undefined) {
      if (snapshot.rsi14 <= RSI_OVERSOLD) {
        const severity: Severity = snapshot.rsi14 <= 20 ? "high" : "medium";
        await this.writeSignal(asset.id, "rsi_oversold", severity, snapshot.rsi14, {
          symbol: asset.symbol, rsi: snapshot.rsi14,
        });
      } else if (snapshot.rsi14 >= RSI_OVERBOUGHT) {
        const severity: Severity = snapshot.rsi14 >= 80 ? "high" : "medium";
        await this.writeSignal(asset.id, "rsi_overbought", severity, snapshot.rsi14, {
          symbol: asset.symbol, rsi: snapshot.rsi14,
        });
      }
    }

    // 4. Funding rate extreme
    if (snapshot.fundingRate !== undefined && Math.abs(snapshot.fundingRate) >= FUNDING_RATE_EXTREME) {
      const direction = snapshot.fundingRate > 0 ? "long_crowded" : "short_crowded";
      const severity: Severity = Math.abs(snapshot.fundingRate) >= 0.002 ? "high" : "medium";
      await this.writeSignal(asset.id, `funding_${direction}`, severity, snapshot.fundingRate, {
        symbol: asset.symbol, funding_rate: snapshot.fundingRate,
      });
    }
  }

  private async writeSignal(
    assetId: string, signalType: string, severity: Severity,
    value: number, context: Record<string, unknown>
  ): Promise<void> {
    const now = new Date();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await this.db.insert(tradingSignals).values({
      assetId, signalType, severity,
      value: String(value), context,
      detectedAt: now, expiresAt: expires,
    });
    console.log(`[Scanner] SIGNAL [${severity}] ${context.symbol}: ${signalType} = ${value}`);
  }

  // Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Kraken API calls Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

  /**
   * Fetch all tickers in one batch call.
   * Kraken /Ticker without a pair returns all pairs Ã¢ÂÂ very efficient.
   * We pass our specific pairs to reduce payload.
   */
  private async fetchAllTickers(): Promise<Record<string, any>> {
    try {
      const pairs = Object.values(KRAKEN_PAIR_MAP).join(",");
      const resp = await fetch(`${KRAKEN_BASE}/Ticker?pair=${pairs}`);
      if (!resp.ok) return {};
      const data = await resp.json();
      if (data.error?.length > 0) {
        console.warn("[Scanner] Kraken ticker errors:", data.error);
      }
      return data.result ?? {};
    } catch {
      return {};
    }
  }

  /**
   * Find a ticker in Kraken's response.
   * Kraken returns tickers keyed by their internal pair names which can differ
   * from the request pair. Try exact match first, then search by prefix.
   */
  private findTicker(pair: string, allTickers: Record<string, any>): any | null {
    // Exact match
    if (allTickers[pair]) return allTickers[pair];

    // Kraken returns keys with legacy prefixes (XX, X) and suffixes (Z)
    // e.g. XXBTZUSD for BTC, XETHZUSD for ETH, XDGUSD for DOGE
    const base = pair.replace("USDT", "").replace("USD", "");
    for (const [key, val] of Object.entries(allTickers)) {
      if (key.includes(base) && (key.includes("USDT") || key.includes("USD"))) {
        return val;
      }
    }
    // Try with X prefix (Kraken legacy: XDG for DOGE, XLTC for LTC, etc.)
    for (const [key, val] of Object.entries(allTickers)) {
      const keyBase = key.replace(/^X{1,2}/, "").replace(/Z?USD.*$/, "");
      if (keyBase === base && (key.includes("USD"))) {
        return val;
      }
    }
    return null;
  }

  /**
   * Fetch OHLC (kline) data for a single pair.
   * Kraken /OHLC supports intervals: 1, 5, 15, 30, 60, 240, 1440, 10080, 21600
   * interval=60 is 1 hour.
   * Returns max 720 bars per request.
   */
  private async fetchOHLC(
    pair: string,
    interval: number = 60,
    desiredBars: number = 168
  ): Promise<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>> {
    try {
      // Calculate 'since' timestamp to get desired number of bars
      const sinceSeconds = Math.floor(Date.now() / 1000) - desiredBars * interval * 60;
      const resp = await fetch(
        `${KRAKEN_BASE}/OHLC?pair=${pair}&interval=${interval}&since=${sinceSeconds}`
      );
      if (!resp.ok) return [];
      const data = await resp.json();
      if (data.error?.length > 0) return [];

      // Kraken OHLC result is keyed by pair name
      const resultKey = Object.keys(data.result ?? {}).find((k) => k !== "last");
      if (!resultKey) return [];

      const bars: any[] = data.result[resultKey];
      return bars.map((b: any) => ({
        time: b[0],
        open: parseFloat(b[1]),
        high: parseFloat(b[2]),
        low: parseFloat(b[3]),
        close: parseFloat(b[4]),
        volume: parseFloat(b[6]), // b[6] is volume in Kraken OHLC
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fetch funding rates from Kraken Futures.
   * Returns a map of futures ticker Ã¢ÂÂ funding rate.
   */
  private async fetchAllFundingRates(): Promise<Record<string, number>> {
    try {
      const resp = await fetch(`${KRAKEN_FUTURES}/tickers`);
      if (!resp.ok) return {};
      const data = await resp.json();
      if (data.result !== "success") return {};

      const rates: Record<string, number> = {};
      for (const ticker of data.tickers ?? []) {
        if (ticker.symbol && ticker.fundingRate !== undefined) {
          rates[ticker.symbol] = ticker.fundingRate;
        }
      }
      return rates;
    } catch {
      return {};
    }
  }

  // Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Helpers Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
  private async getActiveAssets() {
    return this.db
      .select({ id: tradingAssets.id, symbol: tradingAssets.symbol })
      .from(tradingAssets)
      .where(and(eq(tradingAssets.assetClass, "crypto"), eq(tradingAssets.isActive, true)));
  }

  async getAssetCount(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(tradingAssets)
      .where(eq(tradingAssets.isActive, true));
    return result[0]?.count ?? 0;
  }

  async getSignalCount24h(): Promise<number> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(tradingSignals)
      .where(gte(tradingSignals.detectedAt, oneDayAgo));
    return result[0]?.count ?? 0;
  }

  async getLastScanTime(): Promise<Date | null> {
    const result = await this.db
      .select({ ts: tradingSnapshots.timestamp })
      .from(tradingSnapshots)
      .orderBy(desc(tradingSnapshots.timestamp))
      .limit(1);
    return result[0]?.ts ?? null;
  }

  private async log(level: string, message: string, context?: Record<string, unknown>) {
    await this.db.insert(tradingAgentLogs).values({
      agentName: "scanner_crypto", logLevel: level, message, context: context ?? {},
    });
  }
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Technical indicators Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
