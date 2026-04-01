/**
 * Migration V6 — Multi-Tenant User Support
 * ==========================================
 * Adds:
 *   - trading_users table (Clerk-backed user accounts)
 *   - user_id column on trading_connector_config
 *   - user_id column on trading_paper_trades
 *   - user_id column on trading_hypotheses
 *   - API keys table for user-owned broker credentials
 *   - User preferences/settings table
 */

import type postgres from "postgres";

export async function runV6Migration(sql: ReturnType<typeof postgres>): Promise<void> {
  console.log("[Migration V6] Running multi-tenant user migration...");

  // 1. Users table — synced from Clerk
  await sql`
    CREATE TABLE IF NOT EXISTS trading_users (
      id VARCHAR(100) PRIMARY KEY,
      clerk_id VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      avatar_url TEXT,
      plan VARCHAR(20) DEFAULT 'free',
      is_active BOOLEAN DEFAULT true,
      onboarded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // 2. User API keys — encrypted broker credentials per user
  await sql`
    CREATE TABLE IF NOT EXISTS trading_user_api_keys (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id VARCHAR(100) NOT NULL REFERENCES trading_users(id),
      connector_id VARCHAR(50) NOT NULL,
      credentials JSONB NOT NULL DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      last_validated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, connector_id)
    );
  `;

  // 3. User settings / preferences
  await sql`
    CREATE TABLE IF NOT EXISTS trading_user_settings (
      user_id VARCHAR(100) PRIMARY KEY REFERENCES trading_users(id),
      risk_level VARCHAR(20) DEFAULT 'moderate',
      max_open_positions INTEGER DEFAULT 5,
      auto_trade BOOLEAN DEFAULT false,
      notifications_email BOOLEAN DEFAULT true,
      notifications_push BOOLEAN DEFAULT false,
      preferred_markets JSONB DEFAULT '["crypto"]',
      settings JSONB DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // 4. Add user_id to existing tables (nullable for backward compat)
  await sql`
    DO $$ BEGIN
      ALTER TABLE trading_connector_config ADD COLUMN IF NOT EXISTS user_id VARCHAR(100);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `;

  await sql`
    DO $$ BEGIN
      ALTER TABLE trading_paper_trades ADD COLUMN IF NOT EXISTS user_id VARCHAR(100);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `;

  await sql`
    DO $$ BEGIN
      ALTER TABLE trading_hypotheses ADD COLUMN IF NOT EXISTS user_id VARCHAR(100);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `;

  await sql`
    DO $$ BEGIN
      ALTER TABLE trading_signals ADD COLUMN IF NOT EXISTS user_id VARCHAR(100);
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `;

  // 5. Indexes for user-scoped queries
  await sql`
    CREATE INDEX IF NOT EXISTS idx_user_api_keys_user ON trading_user_api_keys(user_id);
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_paper_trades_user ON trading_paper_trades(user_id);
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_hypotheses_user ON trading_hypotheses(user_id);
  `;

  console.log("[Migration V6] Multi-tenant migration complete");
  console.log("[Migration V6] Created: trading_users, trading_user_api_keys, trading_user_settings");
  console.log("[Migration V6] Added user_id to: connector_config, paper_trades, hypotheses, signals");
}
