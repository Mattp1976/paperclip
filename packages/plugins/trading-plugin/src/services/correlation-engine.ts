/**
 * Correlation & Diversification Engine — ASI Trading System
 * ==========================================================
 * Analyses portfolio concentration, asset correlations, and
 * provides diversification scores + warnings.
 *
 * Features:
 *   1. Rolling correlation matrix from price snapshots
 *   2. Concentration risk scoring (HHI — Herfindahl-Hirschman Index)
 *   3. Directional conflict detection (long + short same asset)
 *   4. Sector/asset-class exposure analysis
 *   5. Pre-trade correlation check (can be used by risk manager)
 */
import type { Sql } from "postgres";

interface CorrelationPair {
  assetA: string;
  assetB: string;
  symbolA: string;
  symbolB: string;
  correlation: number;
  dataPoints: number;
}

interface ConcentrationReport {
  hhi: number;                    // 0-10000, higher = more concentrated
  hhiRating: string;              // "diversified" | "moderate" | "concentrated" | "highly_concentrated"
  exposureByAsset: Record<string, { symbol: string; exposure: number; pct: number; direction: string }>;
  exposureBySector: Record<string, { exposure: number; pct: number; count: number }>;
  directionalConflicts: Array<{ symbol: string; longExposure: number; shortExposure: number }>;
  topCorrelations: CorrelationPair[];
  diversificationScore: number;   // 0-100, higher = more diversified
  warnings: string[];
}

export class CorrelationEngine {
  constructor(private sql: Sql) {}

  /**
   * Compute rolling correlation matrix from recent price snapshots.
   * Uses last N hours of 5-min snapshots to calculate Pearson correlation
   * of returns between all asset pairs.
   */
  async getCorrelationMatrix(lookbackHours: number = 48): Promise<CorrelationPair[]> {
    // Get price time series for assets with open positions
    const assets = await this.sql`
      SELECT DISTINCT t.asset_id, a.symbol
      FROM trading_paper_trades t
      JOIN trading_assets a ON a.id = t.asset_id
      WHERE t.status = 'open'
    `;

    if (assets.length < 2) return [];

    const returnsByAsset: Map<string, { symbol: string; returns: number[] }> = new Map();

    for (const asset of assets) {
      const snaps = await this.sql`
        SELECT price, timestamp
        FROM trading_snapshots
        WHERE asset_id = ${asset.asset_id}
          AND timestamp > NOW() - INTERVAL '1 hour' * ${lookbackHours}
        ORDER BY timestamp ASC
      `;

      if (snaps.length < 10) continue;

      // Calculate log returns
      const returns: number[] = [];
      for (let i = 1; i < snaps.length; i++) {
        const prev = parseFloat(snaps[i - 1].price);
        const curr = parseFloat(snaps[i].price);
        if (prev > 0) returns.push(Math.log(curr / prev));
      }

      returnsByAsset.set(asset.asset_id, { symbol: asset.symbol, returns });
    }

    // Calculate pairwise Pearson correlations
    const pairs: CorrelationPair[] = [];
    const assetIds = Array.from(returnsByAsset.keys());

    for (let i = 0; i < assetIds.length; i++) {
      for (let j = i + 1; j < assetIds.length; j++) {
        const a = returnsByAsset.get(assetIds[i])!;
        const b = returnsByAsset.get(assetIds[j])!;

        // Align by using minimum length
        const len = Math.min(a.returns.length, b.returns.length);
        if (len < 10) continue;

        const ra = a.returns.slice(-len);
        const rb = b.returns.slice(-len);

        const corr = this.pearsonCorrelation(ra, rb);

        pairs.push({
          assetA: assetIds[i],
          assetB: assetIds[j],
          symbolA: a.symbol,
          symbolB: b.symbol,
          correlation: Math.round(corr * 1000) / 1000,
          dataPoints: len,
        });
      }
    }

    return pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }

  /**
   * Full concentration report for the current portfolio.
   */
  async getConcentrationReport(): Promise<ConcentrationReport> {
    const warnings: string[] = [];

    // Get all open positions with current prices
    const positions = await this.sql`
      SELECT t.id, t.direction, t.entry_price, t.quantity,
             a.symbol, a.asset_class, a.id as asset_id,
             s.price as current_price
      FROM trading_paper_trades t
      JOIN trading_assets a ON a.id = t.asset_id
      LEFT JOIN LATERAL (
        SELECT price FROM trading_snapshots
        WHERE asset_id = t.asset_id
        ORDER BY timestamp DESC LIMIT 1
      ) s ON true
      WHERE t.status = 'open'
    `;

    if (positions.length === 0) {
      return {
        hhi: 0, hhiRating: "diversified",
        exposureByAsset: {}, exposureBySector: {},
        directionalConflicts: [], topCorrelations: [],
        diversificationScore: 100, warnings: ["No open positions"],
      };
    }

    // Calculate exposure by asset
    const exposureByAsset: Record<string, { symbol: string; exposure: number; pct: number; direction: string }> = {};
    let totalExposure = 0;

    for (const pos of positions) {
      const price = pos.current_price ? parseFloat(pos.current_price) : parseFloat(pos.entry_price);
      const qty = parseFloat(pos.quantity);
      const exposure = price * qty;
      totalExposure += exposure;

      const key = pos.symbol;
      if (!exposureByAsset[key]) {
        exposureByAsset[key] = { symbol: pos.symbol, exposure: 0, pct: 0, direction: pos.direction };
      }
      exposureByAsset[key].exposure += exposure;
      if (exposureByAsset[key].direction !== pos.direction) {
        exposureByAsset[key].direction = "mixed";
      }
    }

    // Calculate percentages
    for (const key of Object.keys(exposureByAsset)) {
      exposureByAsset[key].pct = Math.round(exposureByAsset[key].exposure / totalExposure * 10000) / 100;
    }

    // HHI (Herfindahl-Hirschman Index)
    let hhi = 0;
    for (const key of Object.keys(exposureByAsset)) {
      const pct = exposureByAsset[key].pct;
      hhi += pct * pct;
    }
    hhi = Math.round(hhi);

    let hhiRating: string;
    if (hhi < 1500) hhiRating = "diversified";
    else if (hhi < 2500) hhiRating = "moderate";
    else if (hhi < 5000) hhiRating = "concentrated";
    else hhiRating = "highly_concentrated";

    if (hhi >= 2500) {
      warnings.push(`Portfolio is ${hhiRating} (HHI: ${hhi}). Consider diversifying.`);
    }

    // Sector exposure
    const exposureBySector: Record<string, { exposure: number; pct: number; count: number }> = {};
    for (const pos of positions) {
      const sector = pos.asset_class || "crypto";
      if (!exposureBySector[sector]) {
        exposureBySector[sector] = { exposure: 0, pct: 0, count: 0 };
      }
      const price = pos.current_price ? parseFloat(pos.current_price) : parseFloat(pos.entry_price);
      exposureBySector[sector].exposure += price * parseFloat(pos.quantity);
      exposureBySector[sector].count += 1;
    }
    for (const key of Object.keys(exposureBySector)) {
      exposureBySector[key].pct = Math.round(exposureBySector[key].exposure / totalExposure * 10000) / 100;
    }

    // Directional conflicts
    const bySymbol: Record<string, { long: number; short: number }> = {};
    for (const pos of positions) {
      if (!bySymbol[pos.symbol]) bySymbol[pos.symbol] = { long: 0, short: 0 };
      const exp = parseFloat(pos.quantity) * (pos.current_price ? parseFloat(pos.current_price) : parseFloat(pos.entry_price));
      if (pos.direction === "long") bySymbol[pos.symbol].long += exp;
      else bySymbol[pos.symbol].short += exp;
    }

    const directionalConflicts = Object.entries(bySymbol)
      .filter(([_, v]) => v.long > 0 && v.short > 0)
      .map(([symbol, v]) => ({
        symbol,
        longExposure: Math.round(v.long * 100) / 100,
        shortExposure: Math.round(v.short * 100) / 100,
      }));

    if (directionalConflicts.length > 0) {
      for (const c of directionalConflicts) {
        warnings.push(`Directional conflict on ${c.symbol}: LONG $${c.longExposure.toFixed(0)} vs SHORT $${c.shortExposure.toFixed(0)}`);
      }
    }

    // Get correlations
    const topCorrelations = await this.getCorrelationMatrix(48);

    // High correlation warnings
    for (const pair of topCorrelations) {
      if (Math.abs(pair.correlation) > 0.8) {
        warnings.push(`High correlation (${pair.correlation}) between ${pair.symbolA} and ${pair.symbolB}`);
      }
    }

    // Diversification score (0-100)
    // Factors: HHI (40%), conflicts (20%), correlation (20%), position count (20%)
    const hhiScore = Math.max(0, 100 - (hhi / 100));
    const conflictScore = directionalConflicts.length === 0 ? 100 : Math.max(0, 100 - directionalConflicts.length * 30);
    const corrScore = topCorrelations.length > 0
      ? Math.max(0, 100 - Math.abs(topCorrelations[0]?.correlation ?? 0) * 100)
      : 80;
    const countScore = Math.min(100, positions.length * 20);

    const diversificationScore = Math.round(
      hhiScore * 0.4 + conflictScore * 0.2 + corrScore * 0.2 + countScore * 0.2
    );

    return {
      hhi, hhiRating, exposureByAsset, exposureBySector,
      directionalConflicts, topCorrelations,
      diversificationScore, warnings,
    };
  }

  /**
   * Pre-trade diversification check.
   * Returns whether adding a position would worsen concentration.
   */
  async checkPreTradeDiversification(
    symbol: string, direction: string, exposureAmount: number
  ): Promise<{ approved: boolean; reason: string; score: number }> {
    const report = await this.getConcentrationReport();

    // Check for directional conflicts
    const existingExposure = report.exposureByAsset[symbol];
    if (existingExposure && existingExposure.direction !== direction && existingExposure.direction !== "mixed") {
      return {
        approved: false,
        reason: `Would create directional conflict on ${symbol} (existing: ${existingExposure.direction}, proposed: ${direction})`,
        score: report.diversificationScore,
      };
    }

    // Check if single asset would exceed 40% of portfolio
    const currentExp = existingExposure?.exposure ?? 0;
    const totalExp = Object.values(report.exposureByAsset).reduce((s, v) => s + v.exposure, 0) + exposureAmount;
    const newPct = (currentExp + exposureAmount) / totalExp * 100;

    if (newPct > 40) {
      return {
        approved: false,
        reason: `Would give ${symbol} ${newPct.toFixed(1)}% of portfolio (max 40%)`,
        score: report.diversificationScore,
      };
    }

    return { approved: true, reason: "ok", score: report.diversificationScore };
  }

  /**
   * Pearson correlation coefficient between two arrays.
   */
  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i];
      sumY2 += y[i] * y[i];
    }

    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    return den === 0 ? 0 : num / den;
  }
}
