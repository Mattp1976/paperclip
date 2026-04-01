/**
 * Migration V4 — Multi-Market Support
 * =====================================
 * Adds:
 *   - Equity signal types (gap_up, gap_down)
 *   - Alpaca connector configuration
 *   - Market-specific columns to paper trades
 *   - Cross-market correlation tracking
 */

import type postgres from "postgres";

export async function runV4Migration(sql: ReturnType<typeof postgres>): Promise<void> {
  console.log("[Migration V4] Running multi-market migration...");

  // 1. Add market column to paper trades (tracks which connector executed the trade)
  await sql`
    DO $$ BEGIN
      ALTER TABLE trading_paper_trades ADD COLUMN IF NOT EXISTS market VARCHAR(20) DEFAULT 'crypto';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `;

  // 2. Add connector column to snapshots (tracks data source)
  await sql`
    DO $$ BEGIN
      ALTER TABLE trading_snapshots ADD COLUMN IF NOT EXISTS connector VARCHAR(30) DEFAULT 'kraken';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `;

  // 3. Add market-specific metadata to hypotheses
  await sql`
    DO $$ BEGIN
      ALTER TABLE trading_hypotheses ADD COLUMN IF NOT EXISTS markets JSONB DEFAULT '["crypto"]'::jsonb;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `;

  // 4. Create cross-market signals table
  await sql`
    CREATE TABLE IF NOT EXISTS trading_cross_market_signals (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      signal_type VARCHAR(100) NOT NULL,
      severity VARCHAR(10) DEFAULT 'medium',
      markets JSONB NOT NULL DEFAULT '[]',
      description TEXT NOT NULL,
      context JSONB DEFAULT '{}',
      detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_cross_signals_active
      ON trading_cross_market_signals(is_active, detected_at DESC);
  `;

  // 5. Create connector config table
  await sql`
    CREATE TABLE IF NOT EXISTS trading_connector_config (
      id VARCHAR(30) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      asset_class VARCHAR(20) NOT NULL,
      is_active BOOLEAN DEFAULT false,
      config JSONB DEFAULT '{}',
      credentials_env JSONB DEFAULT '{}',
      last_scan_at TIMESTAMPTZ,
      last_error TEXT,
      scan_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // 6. Insert default connector configs
  await sql`
    INSERT INTO trading_connector_config (id, name, asset_class, is_active, credentials_env)
    VALUES
      ('kraken', 'Kraken (Crypto)', 'crypto', true,
       '{"api_key": "KRAKEN_API_KEY", "api_secret": "KRAKEN_API_SECRET"}'::jsonb),
      ('alpaca', 'Alpaca Markets (US Equities)', 'equity', false,
       '{"api_key": "ALPACA_API_KEY", "api_secret": "ALPACA_API_SECRET"}'::jsonb),
      ('oanda', 'OANDA (Forex)', 'forex', false,
       '{"api_key": "OANDA_API_KEY", "account_id": "OANDA_ACCOUNT_ID"}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  `;

  // 7. Add equity-specific signal types as seed data (for reference)
  // gap_up, gap_down are new equity-specific signals
  // The existing signal types work for equities too: rsi_oversold, rsi_overbought, volume_spike, drawdown_from_7d_high

  // 8. Seed default equity assets (Alpaca universe)
  const equitySymbols = [
    { symbol: "AAPL/USD", base: "AAPL", name: "Apple Inc." },
    { symbol: "MSFT/USD", base: "MSFT", name: "Microsoft Corp." },
    { symbol: "GOOGL/USD", base: "GOOGL", name: "Alphabet Inc." },
    { symbol: "AMZN/USD", base: "AMZN", name: "Amazon.com Inc." },
    { symbol: "NVDA/USD", base: "NVDA", name: "NVIDIA Corp." },
    { symbol: "META/USD", base: "META", name: "Meta Platforms Inc." },
    { symbol: "TSLA/USD", base: "TSLA", name: "Tesla Inc." },
    { symbol: "SPY/USD", base: "SPY", name: "SPDR S&P 500 ETF" },
    { symbol: "QQQ/USD", base: "QQQ", name: "Invesco QQQ Trust" },
    { symbol: "IWM/USD", base: "IWM", name: "iShares Russell 2000 ETF" },
    { symbol: "DIA/USD", base: "DIA", name: "SPDR Dow Jones Industrial ETF" },
    { symbol: "XLF/USD", base: "XLF", name: "Financial Select Sector SPDR" },
    { symbol: "XLE/USD", base: "XLE", name: "Energy Select Sector SPDR" },
    { symbol: "XLK/USD", base: "XLK", name: "Technology Select Sector SPDR" },
    { symbol: "GLD/USD", base: "GLD", name: "SPDR Gold Shares ETF" },
    { symbol: "TLT/USD", base: "TLT", name: "iShares 20+ Year Treasury Bond ETF" },
    { symbol: "AMD/USD", base: "AMD", name: "Advanced Micro Devices" },
    { symbol: "NFLX/USD", base: "NFLX", name: "Netflix Inc." },
    { symbol: "CRM/USD", base: "CRM", name: "Salesforce Inc." },
    { symbol: "ORCL/USD", base: "ORCL", name: "Oracle Corp." },
    { symbol: "COIN/USD", base: "COIN", name: "Coinbase Global Inc." },
    { symbol: "MSTR/USD", base: "MSTR", name: "MicroStrategy Inc." },
    { symbol: "PLTR/USD", base: "PLTR", name: "Palantir Technologies" },
    { symbol: "SOFI/USD", base: "SOFI", name: "SoFi Technologies" },
  ];

  for (const eq of equitySymbols) {
    // Use raw ON CONFLICT on the unique index columns instead of constraint name
    await sql`
      INSERT INTO trading_assets (symbol, asset_class, exchange, base_currency, quote_currency, is_active, metadata)
      VALUES (${eq.symbol}, 'equity', 'alpaca', ${eq.base}, 'USD', false, ${JSON.stringify({ name: eq.name })}::jsonb)
      ON CONFLICT (symbol, exchange) DO NOTHING;
    `;
  }

  console.log("[Migration V4] Multi-market migration complete");
  console.log("[Migration V4] Seeded 24 equity assets (inactive by default — activate when Alpaca keys are set)");
}
