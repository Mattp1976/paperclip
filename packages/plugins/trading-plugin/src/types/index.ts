/**
 * Paperclip Trading Plugin — Type Definitions
 */

// ─── Signal Types ───────────────────────────────────────────
export type SignalType =
  | "drawdown_from_7d_high"
  | "volume_spike"
  | "rsi_oversold"
  | "rsi_overbought"
  | "funding_long_crowded"
  | "funding_short_crowded";

export type Severity = "low" | "medium" | "high" | "critical";

export type AssetClass = "crypto" | "equity" | "forex" | "commodity";

// ─── Hypothesis Types ───────────────────────────────────────
export type StrategyType =
  | "mean_reversion"
  | "momentum"
  | "breakout"
  | "funding_arb"
  | "correlation"
  | "sentiment";

export type HypothesisStatus =
  | "draft"
  | "testing"
  | "paper_trading"
  | "live"
  | "retired"
  | "failed";

export interface EntryCondition {
  indicator: string;
  operator: "<=" | ">=" | "<" | ">" | "==";
  value: number;
}

export interface EntryRules {
  conditions: EntryCondition[];
  logic: "AND" | "OR";
  applicable_symbols: string[] | "all";
  direction: "long" | "short";
}

export interface ExitRules {
  take_profit_pct: number;
  stop_loss_pct: number;
  time_limit_hours: number;
  trailing_stop_pct?: number;
  exit_conditions?: EntryCondition[];
}

export interface RiskParams {
  max_position_pct: number;
  max_concurrent_positions?: number;
  min_volume_24h_usd?: number;
  stop_loss_pct?: number;
  take_profit_pct?: number;
}

// ─── Market Data ────────────────────────────────────────────
export interface MarketSnapshot {
  assetId: string;
  timestamp: Date;
  price: number;
  volume24h?: number;
  priceChange1h?: number;
  priceChange24h?: number;
  priceChange7d?: number;
  high24h?: number;
  low24h?: number;
  rsi14?: number;
  volumeRatio?: number;
  fundingRate?: number;
}

export interface Signal {
  assetId: string;
  signalType: SignalType;
  severity: Severity;
  value: number;
  context: Record<string, unknown>;
  detectedAt: Date;
}

// ─── Meta-Agent ─────────────────────────────────────────────
export type MetaAction =
  | "promote"
  | "demote"
  | "retire"
  | "adjust_params"
  | "spawn_variant"
  | "hold";

export interface MetaDecision {
  hypothesis_id: string;
  action: MetaAction;
  reason: string;
  new_params?: Record<string, unknown>;
}

export interface MetaAnalysis {
  decisions: MetaDecision[];
  system_observations: string;
  focus_areas: string[];
  risk_assessment: string;
}

// ─── Backtest ───────────────────────────────────────────────
export interface BacktestResult {
  periodStart: Date;
  periodEnd: Date;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgTradeReturn: number;
  profitFactor: number;
  calmarRatio?: number;
  avgHoldHours?: number;
}

// ─── Plugin Config ──────────────────────────────────────────
export interface TradingPluginConfig {
  scannerIntervalSeconds: number;
  maxActiveHypotheses: number;
  metaCycleDay: string;
  riskMaxPortfolioPct: number;
  riskMaxTotalExposurePct: number;
  paperTradeMinWeeks: number;
  backtestMinSharpe: number;
  backtestMinTrades: number;
  phase: 1 | 2 | 3 | 4;
}

export const DEFAULT_CONFIG: TradingPluginConfig = {
  scannerIntervalSeconds: 300,
  maxActiveHypotheses: 20,
  metaCycleDay: "sunday",
  riskMaxPortfolioPct: 10,
  riskMaxTotalExposurePct: 50,
  paperTradeMinWeeks: 4,
  backtestMinSharpe: 1.5,
  backtestMinTrades: 30,
  phase: 1,
};
