-- ASI Trading System — Database Migration
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS trading_assets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL, asset_class VARCHAR(20) NOT NULL, exchange VARCHAR(50) NOT NULL,
  base_currency VARCHAR(10), quote_currency VARCHAR(10), is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS trading_assets_symbol_exchange ON trading_assets(symbol, exchange);

CREATE TABLE IF NOT EXISTS trading_snapshots (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES trading_assets(id), timestamp TIMESTAMPTZ NOT NULL,
  price NUMERIC(20,8) NOT NULL, volume_24h NUMERIC(20,2), price_change_1h NUMERIC(10,4),
  price_change_24h NUMERIC(10,4), price_change_7d NUMERIC(10,4), high_24h NUMERIC(20,8),
  low_24h NUMERIC(20,8), rsi_14 NUMERIC(6,2), volume_ratio NUMERIC(10,4),
  funding_rate NUMERIC(10,6), raw_data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trading_snapshots_asset_time ON trading_snapshots(asset_id, timestamp);
CREATE INDEX IF NOT EXISTS trading_snapshots_timestamp ON trading_snapshots(timestamp);

CREATE TABLE IF NOT EXISTS trading_signals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES trading_assets(id), signal_type VARCHAR(50) NOT NULL,
  severity VARCHAR(10), value NUMERIC(20,8), context JSONB DEFAULT '{}',
  detected_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ, is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trading_signals_active ON trading_signals(is_active, detected_at);
CREATE INDEX IF NOT EXISTS trading_signals_type ON trading_signals(signal_type, detected_at);

CREATE TABLE IF NOT EXISTS trading_hypotheses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(200) NOT NULL, description TEXT NOT NULL, asset_class VARCHAR(20) NOT NULL,
  strategy_type VARCHAR(50) NOT NULL, entry_rules JSONB NOT NULL, exit_rules JSONB NOT NULL,
  risk_params JSONB NOT NULL DEFAULT '{"max_position_pct":2,"stop_loss_pct":5,"take_profit_pct":10}',
  status VARCHAR(20) DEFAULT 'draft', confidence NUMERIC(5,2) DEFAULT 0,
  generation INTEGER DEFAULT 1, parent_id UUID, created_by VARCHAR(50) DEFAULT 'hypothesis_agent',
  promoted_at TIMESTAMPTZ, retired_at TIMESTAMPTZ, retirement_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trading_hypotheses_status ON trading_hypotheses(status);
CREATE INDEX IF NOT EXISTS trading_hypotheses_confidence ON trading_hypotheses(confidence);

CREATE TABLE IF NOT EXISTS trading_backtest_results (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  hypothesis_id UUID NOT NULL REFERENCES trading_hypotheses(id),
  period_start DATE NOT NULL, period_end DATE NOT NULL,
  total_trades INTEGER NOT NULL, winning_trades INTEGER NOT NULL, losing_trades INTEGER NOT NULL,
  win_rate NUMERIC(5,2), total_return NUMERIC(10,4), sharpe_ratio NUMERIC(8,4),
  max_drawdown NUMERIC(10,4), avg_trade_return NUMERIC(10,6), profit_factor NUMERIC(8,4),
  calmar_ratio NUMERIC(8,4), avg_hold_hours NUMERIC(10,2), raw_results JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trading_backtest_hypothesis ON trading_backtest_results(hypothesis_id, created_at);

CREATE TABLE IF NOT EXISTS trading_paper_trades (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  hypothesis_id UUID NOT NULL REFERENCES trading_hypotheses(id),
  asset_id UUID NOT NULL REFERENCES trading_assets(id),
  direction VARCHAR(5) NOT NULL, entry_price NUMERIC(20,8) NOT NULL, entry_time TIMESTAMPTZ NOT NULL,
  exit_price NUMERIC(20,8), exit_time TIMESTAMPTZ, quantity NUMERIC(20,8) NOT NULL,
  pnl NUMERIC(20,8), pnl_pct NUMERIC(10,4), status VARCHAR(20) DEFAULT 'open',
  entry_signal_id UUID, exit_reason VARCHAR(100), metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trading_paper_hypothesis ON trading_paper_trades(hypothesis_id, status);

CREATE TABLE IF NOT EXISTS trading_meta_decisions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cycle_number INTEGER NOT NULL, cycle_date DATE NOT NULL,
  decisions JSONB NOT NULL, reasoning TEXT NOT NULL, performance_summary JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trading_meta_cycle_date ON trading_meta_decisions(cycle_date);

CREATE TABLE IF NOT EXISTS trading_config (
  key VARCHAR(100) PRIMARY KEY, value JSONB NOT NULL, description TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trading_agent_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  agent_name VARCHAR(100) NOT NULL, log_level VARCHAR(10) DEFAULT 'info',
  message TEXT NOT NULL, context JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trading_agent_logs_time ON trading_agent_logs(created_at);
CREATE INDEX IF NOT EXISTS trading_agent_logs_agent ON trading_agent_logs(agent_name, created_at);

INSERT INTO trading_assets (symbol, asset_class, exchange, base_currency, quote_currency, metadata) VALUES
  ('BTC/USD','crypto','kraken','BTC','USD','{"rank":1}'),('ETH/USD','crypto','kraken','ETH','USD','{"rank":2}'),
  ('SOL/USD','crypto','kraken','SOL','USD','{"rank":5}'),('XRP/USD','crypto','kraken','XRP','USD','{"rank":4}'),
  ('ADA/USD','crypto','kraken','ADA','USD','{"rank":9}'),('AVAX/USD','crypto','kraken','AVAX','USD','{"rank":12}'),
  ('DOT/USD','crypto','kraken','DOT','USD','{"rank":13}'),('LINK/USD','crypto','kraken','LINK','USD','{"rank":14}'),
  ('MATIC/USD','crypto','kraken','MATIC','USD','{"rank":18}'),('ATOM/USD','crypto','kraken','ATOM','USD','{"rank":22}'),
  ('UNI/USD','crypto','kraken','UNI','USD','{"rank":20}'),('LTC/USD','crypto','kraken','LTC','USD','{"rank":19}'),
  ('DOGE/USD','crypto','kraken','DOGE','USD','{"rank":8}'),('SHIB/USD','crypto','kraken','SHIB','USD','{"rank":15}'),
  ('FIL/USD','crypto','kraken','FIL','USD','{"rank":30}')
ON CONFLICT (symbol, exchange) DO NOTHING;

INSERT INTO trading_config (key, value, description) VALUES
  ('system.version','"0.1.0"','Current system version'),
  ('scanner.interval_minutes','5','Scanner run interval'),
  ('scanner.enabled','true','Whether scanner is active'),
  ('hypothesis.daily_limit','3','Max new hypotheses per day'),
  ('backtest.min_trades','30','Minimum trades for valid backtest'),
  ('backtest.min_sharpe','1.5','Minimum Sharpe ratio for promotion'),
  ('meta.promotion_threshold','0.65','Confidence threshold for promotion'),
  ('meta.retirement_threshold','0.3','Confidence threshold for retirement')
ON CONFLICT (key) DO NOTHING;