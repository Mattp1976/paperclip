/**
 * trAIder PostHog Analytics Service
 * Server-side event tracking with batching and graceful degradation.
 */
import postgres from "postgres";

interface AnalyticsEvent {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

interface IdentifyPayload {
  event: "$identify";
  distinct_id: string;
  properties: { $set: Record<string, unknown> };
  timestamp: string;
}

export class AnalyticsService {
  private sql: ReturnType<typeof postgres>;
  private apiKey: string;
  private host: string;
  private enabled: boolean;
  private queue: (AnalyticsEvent | IdentifyPayload)[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly BATCH_SIZE = 20;
  private readonly FLUSH_INTERVAL_MS = 30_000;
  private readonly LIB = "traider-server";
  private readonly LIB_VERSION = "0.1.0";

  constructor(sql: ReturnType<typeof postgres>) {
    this.sql = sql;
    this.apiKey = process.env.POSTHOG_API_KEY ?? "";
    this.host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
    this.enabled = !!this.apiKey;

    if (!this.enabled) {
      console.log("[Analytics] PostHog not configured — events will be logged to console only");
    } else {
      console.log("[Analytics] PostHog configured, sending to", this.host);
      this.flushTimer = setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);
    }
  }

  // ─── Core Methods ─────────────────────────────────────────────────

  /** Identify a user with traits */
  identify(userId: string, properties: Record<string, unknown>): void {
    const payload: IdentifyPayload = {
      event: "$identify",
      distinct_id: userId,
      properties: { $set: { ...properties, $lib: this.LIB, $lib_version: this.LIB_VERSION } },
      timestamp: new Date().toISOString(),
    };
    this.enqueue(payload);
  }

  /** Track a custom event */
  track(userId: string, event: string, properties: Record<string, unknown> = {}): void {
    this.enqueue({
      event,
      distinct_id: userId,
      properties: { ...properties, $lib: this.LIB, $lib_version: this.LIB_VERSION },
      timestamp: new Date().toISOString(),
    });
  }

  /** Track a page view */
  trackPageView(userId: string, page: string, properties: Record<string, unknown> = {}): void {
    this.track(userId, "$pageview", { $current_url: page, ...properties });
  }

  /** Force flush the event queue */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.BATCH_SIZE);
    if (!this.enabled) {
      batch.forEach((e) => console.log("[Analytics][local]", e.event, (e as AnalyticsEvent).distinct_id));
      return;
    }
    try {
      const resp = await fetch(`${this.host}/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: this.apiKey, batch }),
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) console.error("[Analytics] Batch send failed:", resp.status, await resp.text());
    } catch (err: any) {
      console.error("[Analytics] Batch send error:", err.message);
      // Re-queue failed events (at the front)
      this.queue.unshift(...batch);
    }
  }

  /** Graceful shutdown */
  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush();
  }

  // ─── Trading-Specific Convenience Methods ─────────────────────────

  trackSignup(userId: string, method: string): void {
    this.track(userId, "user_signed_up", { method });
    this.identify(userId, { signup_method: method, signup_date: new Date().toISOString() });
  }

  trackLogin(userId: string, method: string): void {
    this.track(userId, "user_logged_in", { method });
  }

  trackHypothesisCreated(userId: string, hypothesisId: string, strategyType: string): void {
    this.track(userId, "hypothesis_created", { hypothesis_id: hypothesisId, strategy_type: strategyType });
  }

  trackBacktestRun(userId: string, hypothesisId: string, options: Record<string, unknown>): void {
    this.track(userId, "backtest_run", { hypothesis_id: hypothesisId, ...options });
  }

  trackBacktestResult(userId: string, hypothesisId: string, metrics: Record<string, unknown>): void {
    this.track(userId, "backtest_completed", { hypothesis_id: hypothesisId, ...metrics });
  }

  trackTradeOpened(userId: string, tradeId: string, symbol: string, direction: string): void {
    this.track(userId, "trade_opened", { trade_id: tradeId, symbol, direction });
  }

  trackTradeClosed(userId: string, tradeId: string, symbol: string, pnl: number): void {
    this.track(userId, "trade_closed", { trade_id: tradeId, symbol, pnl, profitable: pnl > 0 });
  }

  trackSubscriptionChanged(userId: string, fromPlan: string, toPlan: string): void {
    this.track(userId, "subscription_changed", { from_plan: fromPlan, to_plan: toPlan });
    this.identify(userId, { plan: toPlan });
  }

  trackFeatureUsed(userId: string, feature: string): void {
    this.track(userId, "feature_used", { feature });
  }

  trackConnectorConfigured(userId: string, connectorId: string): void {
    this.track(userId, "connector_configured", { connector_id: connectorId });
  }

  trackOnboardingStep(userId: string, step: number, completed: boolean): void {
    this.track(userId, "onboarding_step", { step, completed });
  }

  trackError(userId: string, errorType: string, message: string, context: Record<string, unknown> = {}): void {
    this.track(userId, "error_occurred", { error_type: errorType, error_message: message, ...context });
  }

  // ─── Private ──────────────────────────────────────────────────────

  private enqueue(event: AnalyticsEvent | IdentifyPayload): void {
    this.queue.push(event);
    if (this.queue.length >= this.BATCH_SIZE) {
      setImmediate(() => this.flush());
    }
  }
}
