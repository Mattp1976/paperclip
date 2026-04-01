/**
 * Migration V5 — Forex & Futures Support
 * ========================================
 * Adds:
 *   - IBKR connector configuration
 *   - Forex-specific signal types (spread_alert)
 *   - Futures-specific signal types (limit_up, limit_down)
 *   - Forex asset seeding (20 pairs via OANDA)
 *   - Futures asset seeding (20 contracts via IBKR)
 *   - AssetClass expansion for commodity support
 */

import type postgres from "postgres";

export async function runV5Migration(sql: ReturnType<typeof postgres>): Promise<void> {
  console.log("[Migration V5] Running forex & futures migration...");

  // 1. Add IBKR connector config (OANDA already exists from v4)
  await sql`
    INSERT INTO trading_connector_config (id, name, asset_class, is_active, credentials_env)
    VALUES
      ('ibkr', 'Interactive Brokers (Futures)', 'commodity', false,
       '{"gateway_url": "IBKR_GATEWAY_URL", "account_id": "IBKR_ACCOUNT_ID"}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  `;

  // 2. Seed forex assets (OANDA universe)
  const forexPairs = [
    { symbol: "EUR/USD", base: "EUR", quote: "USD", name: "Euro / US Dollar" },
    { symbol: "GBP/USD", base: "GBP", quote: "USD", name: "British Pound / US Dollar" },
    { symbol: "USD/JPY", base: "USD", quote: "JPY", name: "US Dollar / Japanese Yen" },
    { symbol: "USD/CHF", base: "USD", quote: "CHF", name: "US Dollar / Swiss Franc" },
    { symbol: "AUD/USD", base: "AUD", quote: "USD", name: "Australian Dollar / US Dollar" },
    { symbol: "USD/CAD", base: "USD", quote: "CAD", name: "US Dollar / Canadian Dollar" },
    { symbol: "NZD/USD", base: "NZD", quote: "USD", name: "New Zealand Dollar / US Dollar" },
    { symbol: "EUR/GBP", base: "EUR", quote: "GBP", name: "Euro / British Pound" },
    { symbol: "EUR/JPY", base: "EUR", quote: "JPY", name: "Euro / Japanese Yen" },
    { symbol: "GBP/JPY", base: "GBP", quote: "JPY", name: "British Pound / Japanese Yen" },
    { symbol: "EUR/AUD", base: "EUR", quote: "AUD", name: "Euro / Australian Dollar" },
    { symbol: "EUR/CHF", base: "EUR", quote: "CHF", name: "Euro / Swiss Franc" },
    { symbol: "AUD/JPY", base: "AUD", quote: "JPY", name: "Australian Dollar / Japanese Yen" },
    { symbol: "GBP/AUD", base: "GBP", quote: "AUD", name: "British Pound / Australian Dollar" },
    { symbol: "GBP/CHF", base: "GBP", quote: "CHF", name: "British Pound / Swiss Franc" },
    { symbol: "AUD/CAD", base: "AUD", quote: "CAD", name: "Australian Dollar / Canadian Dollar" },
    { symbol: "NZD/CAD", base: "NZD", quote: "CAD", name: "New Zealand Dollar / Canadian Dollar" },
    { symbol: "CAD/JPY", base: "CAD", quote: "JPY", name: "Canadian Dollar / Japanese Yen" },
    { symbol: "XAU/USD", base: "XAU", quote: "USD", name: "Gold / US Dollar" },
    { symbol: "XAG/USD", base: "XAG", quote: "USD", name: "Silver / US Dollar" },
  ];

  for (const pair of forexPairs) {
    await sql`
      INSERT INTO trading_assets (symbol, asset_class, exchange, base_currency, quote_currency, is_active, metadata)
      VALUES (${pair.symbol}, 'forex', 'oanda', ${pair.base}, ${pair.quote}, false, ${JSON.stringify({ name: pair.name })}::jsonb)
      ON CONFLICT (symbol, exchange) DO NOTHING;
    `;
  }

  // 3. Seed futures assets (IBKR universe)
  const futuresContracts = [
    { symbol: "ES/USD", base: "ES", name: "E-mini S&P 500", exchange_name: "CME", multiplier: 50 },
    { symbol: "NQ/USD", base: "NQ", name: "E-mini Nasdaq 100", exchange_name: "CME", multiplier: 20 },
    { symbol: "YM/USD", base: "YM", name: "E-mini Dow Jones", exchange_name: "CBOT", multiplier: 5 },
    { symbol: "RTY/USD", base: "RTY", name: "E-mini Russell 2000", exchange_name: "CME", multiplier: 50 },
    { symbol: "MES/USD", base: "MES", name: "Micro E-mini S&P 500", exchange_name: "CME", multiplier: 5 },
    { symbol: "MNQ/USD", base: "MNQ", name: "Micro E-mini Nasdaq 100", exchange_name: "CME", multiplier: 2 },
    { symbol: "CL/USD", base: "CL", name: "Crude Oil WTI", exchange_name: "NYMEX", multiplier: 1000 },
    { symbol: "NG/USD", base: "NG", name: "Natural Gas", exchange_name: "NYMEX", multiplier: 10000 },
    { symbol: "GC/USD", base: "GC", name: "Gold", exchange_name: "COMEX", multiplier: 100 },
    { symbol: "SI/USD", base: "SI", name: "Silver", exchange_name: "COMEX", multiplier: 5000 },
    { symbol: "HG/USD", base: "HG", name: "Copper", exchange_name: "COMEX", multiplier: 25000 },
    { symbol: "ZB/USD", base: "ZB", name: "30-Year Treasury Bond", exchange_name: "CBOT", multiplier: 1000 },
    { symbol: "ZN/USD", base: "ZN", name: "10-Year Treasury Note", exchange_name: "CBOT", multiplier: 1000 },
    { symbol: "ZF/USD", base: "ZF", name: "5-Year Treasury Note", exchange_name: "CBOT", multiplier: 1000 },
    { symbol: "ZC/USD", base: "ZC", name: "Corn", exchange_name: "CBOT", multiplier: 50 },
    { symbol: "ZS/USD", base: "ZS", name: "Soybeans", exchange_name: "CBOT", multiplier: 50 },
    { symbol: "ZW/USD", base: "ZW", name: "Wheat", exchange_name: "CBOT", multiplier: 50 },
    { symbol: "6E/USD", base: "6E", name: "Euro FX Futures", exchange_name: "CME", multiplier: 125000 },
    { symbol: "6B/USD", base: "6B", name: "British Pound Futures", exchange_name: "CME", multiplier: 62500 },
    { symbol: "6J/USD", base: "6J", name: "Japanese Yen Futures", exchange_name: "CME", multiplier: 12500000 },
  ];

  for (const future of futuresContracts) {
    await sql`
      INSERT INTO trading_assets (symbol, asset_class, exchange, base_currency, quote_currency, is_active, metadata)
      VALUES (${future.symbol}, 'commodity', 'ibkr', ${future.base}, 'USD', false,
        ${JSON.stringify({ name: future.name, exchange: future.exchange_name, multiplier: future.multiplier })}::jsonb)
      ON CONFLICT (symbol, exchange) DO NOTHING;
    `;
  }

  // 4. Add connector column for market identifier on paper trades (if not exists)
  await sql`
    DO $$ BEGIN
      ALTER TABLE trading_paper_trades ADD COLUMN IF NOT EXISTS connector VARCHAR(30) DEFAULT 'kraken';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `;

  console.log("[Migration V5] Forex & futures migration complete");
  console.log("[Migration V5] Seeded 20 forex pairs (inactive by default — activate when OANDA keys are set)");
  console.log("[Migration V5] Seeded 20 futures contracts (inactive by default — activate when IBKR is connected)");
}
