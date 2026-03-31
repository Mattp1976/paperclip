/**
 * V2 Migration — Portfolio Management Tables
 */
export async function runV2Migration(sql: any): Promise<void> {
  console.log("[Migration V2] Running portfolio management migration...");

  await sql`CREATE TABLE IF NOT EXISTS trading_portfolio_config (
    id SERIAL PRIMARY KEY, total_capital NUMERIC NOT NULL DEFAULT 100000,
    allocation_method VARCHAR(50) DEFAULT 'equal_weight',
    risk_per_trade NUMERIC DEFAULT 0.01, max_open_positions INTEGER DEFAULT 10,
    max_exposure NUMERIC DEFAULT 0.30, max_exposure_per_asset NUMERIC DEFAULT 0.10,
    max_exposure_per_strategy NUMERIC DEFAULT 0.20,
    max_daily_loss NUMERIC DEFAULT 0.03, max_weekly_loss NUMERIC DEFAULT 0.06,
    max_drawdown NUMERIC DEFAULT 0.10, max_leverage NUMERIC DEFAULT 2.0,
    require_stop_loss BOOLEAN DEFAULT true,
    disable_after_consecutive_losses INTEGER DEFAULT 5,
    updated_at TIMESTAMP DEFAULT NOW())`;

  await sql`CREATE TABLE IF NOT EXISTS trading_strategy_allocations (
    id SERIAL PRIMARY KEY, hypothesis_id INTEGER NOT NULL,
    allocation_pct NUMERIC NOT NULL, allocated_capital NUMERIC NOT NULL,
    status VARCHAR(30) DEFAULT 'active', score NUMERIC,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`;

  await sql`CREATE TABLE IF NOT EXISTS trading_portfolio_equity (
    id SERIAL PRIMARY KEY, timestamp TIMESTAMP DEFAULT NOW(),
    total_equity NUMERIC NOT NULL, allocated_capital NUMERIC NOT NULL DEFAULT 0,
    available_capital NUMERIC NOT NULL DEFAULT 0,
    unrealised_pnl NUMERIC NOT NULL DEFAULT 0, realised_pnl NUMERIC NOT NULL DEFAULT 0,
    total_exposure NUMERIC NOT NULL DEFAULT 0, exposure_pct NUMERIC NOT NULL DEFAULT 0,
    drawdown NUMERIC NOT NULL DEFAULT 0, drawdown_pct NUMERIC NOT NULL DEFAULT 0,
    peak_equity NUMERIC NOT NULL, open_positions INTEGER NOT NULL DEFAULT 0,
    daily_return NUMERIC, metadata JSONB DEFAULT '{}')`;

  await sql`CREATE TABLE IF NOT EXISTS trading_risk_events (
    id SERIAL PRIMARY KEY, event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info', message TEXT NOT NULL,
    hypothesis_id INTEGER, asset_symbol VARCHAR(30),
    context JSONB DEFAULT '{}', created_at TIMESTAMP DEFAULT NOW())`;

  await sql`CREATE TABLE IF NOT EXISTS trading_alerts (
    id SERIAL PRIMARY KEY, alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    title VARCHAR(200) NOT NULL, message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false, is_acknowledged BOOLEAN DEFAULT false,
    context JSONB DEFAULT '{}', created_at TIMESTAMP DEFAULT NOW())`;

  await sql`CREATE TABLE IF NOT EXISTS trading_lifecycle_transitions (
    id SERIAL PRIMARY KEY, hypothesis_id INTEGER NOT NULL,
    from_status VARCHAR(30) NOT NULL, to_status VARCHAR(30) NOT NULL,
    reason TEXT, triggered_by VARCHAR(50) DEFAULT 'system',
    context JSONB DEFAULT '{}', created_at TIMESTAMP DEFAULT NOW())`;

  const existing = await sql`SELECT COUNT(*)::int AS c FROM trading_portfolio_config`;
  if (existing[0].c === 0) {
    await sql`INSERT INTO trading_portfolio_config (total_capital) VALUES (100000)`;
  }
  console.log("[Migration V2] Portfolio management tables ready");
}
