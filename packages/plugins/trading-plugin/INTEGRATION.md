# ASI Trading Plugin — Paperclip Integration Guide

## Overview

The ASI Trading Plugin is a self-improving agent swarm that scans crypto markets, generates trading hypotheses, backtests them against historical data, and iteratively refines strategies through a meta-agent review loop.

**Agents:**
- **Scanner** — Monitors 30 crypto assets on Kraken every 5 minutes. Detects drawdowns, volume spikes, RSI extremes, and funding rate anomalies.
- **Hypothesis** — Uses Claude to generate testable trading strategies from scanner signals. Each hypothesis has explicit entry/exit rules.
- **Backtest** — Simulates hypotheses against 90 days of historical kline data. Computes Sharpe ratio, win rate, max drawdown, profit factor.
- **Meta-Agent** — Weekly review cycle. Promotes, demotes, retires, or evolves hypotheses based on performance.

**Lifecycle:** `draft → testing → paper_trading → live`

---

## 1. Add to the Paperclip Monorepo

Copy the plugin into the Paperclip packages directory:

```bash
cp -r paperclip-trading-plugin/ /path/to/paperclip/packages/plugins/trading/
```

Update the root `pnpm-workspace.yaml` if needed:

```yaml
packages:
  - 'packages/*'
  - 'packages/plugins/*'
```

Install dependencies:

```bash
cd /path/to/paperclip
pnpm install
```

## 2. Environment Variables

Add to your Railway environment (or `.env`):

```
ANTHROPIC_API_KEY=sk-ant-...        # Claude API key (for hypothesis + meta-agent)
KRAKEN_API_KEY=...                   # Kraken API key (read-only is sufficient for Phase 1-2)
KRAKEN_API_SECRET=...                # Kraken API secret
```

The scanner only uses public Kraken endpoints for Phase 1, so `KRAKEN_API_KEY` can be empty initially. You'll need it for Phase 3+ (paper/live trading).

## 3. Database Migration

The plugin adds 9 tables (all prefixed `trading_` to avoid conflicts):

| Table | Purpose |
|-------|---------|
| `trading_assets` | Monitored assets (30 Kraken crypto pairs) |
| `trading_snapshots` | Price/volume/indicator snapshots |
| `trading_signals` | Detected market signals |
| `trading_hypotheses` | Generated trading strategies |
| `trading_backtest_results` | Historical simulation results |
| `trading_paper_trades` | Simulated trades |
| `trading_meta_decisions` | Weekly meta-agent decisions |
| `trading_config` | System configuration |
| `trading_agent_logs` | Agent activity logs |

Push the schema with Drizzle:

```bash
cd packages/plugins/trading
npx drizzle-kit push:pg
```

Then seed the initial assets:

```typescript
import { seedDatabase } from "./src/db/seed.js";
import { db } from "../../db"; // Your Paperclip DB instance
await seedDatabase(db);
```

## 4. Register the Plugin

In your Paperclip server bootstrap (likely `server/src/index.ts` or wherever plugins are loaded):

```typescript
import { TradingPlugin } from "@mattparrytfc/plugin-trading";

const tradingPlugin = new TradingPlugin({
  db,                                       // Drizzle database instance
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  krakenApiKey: process.env.KRAKEN_API_KEY ?? "",
  krakenApiSecret: process.env.KRAKEN_API_SECRET ?? "",
  config: {
    phase: 1,                               // Start with scanning only
    scannerIntervalSeconds: 300,            // 5 minutes
    maxActiveHypotheses: 20,
  },
});

// Start the scanner loop
await tradingPlugin.start();

// Wire scheduled jobs (adapt to your scheduler):
// cron("0 6 * * *",   () => tradingPlugin.runHypothesisCycle());
// cron("0 7 * * *",   () => tradingPlugin.runBacktestCycle());
// cron("0 8 * * 0",   () => tradingPlugin.runMetaCycle());
```

## 5. Dashboard API

Register the dashboard routes with your Express/HTTP layer:

```typescript
import { createDashboardRoutes } from "@mattparrytfc/plugin-trading/dashboard/api";

const dashRoutes = createDashboardRoutes(db);

app.get("/trading/status",      async (_, res) => res.json(await dashRoutes.getStatus()));
app.get("/trading/signals",     async (req, res) => res.json(await dashRoutes.getSignals(Number(req.query.hours ?? 24))));
app.get("/trading/hypotheses",  async (_, res) => res.json(await dashRoutes.getHypotheses()));
app.get("/trading/meta/history", async (_, res) => res.json(await dashRoutes.getMetaHistory()));
app.get("/trading/logs",        async (_, res) => res.json(await dashRoutes.getLogs()));
```

## 6. Phased Rollout

| Phase | What's Active | When to Move On |
|-------|--------------|-----------------|
| **1 — Scan** | Scanner only. Collects data, detects signals. | After 1-2 weeks of clean signal data. |
| **2 — Hypothesis + Backtest** | Hypothesis agent generates strategies. Backtest agent evaluates them. | When you have 5+ hypotheses passing backtest thresholds. |
| **3 — Paper Trading** | Promoted hypotheses run simulated trades against live prices. Meta-agent reviews weekly. | After 4+ weeks of paper trading with positive results. |
| **4 — Live** | Hypotheses that survive paper trading can execute real trades. | At your discretion. Requires signed exchange credentials. |

To change phase:

```typescript
// Update in code
tradingPlugin = new TradingPlugin({ ...ctx, config: { phase: 2 } });

// Or update in DB
await db.update(tradingConfig).set({ value: 2 }).where(eq(tradingConfig.key, "system.phase"));
```

## 7. File Structure

```
paperclip-trading-plugin/
├── package.json
├── tsconfig.json
├── INTEGRATION.md
└── src/
    ├── index.ts                  # Plugin entry point + TradingPlugin class
    ├── types/
    │   └── index.ts              # TypeScript type definitions
    ├── db/
    │   ├── schema.ts             # Drizzle ORM schema (9 tables)
    │   └── seed.ts               # Initial asset + config seed data
    ├── agents/
    │   ├── scanner.ts            # CryptoScanner — market monitoring
    │   ├── hypothesis.ts         # HypothesisAgent — Claude-powered strategy gen
    │   ├── backtest.ts           # BacktestAgent — historical simulation
    │   └── meta-agent.ts         # MetaAgent — weekly review + evolution
    └── dashboard/
        └── api.ts                # REST endpoints for the dashboard
```

## 8. Key Thresholds

These can be adjusted in `trading_config` or the plugin constructor:

| Threshold | Default | Purpose |
|-----------|---------|---------|
| Scanner interval | 300s (5 min) | How often to scan markets |
| Drawdown threshold | -15% | Signal when 7d drawdown exceeds this |
| Volume spike threshold | 3.0x | Signal when volume is 3x the 20-period average |
| RSI oversold/overbought | 30 / 70 | Signal on RSI extremes |
| Funding rate extreme | 0.1% | Signal on abnormal funding rates |
| Min Sharpe for promotion | 1.5 | Backtest must achieve this to graduate |
| Min trades for evaluation | 30 | Need at least 30 simulated trades |
| Max active hypotheses | 20 | System capacity limit |
| Paper trade min weeks | 4 | Time in paper trading before live |

## 9. Monitoring

Check system health via the dashboard API:

```bash
# System status
curl http://localhost:3000/trading/status

# Recent signals
curl http://localhost:3000/trading/signals?hours=24

# Hypothesis performance
curl http://localhost:3000/trading/hypotheses

# Meta-agent history
curl http://localhost:3000/trading/meta/history

# Agent logs
curl http://localhost:3000/trading/logs
```

## 10. What's Next

After Phase 1 is running cleanly:

1. **Enable Phase 2** — Turn on hypothesis generation and backtesting
2. **Watch the meta-agent** — Review its weekly decisions in the dashboard
3. **Add more signal types** — The scanner can be extended with on-chain metrics, social sentiment, etc.
4. **Cross-asset correlation** — Extend hypotheses to consider multi-asset strategies
5. **Live trading integration** — When paper trading results are solid, wire up Kraken order execution
