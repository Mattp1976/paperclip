/**
 * Notification Service — ASI Trading System
 * ==========================================
 * Sends alerts to configured webhook endpoints (Discord, Slack, etc.)
 * when critical trading events occur.
 *
 * Events:
 *   - Trade opened / closed (with P&L)
 *   - Stop-loss hit
 *   - Risk limit breached
 *   - System errors
 *   - Daily summary digest
 *
 * Configuration via environment variables:
 *   WEBHOOK_URL — Primary webhook (Discord or Slack)
 *   WEBHOOK_TYPE — "discord" | "slack" (default: discord)
 */
import type { Sql } from "postgres";

type WebhookType = "discord" | "slack";

interface NotificationEvent {
  type: "trade_opened" | "trade_closed" | "stop_loss_hit" | "risk_breach" | "system_error" | "daily_summary";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  fields?: Record<string, string>;
}

export class NotificationService {
  private webhookUrl: string | null;
  private webhookType: WebhookType;
  private enabled: boolean;
  private rateLimitMap: Map<string, number> = new Map();
  private RATE_LIMIT_MS = 60_000; // 1 min between same-type notifications

  constructor(private sql: Sql) {
    this.webhookUrl = process.env.WEBHOOK_URL || null;
    this.webhookType = (process.env.WEBHOOK_TYPE as WebhookType) || "discord";
    this.enabled = !!this.webhookUrl;

    if (this.enabled) {
      console.log(`[Notifier] Active — sending to ${this.webhookType} webhook`);
    } else {
      console.log("[Notifier] No WEBHOOK_URL set — notifications disabled (will log only)");
    }
  }

  /**
   * Send a notification event.
   */
  async notify(event: NotificationEvent): Promise<void> {
    // Rate limiting — don't spam the same event type
    const lastSent = this.rateLimitMap.get(event.type) ?? 0;
    if (Date.now() - lastSent < this.RATE_LIMIT_MS && event.severity !== "critical") {
      return;
    }
    this.rateLimitMap.set(event.type, Date.now());

    // Always log to DB
    try {
      await this.sql`
        INSERT INTO trading_agent_logs (agent_name, log_level, message, context)
        VALUES ('notifier', ${event.severity}, ${event.title}, ${JSON.stringify({
          type: event.type, message: event.message, fields: event.fields,
        })})
      `;
    } catch (e) { /* non-critical */ }

    // Send to webhook if configured
    if (this.enabled && this.webhookUrl) {
      try {
        const payload = this.webhookType === "discord"
          ? this.formatDiscord(event)
          : this.formatSlack(event);

        const data = JSON.stringify(payload);
        const url = this.webhookUrl;
        
        // Use dynamic import for fetch or fallback to http
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: data,
        });

        if (!response.ok) {
          console.error(`[Notifier] Webhook failed: ${response.status}`);
        }
      } catch (err) {
        console.error("[Notifier] Webhook error:", err);
      }
    } else {
      // Log-only mode
      const emoji = event.severity === "critical" ? "🚨" : event.severity === "warning" ? "⚠️" : "ℹ️";
      console.log(`[Notifier] ${emoji} ${event.title}: ${event.message}`);
    }
  }

  /**
   * Convenience methods for common events.
   */
  async tradeOpened(symbol: string, direction: string, price: number, qty: number, strategy: string): Promise<void> {
    await this.notify({
      type: "trade_opened", severity: "info",
      title: `📈 Trade Opened: ${direction.toUpperCase()} ${symbol}`,
      message: `${direction.toUpperCase()} ${symbol} @ $${price.toFixed(2)} (qty: ${qty.toFixed(6)})`,
      fields: { Strategy: strategy, Price: `$${price.toFixed(2)}`, Quantity: qty.toFixed(6) },
    });
  }

  async tradeClosed(symbol: string, direction: string, pnl: number, pnlPct: number, reason: string): Promise<void> {
    const emoji = pnl >= 0 ? "💰" : "📉";
    await this.notify({
      type: "trade_closed", severity: pnl < 0 ? "warning" : "info",
      title: `${emoji} Trade Closed: ${direction.toUpperCase()} ${symbol}`,
      message: `P&L: $${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%) — ${reason}`,
      fields: { "P&L": `$${pnl.toFixed(2)}`, Return: `${pnlPct.toFixed(2)}%`, Reason: reason },
    });
  }

  async stopLossHit(symbol: string, pnl: number, stopLevel: number): Promise<void> {
    await this.notify({
      type: "stop_loss_hit", severity: "warning",
      title: `🛑 Stop Loss Hit: ${symbol}`,
      message: `Lost $${Math.abs(pnl).toFixed(2)} — stop triggered at $${stopLevel.toFixed(2)}`,
      fields: { Loss: `$${Math.abs(pnl).toFixed(2)}`, "Stop Level": `$${stopLevel.toFixed(2)}` },
    });
  }

  async riskBreach(rule: string, detail: string): Promise<void> {
    await this.notify({
      type: "risk_breach", severity: "critical",
      title: `🚨 Risk Limit Breached: ${rule}`,
      message: detail,
    });
  }

  async systemError(component: string, error: string): Promise<void> {
    await this.notify({
      type: "system_error", severity: "critical",
      title: `💥 System Error: ${component}`,
      message: error,
    });
  }

  /**
   * Generate and send daily trading summary.
   */
  async sendDailySummary(): Promise<void> {
    try {
      const [equity] = await this.sql`
        SELECT equity, drawdown_pct FROM trading_equity_snapshots
        ORDER BY timestamp DESC LIMIT 1
      `;
      const [openCount] = await this.sql`
        SELECT COUNT(*)::int AS c FROM trading_paper_trades WHERE status = 'open'
      `;
      const todayClosed = await this.sql`
        SELECT pnl, pnl_pct, exit_reason FROM trading_paper_trades
        WHERE status = 'closed' AND exit_time > NOW() - INTERVAL '24 hours'
      `;
      const [alertCount] = await this.sql`
        SELECT COUNT(*)::int AS c FROM trading_alerts
        WHERE created_at > NOW() - INTERVAL '24 hours' AND severity = 'critical'
      `;

      const totalPnl = todayClosed.reduce((s: number, t: any) => s + parseFloat(t.pnl || 0), 0);
      const wins = todayClosed.filter((t: any) => parseFloat(t.pnl || 0) > 0).length;
      const losses = todayClosed.filter((t: any) => parseFloat(t.pnl || 0) <= 0).length;

      await this.notify({
        type: "daily_summary", severity: "info",
        title: "📊 Daily Trading Summary",
        message: [
          `Equity: $${equity ? parseFloat(equity.equity).toFixed(2) : "N/A"}`,
          `Drawdown: ${equity ? parseFloat(equity.drawdown_pct).toFixed(2) : 0}%`,
          `Open Positions: ${openCount.c}`,
          `Trades Today: ${todayClosed.length} (${wins}W / ${losses}L)`,
          `Daily P&L: $${totalPnl.toFixed(2)}`,
          `Critical Alerts: ${alertCount.c}`,
        ].join("\n"),
        fields: {
          Equity: `$${equity ? parseFloat(equity.equity).toFixed(2) : "N/A"}`,
          "Daily P&L": `$${totalPnl.toFixed(2)}`,
          "Win Rate": todayClosed.length > 0 ? `${(wins / todayClosed.length * 100).toFixed(0)}%` : "N/A",
          "Open Positions": String(openCount.c),
        },
      });
    } catch (err) {
      console.error("[Notifier] Daily summary error:", err);
    }
  }

  // ─── Webhook Formatters ───

  private formatDiscord(event: NotificationEvent): object {
    const colorMap = { info: 0x3498db, warning: 0xf39c12, critical: 0xe74c3c };
    const fields = event.fields
      ? Object.entries(event.fields).map(([name, value]) => ({ name, value, inline: true }))
      : [];

    return {
      embeds: [{
        title: event.title,
        description: event.message,
        color: colorMap[event.severity],
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: "ASI Trading System" },
      }],
    };
  }

  private formatSlack(event: NotificationEvent): object {
    const emojiMap = { info: ":information_source:", warning: ":warning:", critical: ":rotating_light:" };
    const fields = event.fields
      ? Object.entries(event.fields).map(([title, value]) => ({ title, value, short: true }))
      : [];

    return {
      attachments: [{
        color: event.severity === "critical" ? "danger" : event.severity === "warning" ? "warning" : "good",
        title: `${emojiMap[event.severity]} ${event.title}`,
        text: event.message,
        fields,
        footer: "ASI Trading System",
        ts: Math.floor(Date.now() / 1000),
      }],
    };
  }
}
