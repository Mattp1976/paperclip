/**
 * Alpaca Markets Connector — US Equities & ETFs
 * ===============================================
 * Connects to Alpaca's API for:
 *   - Real-time & historical stock/ETF data
 *   - Paper trading (free, $100K simulated)
 *   - Live trading ($0 commission)
 *
 * API Docs: https://docs.alpaca.markets/
 * Paper base URL: https://paper-api.alpaca.markets
 * Live base URL:  https://api.alpaca.markets
 * Data URL:       https://data.alpaca.markets
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
const ALPACA_DATA_URL = "https://data.alpaca.markets";
const ALPACA_PAPER_URL = "https://paper-api.alpaca.markets";
const ALPACA_LIVE_URL = "https://api.alpaca.markets";

// Default equity universe — liquid, high-volume stocks + major ETFs
const DEFAULT_EQUITY_UNIVERSE = [
  // Mega-cap tech
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA",
  // Major ETFs
  "SPY", "QQQ", "IWM", "DIA", "XLF", "XLE", "XLK", "GLD", "TLT",
  // High-volume movers
  "AMD", "NFLX", "CRM", "ORCL", "COIN", "MSTR", "PLTR", "SOFI",
];

// Signal thresholds for equities
const EQUITY_RSI_OVERSOLD = 30;
const EQUITY_RSI_OVERBOUGHT = 70;
const EQUITY_VOLUME_SPIKE = 2.5;
const EQUITY_DRAWDOWN_THRESHOLD = -0.10;
const EQUITY_GAP_THRESHOLD = 0.03; // 3% gap up/down

/**
 * Map OHLCV interval to Alpaca timeframe string.
 * Alpaca uses: 1Min, 5Min, 15Min, 1Hour, 4Hour, 1Day
 */
function toAlpacaTimeframe(interval: OHLCVInterval): string {
  const map: Record<OHLCVInterval, string> = {
    "1m": "1Min", "5m": "5Min", "15m": "15Min",
    "1h": "1Hour", "4h": "4Hour", "1d": "1Day",
  };
  return map[interval] ?? "1Hour";
}

export class AlpacaConnector implements MarketConnector {
  readonly id = "alpaca";
  readonly name = "Alpaca Markets (US Equities)";
  readonly assetClass: AssetClass = "equity";

  private apiKey: string;
  private apiSecret: string;
  private isPaper: boolean;
  private db: any;

  constructor(
    db: any,
    apiKey: string,
    apiSecret: string,
    isPaper = true
  ) {
    this.db = db;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isPaper = isPaper;
  }

  private get tradingUrl(): string {
    return this.isPaper ? ALPACA_PAPER_URL : ALPACA_LIVE_URL;
  }

  private get headers(): Record<string, string> {
    return {
      "APCA-API-KEY-ID": this.apiKey,
      "APCA-API-SECRET-KEY": this.apiSecret,
      "Content-Type": "application/json",
    };
  }

  // ─── MarketConnector Interface ───────────────────────────

  async isHealthy(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.tradingUrl}/v2/account`, {
        headers: this.headers,
      });
      if (!resp.ok) return false;
      const data = await resp.json();
      return data.status === "ACTIVE";
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
    console.log(`[Alpaca] Scanning ${assets.length} equities...`);

    // Check if market is open
    const marketOpen = await this.isMarketOpen();
    if (!marketOpen) {
      console.log("[Alpaca] Market is closed — using last available data");
    }

    // Fetch snapshots in batch (Alpaca supports multi-symbol)
    const symbols = assets.map(a => a.symbol.replace("/USD", ""));
    const snapshots = await this.fetchBatchSnapshots(symbols);
    const barsMap = await this.fetchBatchBars(symbols, "1Hour", 168);

    for (const asset of assets) {
      try {
        const ticker = asset.symbol.replace("/USD", "");
        const snapshot = snapshots[ticker];
        const bars = barsMap[ticker] ?? [];

        if (!snapshot) {
          console.log(`[Alpaca] No snapshot for ${ticker}`);
          continue;
        }

        const closes = bars.map(b => b.close);
        const volumes = bars.map(b => b.volume);
        const rsi = computeRSI(closes);
        const volumeRatio = computeVolumeRatio(volumes);

        const price = snapshot.latestTrade?.p ?? snapshot.minuteBar?.c ?? 0;
        const prevClose = snapshot.prevDailyBar?.c ?? price;
        const dayHigh = snapshot.dailyBar?.h ?? price;
        const dayLow = snapshot.dailyBar?.l ?? price;
        const dayVolume = snapshot.dailyBar?.v ?? 0;
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
          volume24h: dayVolume ? String(dayVolume * price) : null, // approximate dollar volume
          priceChange1h: priceChange1h != null ? String(priceChange1h) : null,
          priceChange24h: String(priceChange24h),
          high24h: String(dayHigh),
          low24h: String(dayLow),
          rsi14: rsi != null ? String(rsi) : null,
          volumeRatio: volumeRatio != null ? String(volumeRatio) : null,
          fundingRate: null, // equities don't have funding rates
          rawData: { exchange: "alpaca", ticker, marketOpen },
        });

        // Detect signals
        const sigCount = await this.detectSignals(asset, {
          price, priceChange24h, priceChange1h,
          rsi, volumeRatio, prevClose, dayHigh, dayLow,
        }, closes, volumes);
        signals += sigCount;
        scanned++;

      } catch (err) {
        const msg = `Scan failed for ${asset.symbol}: ${err}`;
        errors.push(msg);
        console.error(`[Alpaca] ${msg}`);
      }
    }

    await this.log("info", `Scan cycle complete: ${scanned}/${assets.length} equities, ${signals} signals`);
    console.log(`[Alpaca] Cycle complete: ${scanned} equities, ${signals} signals`);

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
      const resp = await fetch(
        `${ALPACA_DATA_URL}/v2/stocks/${ticker}/trades/latest`,
        { headers: this.headers }
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.trade?.p ?? null;
    } catch {
      return null;
    }
  }

  async getOHLCV(symbol: string, interval: OHLCVInterval, bars: number): Promise<OHLCVBar[]> {
    const ticker = symbol.replace("/USD", "");
    const timeframe = toAlpacaTimeframe(interval);
    try {
      const end = new Date().toISOString();
      const resp = await fetch(
        `${ALPACA_DATA_URL}/v2/stocks/${ticker}/bars?timeframe=${timeframe}&limit=${bars}&end=${end}`,
        { headers: this.headers }
      );
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.bars ?? []).map((b: any) => ({
        time: Math.floor(new Date(b.t).getTime() / 1000),
        open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
      }));
    } catch {
      return [];
    }
  }

  async getSymbols(): Promise<string[]> {
    return DEFAULT_EQUITY_UNIVERSE.map(s => `${s}/USD`);
  }

  async getMarketMeta(symbol: string): Promise<Record<string, unknown>> {
    const ticker = symbol.replace("/USD", "");
    try {
      const resp = await fetch(
        `${this.tradingUrl}/v2/assets/${ticker}`,
        { headers: this.headers }
      );
      if (!resp.ok) return {};
      const data = await resp.json();
      return {
        name: data.name,
        exchange: data.exchange,
        class: data.class,
        tradable: data.tradable,
        fractionable: data.fractionable,
        marginable: data.marginable,
        shortable: data.shortable,
        easyToBorrow: data.easy_to_borrow,
      };
    } catch {
      return {};
    }
  }

  // ─── Alpaca-Specific Methods ──────────────────────────────

  async isMarketOpen(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.tradingUrl}/v2/clock`, {
        headers: this.headers,
      });
      if (!resp.ok) return false;
      const data = await resp.json();
      return data.is_open === true;
    } catch {
      return false;
    }
  }

  async getAccount(): Promise<Record<string, unknown>> {
    try {
      const resp = await fetch(`${this.tradingUrl}/v2/account`, {
        headers: this.headers,
      });
      if (!resp.ok) return {};
      return await resp.json();
    } catch {
      return {};
    }
  }

  /**
   * Submit a paper trade order via Alpaca's API.
   * This enables real paper trading through their platform.
   */
  async submitOrder(params: {
    symbol: string;
    qty: number;
    side: "buy" | "sell";
    type: "market" | "limit" | "stop" | "stop_limit";
    timeInForce: "day" | "gtc" | "ioc" | "fok";
    limitPrice?: number;
    stopPrice?: number;
  }): Promise<Record<string, unknown>> {
    const body = {
      symbol: params.symbol.replace("/USD", ""),
      qty: String(params.qty),
      side: params.side,
      type: params.type,
      time_in_force: params.timeInForce,
      ...(params.limitPrice && { limit_price: String(params.limitPrice) }),
      ...(params.stopPrice && { stop_price: String(params.stopPrice) }),
    };

    const resp = await fetch(`${this.tradingUrl}/v2/orders`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Alpaca order failed: ${resp.status} ${err}`);
    }
    return await resp.json();
  }

  async getPositions(): Promise<any[]> {
    try {
      const resp = await fetch(`${this.tradingUrl}/v2/positions`, {
        headers: this.headers,
      });
      if (!resp.ok) return [];
      return await resp.json();
    } catch {
      return [];
    }
  }

  // ─── Batch Data Fetching ──────────────────────────────────

  /**
   * Fetch snapshots for multiple symbols in one call.
   * Alpaca v2 multi-snapshot: GET /v2/stocks/snapshots?symbols=AAPL,MSFT,...
   */
  private async fetchBatchSnapshots(
    symbols: string[]
  ): Promise<Record<string, any>> {
    try {
      const symbolStr = symbols.join(",");
      const resp = await fetch(
        `${ALPACA_DATA_URL}/v2/stocks/snapshots?symbols=${symbolStr}`,
        { headers: this.headers }
      );
      if (!resp.ok) return {};
      return await resp.json();
    } catch {
      return {};
    }
  }

  /**
   * Fetch historical bars for multiple symbols.
   * Alpaca v2 multi-bars: GET /v2/stocks/bars?symbols=AAPL,MSFT,...
   */
  private async fetchBatchBars(
    symbols: string[],
    timeframe: string,
    limit: number
  ): Promise<Record<string, OHLCVBar[]>> {
    try {
      const symbolStr = symbols.join(",");
      const end = new Date().toISOString();
      const resp = await fetch(
        `${ALPACA_DATA_URL}/v2/stocks/bars?symbols=${symbolStr}&timeframe=${timeframe}&limit=${limit}&end=${end}`,
        { headers: this.headers }
      );
      if (!resp.ok) return {};
      const data = await resp.json();

      const result: Record<string, OHLCVBar[]> = {};
      for (const [sym, bars] of Object.entries(data.bars ?? {})) {
        result[sym] = (bars as any[]).map(b => ({
          time: Math.floor(new Date(b.t).getTime() / 1000),
          open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
        }));
      }
      return result;
    } catch {
      return {};
    }
  }

  // ─── Signal Detection ─────────────────────────────────────

  private async detectSignals(
    asset: { id: string; symbol: string },
    data: {
      price: number; priceChange24h: number; priceChange1h?: number;
      rsi: number | null; volumeRatio: number | null;
      prevClose: number; dayHigh: number; dayLow: number;
    },
    closes: number[],
    volumes: number[]
  ): Promise<number> {
    let count = 0;

    // 1. RSI extremes
    if (data.rsi !== null) {
      if (data.rsi <= EQUITY_RSI_OVERSOLD) {
        await this.writeSignal(asset.id, "rsi_oversold",
          data.rsi <= 20 ? "high" : "medium", data.rsi,
          { symbol: asset.symbol, rsi: data.rsi });
        count++;
      } else if (data.rsi >= EQUITY_RSI_OVERBOUGHT) {
        await this.writeSignal(asset.id, "rsi_overbought",
          data.rsi >= 80 ? "high" : "medium", data.rsi,
          { symbol: asset.symbol, rsi: data.rsi });
        count++;
      }
    }

    // 2. Volume spike
    if (data.volumeRatio !== null && data.volumeRatio >= EQUITY_VOLUME_SPIKE) {
      await this.writeSignal(asset.id, "volume_spike",
        data.volumeRatio >= 5.0 ? "high" : "medium", data.volumeRatio,
        { symbol: asset.symbol, volume_ratio: data.volumeRatio });
      count++;
    }

    // 3. Drawdown from period high
    const drawdown = computeDrawdown(closes);
    if (drawdown !== null && drawdown <= EQUITY_DRAWDOWN_THRESHOLD) {
      await this.writeSignal(asset.id, "drawdown_from_7d_high",
        drawdown <= -0.20 ? "critical" : drawdown <= -0.15 ? "high" : "medium",
        drawdown,
        { symbol: asset.symbol, current_price: data.price, period_high: Math.max(...closes) });
      count++;
    }

    // 4. Gap detection (equity-specific)
    if (data.prevClose > 0) {
      const gapPct = (data.price - data.prevClose) / data.prevClose;
      if (Math.abs(gapPct) >= EQUITY_GAP_THRESHOLD) {
        const direction = gapPct > 0 ? "gap_up" : "gap_down";
        await this.writeSignal(asset.id, direction,
          Math.abs(gapPct) >= 0.05 ? "high" : "medium", gapPct,
          { symbol: asset.symbol, gap_pct: gapPct, prev_close: data.prevClose });
        count++;
      }
    }

    return count;
  }

  // ─── Helpers ──────────────────────────────────────────────

  private async getActiveAssets(): Promise<Array<{ id: string; symbol: string }>> {
    return this.db
      .select({ id: tradingAssets.id, symbol: tradingAssets.symbol })
      .from(tradingAssets)
      .where(and(
        eq(tradingAssets.assetClass, "equity"),
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
    console.log(`[Alpaca] SIGNAL [${severity}] ${context.symbol}: ${signalType} = ${value}`);
  }

  private async log(level: string, message: string, context?: Record<string, unknown>) {
    await this.db.insert(tradingAgentLogs).values({
      agentName: "scanner_equity", logLevel: level, message, context: context ?? {},
    });
  }

  /**
   * Seed equity assets into the database.
   * Called once during setup to populate the trading_assets table.
   */
  async seedAssets(symbols?: string[]): Promise<number> {
    const universe = symbols ?? DEFAULT_EQUITY_UNIVERSE;
    let added = 0;

    for (const ticker of universe) {
      const symbol = `${ticker}/USD`;
      // Check if already exists
      const existing = await this.db
        .select({ id: tradingAssets.id })
        .from(tradingAssets)
        .where(and(
          eq(tradingAssets.symbol, symbol),
          eq(tradingAssets.exchange, "alpaca")
        ))
        .limit(1);

      if (existing.length === 0) {
        const [base] = ticker.split("/");
        await this.db.insert(tradingAssets).values({
          symbol,
          assetClass: "equity",
          exchange: "alpaca",
          baseCurrency: base ?? ticker,
          quoteCurrency: "USD",
          isActive: true,
          metadata: { source: "alpaca", universe: "default" },
        });
        added++;
        console.log(`[Alpaca] Added equity asset: ${symbol}`);
      }
    }

    console.log(`[Alpaca] Seeded ${added} new equity assets (${universe.length} total universe)`);
    return added;
  }
}

// ─── Technical Indicators (shared with crypto scanner) ──────
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
