CREATE TABLE IF NOT EXISTS trading_subscriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES trading_users(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(100), stripe_subscription_id VARCHAR(100),
  plan_id VARCHAR(20) NOT NULL DEFAULT 'free', status VARCHAR(20) NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ, current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS trading_subscriptions_user ON trading_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS trading_subscriptions_stripe ON trading_subscriptions(stripe_customer_id);