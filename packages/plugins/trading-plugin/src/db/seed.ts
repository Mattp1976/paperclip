/**
 * Seed Script — Top 30 Crypto Assets
 * ====================================
 * Populates the trading_assets table with the top 30
 * crypto assets by market cap (Kraken USDT pairs).
 *
 * Run once after initial migration:
 *   npx tsx src/db/seed.ts
 */

import { eq, and } from "drizzle-orm";
import { tradingAssets, tradingConfig } from "./schema.js";

// Kraken uses XBT instead of BTC, and USDT pairs are standard.
// Some smaller coins may not have USDT pairs on Kraken — those use USD.
// The scanner's KRAKEN_PAIR_MAP handles the translation.
const CRYPTO_ASSETS = [
  { symbol: "XBTUSDT",   base: "XBT",   quote: "USDT" },
  { symbol: "ETHUSDT",   base: "ETH",   quote: "USDT" },
  { symbol: "XRPUSDT",   base: "XRP",   quote: "USDT" },
  { symbol: "SOLUSDT",   base: "SOL",   quote: "USDT" },
  { symbol: "ADAUSDT",   base: "ADA",   quote: "USDT" },
  { symbol: "DOGEUSDT",  base: "DOGE",  quote: "USDT" },
  { symbol: "TRXUSDT",   base: "TRX",   quote: "USDT" },
  { symbol: "AVAXUSDT",  base: "AVAX",  quote: "USDT" },
  { symbol: "DOTUSDT",   base: "DOT",   quote: "USDT" },
  { symbol: "LINKUSDT",  base: "LINK",  quote: "USDT" },
  { symbol: "MATICUSDT", base: "MATIC", quote: "USDT" },
  { symbol: "SHIBUSDT",  base: "SHIB",  quote: "USDT" },
  { symbol: "LTCUSDT",   base: "LTC",   quote: "USDT" },
  { symbol: "UNIUSDT",   base: "UNI",   quote: "USDT" },
  { symbol: "ATOMUSDT",  base: "ATOM",  quote: "USDT" },
  { symbol: "XLMUSDT",   base: "XLM",   quote: "USDT" },
  { symbol: "ETCUSDT",   base: "ETC",   quote: "USDT" },
  { symbol: "NEARUSDT",  base: "NEAR",  quote: "USDT" },
  { symbol: "FILUSDT",   base: "FIL",   quote: "USDT" },
  { symbol: "APTUSDT",   base: "APT",   quote: "USDT" },
  { symbol: "ARBUSDT",   base: "ARB",   quote: "USDT" },
  { symbol: "OPUSDT",    base: "OP",    quote: "USDT" },
  { symbol: "AAVEUSDT",  base: "AAVE",  quote: "USDT" },
  { symbol: "MKRUSDT",   base: "MKR",   quote: "USDT" },
  { symbol: "GRTUSDT",   base: "GRT",   quote: "USDT" },
  { symbol: "INJUSDT",   base: "INJ",   quote: "USDT" },
  { symbol: "RNDRUSDT",  base: "RNDR",  quote: "USDT" },
  { symbol: "TIAUSDT",   base: "TIA",   quote: "USDT" },
  { symbol: "SUIUSDT",   base: "SUI",   quote: "USDT" },
  { symbol: "PEPEUSDT",  base: "PEPE",  quote: "USDT" },
];

const DEFAULT_CONFIG_ENTRIES = [
  {
    key: "system.phase",
    value: 1,
    description: "Current system phase: 1=Scan, 2=Hypothesis+Backtest, 3=Paper, 4=Live",
  },
  {
    key: "scanner.interval_seconds",
    value: 300,
    description: "How often the scanner runs (seconds)",
  },
  {
    key: "hypothesis.max_active",
    value: 20,
    description: "Maximum active hypotheses at any time",
  },
  {
    key: "backtest.min_sharpe",
    value: 1.5,
    description: "Minimum Sharpe ratio to promote a hypothesis",
  },
  {
    key: "backtest.min_trades",
    value: 30,
    description: "Minimum trade count for meaningful backtest",
  },
  {
    key: "risk.max_position_pct",
    value: 10,
    description: "Max portfolio % for a single position",
  },
  {
    key: "risk.max_total_exposure_pct",
    value: 50,
    description: "Max total portfolio exposure %",
  },
  {
    key: "paper.min_weeks",
    value: 4,
    description: "Minimum paper trading weeks before live promotion",
  },
];

/**
 * Run the seed function with a Drizzle db instance.
 * Idempotent — uses ON CONFLICT DO NOTHING semantics via checking.
 */
export async function seedDatabase(db: any): Promise<void> {
  console.log("[Seed] Seeding trading_assets...");

  let inserted = 0;
  for (const asset of CRYPTO_ASSETS) {
    // Check if already exists
    const existing = await db
      .select({ id: tradingAssets.id })
      .from(tradingAssets)
      .where(
        and(
          eq(tradingAssets.symbol, asset.symbol),
          eq(tradingAssets.exchange, "kraken")
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(tradingAssets).values({
        symbol: asset.symbol,
        assetClass: "crypto",
        exchange: "kraken",
        baseCurrency: asset.base,
        quoteCurrency: asset.quote,
        isActive: true,
        metadata: { source: "seed", market_cap_rank: CRYPTO_ASSETS.indexOf(asset) + 1 },
      });
      inserted++;
    }
  }
  console.log(`[Seed] Assets: ${inserted} inserted, ${CRYPTO_ASSETS.length - inserted} already existed`);

  // Seed config
  console.log("[Seed] Seeding trading_config...");
  let configInserted = 0;
  for (const entry of DEFAULT_CONFIG_ENTRIES) {
    const existing = await db
      .select({ key: tradingConfig.key })
      .from(tradingConfig)
      .where(eq(tradingConfig.key, entry.key))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(tradingConfig).values({
        key: entry.key,
        value: entry.value,
        description: entry.description,
      });
      configInserted++;
    }
  }
  console.log(`[Seed] Config: ${configInserted} inserted, ${DEFAULT_CONFIG_ENTRIES.length - configInserted} already existed`);

  console.log("[Seed] Done.");
}
