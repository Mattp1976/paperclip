import crypto from 'crypto';
import type { Sql } from 'postgres';

// Types for subscription management
export interface SubscriptionTier {
  id: string;
  name: string;
  priceMonthly: number;
  limits: FeatureLimits;
}

export interface FeatureLimits {
  hypothesis_count: number;
  backtest_enhanced: boolean;
  backtest_montecarlo: boolean;
  backtest_walkforward: boolean;
  backtest_optimization: boolean;
  live_trading: boolean;
  paper_trading: boolean;
  api_access: boolean;
  realtime_signals: boolean;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_id: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'trialing';
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CheckoutSessionResult {
  id: string;
  url: string;
  expires_at: number;
}

export interface StripeWebhookEvent {
  type: string;
  data: {
    object: Record<string, any>;
    previous_attributes?: Record<string, any>;
  };
}

export interface UsageMetrics {
  hypotheses_active: number;
  hypotheses_limit: number;
  backtests_this_month: number;
  signals_sent_this_month: number;
  tier: string;
}

// Subscription tier definitions
const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    limits: {
      hypothesis_count: 1,
      backtest_enhanced: false,
      backtest_montecarlo: false,
      backtest_walkforward: false,
      backtest_optimization: false,
      live_trading: false,
      paper_trading: false,
      api_access: false,
      realtime_signals: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 2900, // $29.00 in cents
    limits: {
      hypothesis_count: 10,
      backtest_enhanced: true,
      backtest_montecarlo: false,
      backtest_walkforward: false,
      backtest_optimization: false,
      live_trading: false,
      paper_trading: true,
      api_access: false,
      realtime_signals: true,
    },
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    priceMonthly: 9900, // $99.00 in cents
    limits: {
      hypothesis_count: Infinity,
      backtest_enhanced: true,
      backtest_montecarlo: true,
      backtest_walkforward: true,
      backtest_optimization: true,
      live_trading: true,
      paper_trading: true,
      api_access: true,
      realtime_signals: true,
    },
  },
};

export class BillingService {
  private sql: Sql;
  private stripeSecretKey: string;
  private stripeWebhookSecret: string;
  private stripeApiBase: string = 'https://api.stripe.com/v1';

  private enabled: boolean;

  constructor(sql: Sql) {
    this.sql = sql;
    this.stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    this.stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    this.enabled = !!(this.stripeSecretKey && this.stripeWebhookSecret);

    if (!this.enabled) {
      console.log('[Billing] Stripe not configured — billing operates in free-tier-only mode');
    } else {
      console.log('[Billing] Stripe configured');
    }
  }

  /**
   * Create a Stripe Checkout session for a user
   */
  async createCheckoutSession(
    userId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<CheckoutSessionResult> {
    if (!this.enabled) {
      throw new Error('Stripe billing is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET environment variables.');
    }
    if (!SUBSCRIPTION_TIERS[planId]) {
      throw new Error(`Invalid plan ID: ${planId}`);
    }

    // Get or create Stripe customer
    const subscription = await this.getUserSubscription(userId);
    let customerId = subscription?.stripe_customer_id;

    if (!customerId) {
      const user = await this.sql`SELECT email FROM trading_users WHERE id = ${userId}`;
      if (!user.length) {
        throw new Error(`User not found: ${userId}`);
      }
      customerId = await this.createOrGetStripeCustomer(userId, user[0].email);
    }

    const plan = SUBSCRIPTION_TIERS[planId];
    const body = new URLSearchParams();
    body.append('customer', customerId);
    body.append('line_items[0][price_data][currency]', 'usd');
    body.append('line_items[0][price_data][unit_amount]', plan.priceMonthly.toString());
    body.append('line_items[0][price_data][recurring][interval]', 'month');
    body.append('line_items[0][quantity]', '1');
    body.append('line_items[0][price_data][product_data][name]', `${plan.name} Plan`);
    body.append('mode', 'subscription');
    body.append('success_url', successUrl);
    body.append('cancel_url', cancelUrl);
    body.append('metadata[userId]', userId);
    body.append('metadata[planId]', planId);

    const response = await fetch(`${this.stripeApiBase}/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Stripe API error: ${error}`);
    }

    const session = await response.json();
    return {
      id: session.id,
      url: session.url,
      expires_at: session.expires_at,
    };
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(payload: string, signature: string): Promise<void> {
    if (!this.enabled) {
      throw new Error('Stripe billing is not configured');
    }
    // Verify webhook signature
    const hash = crypto
      .createHmac('sha256', this.stripeWebhookSecret)
      .update(payload)
      .digest('hex');

    if (hash !== signature) {
      throw new Error('Invalid webhook signature');
    }

    const event: StripeWebhookEvent = JSON.parse(payload);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object);
        break;
    }
  }

  /**
   * Get user's current subscription details
   */
  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    const result = await this.sql`
      SELECT 
        id, user_id, stripe_customer_id, stripe_subscription_id, 
        plan_id, status, current_period_start, current_period_end, 
        cancel_at_period_end, created_at, updated_at
      FROM trading_subscriptions 
      WHERE user_id = ${userId}
    `;

    if (!result.length) {
      return null;
    }

    return this.mapSubscriptionRow(result[0]);
  }

  /**
   * Cancel a user's subscription at the end of the billing period
   */
  async cancelSubscription(userId: string): Promise<void> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription || !subscription.stripe_subscription_id) {
      throw new Error('No active subscription found');
    }

    const body = new URLSearchParams();
    body.append('cancel_at_period_end', 'true');

    const response = await fetch(
      `${this.stripeApiBase}/subscriptions/${subscription.stripe_subscription_id}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to cancel subscription: ${error}`);
    }

    await this.sql`
      UPDATE trading_subscriptions 
      SET cancel_at_period_end = true, updated_at = NOW()
      WHERE user_id = ${userId}
    `;
  }

  /**
   * Get current usage metrics for a user
   */
  async getUsageForUser(userId: string): Promise<UsageMetrics> {
    const subscription = await this.getUserSubscription(userId);
    const tier = subscription?.plan_id || 'free';
    const limits = SUBSCRIPTION_TIERS[tier].limits;

    // Get active hypotheses count
    const hypotheses = await this.sql`
      SELECT COUNT(*) as count 
      FROM trading_hypotheses 
      WHERE user_id = ${userId} AND status = 'active'
    `;

    // Get backtests this month
    const backtests = await this.sql`
      SELECT COUNT(*) as count 
      FROM trading_backtests 
      WHERE user_id = ${userId} 
      AND created_at >= DATE_TRUNC('month', NOW())
    `;

    // Get signals sent this month
    const signals = await this.sql`
      SELECT COUNT(*) as count 
      FROM trading_signals 
      WHERE user_id = ${userId} 
      AND created_at >= DATE_TRUNC('month', NOW())
    `;

    return {
      hypotheses_active: hypotheses[0].count,
      hypotheses_limit: limits.hypothesis_count,
      backtests_this_month: backtests[0].count,
      signals_sent_this_month: signals[0].count,
      tier,
    };
  }

  /**
   * Check if user has access to a feature based on their tier
   */
  async checkFeatureAccess(userId: string, feature: keyof FeatureLimits): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    const planId = subscription?.plan_id || 'free';
    const limits = SUBSCRIPTION_TIERS[planId].limits;

    if (feature === 'hypothesis_count') {
      // Special handling for hypothesis count - need to check actual usage
      const usage = await this.getUsageForUser(userId);
      return usage.hypotheses_active < usage.hypotheses_limit;
    }

    return Boolean(limits[feature]);
  }

  /**
   * Sync subscription status from Stripe to local database
   */
  async syncSubscriptionStatus(userId: string): Promise<UserSubscription | null> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription || !subscription.stripe_subscription_id) {
      return null;
    }

    const response = await fetch(
      `${this.stripeApiBase}/subscriptions/${subscription.stripe_subscription_id}`,
      {
        headers: {
          'Authorization': `Bearer ${this.stripeSecretKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch subscription from Stripe');
    }

    const stripeSubscription = await response.json();

    await this.sql`
      UPDATE trading_subscriptions 
      SET 
        status = ${stripeSubscription.status},
        current_period_start = to_timestamp(${stripeSubscription.current_period_start}),
        current_period_end = to_timestamp(${stripeSubscription.current_period_end}),
        cancel_at_period_end = ${stripeSubscription.cancel_at_period_end},
        updated_at = NOW()
      WHERE user_id = ${userId}
    `;

    return this.getUserSubscription(userId);
  }

  /**
   * Create or get existing Stripe customer for a user
   */
  async createOrGetStripeCustomer(userId: string, email: string): Promise<string> {
    const subscription = await this.getUserSubscription(userId);
    if (subscription?.stripe_customer_id) {
      return subscription.stripe_customer_id;
    }

    const body = new URLSearchParams();
    body.append('email', email);
    body.append('metadata[userId]', userId);

    const response = await fetch(`${this.stripeApiBase}/customers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create Stripe customer: ${error}`);
    }

    const customer = await response.json();
    const customerId = customer.id;

    // Ensure subscription record exists
    const existing = await this.getUserSubscription(userId);
    if (!existing) {
      await this.sql`
        INSERT INTO trading_subscriptions (user_id, stripe_customer_id, plan_id, status)
        VALUES (${userId}, ${customerId}, 'free', 'active')
      `;
    } else {
      await this.sql`
        UPDATE trading_subscriptions 
        SET stripe_customer_id = ${customerId}, updated_at = NOW()
        WHERE user_id = ${userId}
      `;
    }

    return customerId;
  }

  /**
   * Handle checkout.session.completed webhook event
   */
  private async handleCheckoutSessionCompleted(session: any): Promise<void> {
    const userId = session.metadata.userId;
    const planId = session.metadata.planId;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    await this.sql`
      INSERT INTO trading_subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan_id, status)
      VALUES (${userId}, ${customerId}, ${subscriptionId}, ${planId}, 'active')
      ON CONFLICT (user_id) DO UPDATE SET 
        stripe_customer_id = ${customerId},
        stripe_subscription_id = ${subscriptionId},
        plan_id = ${planId},
        status = 'active',
        updated_at = NOW()
    `;
  }

  /**
   * Handle customer.subscription.updated webhook event
   */
  private async handleSubscriptionUpdated(subscription: any): Promise<void> {
    const userId = await this.getUserIdFromCustomerId(subscription.customer);
    if (!userId) return;

    await this.sql`
      UPDATE trading_subscriptions 
      SET 
        status = ${subscription.status},
        current_period_start = to_timestamp(${subscription.current_period_start}),
        current_period_end = to_timestamp(${subscription.current_period_end}),
        cancel_at_period_end = ${subscription.cancel_at_period_end},
        updated_at = NOW()
      WHERE stripe_customer_id = ${subscription.customer}
    `;
  }

  /**
   * Handle customer.subscription.deleted webhook event
   */
  private async handleSubscriptionDeleted(subscription: any): Promise<void> {
    await this.sql`
      UPDATE trading_subscriptions 
      SET 
        status = 'canceled',
        stripe_subscription_id = NULL,
        updated_at = NOW()
      WHERE stripe_customer_id = ${subscription.customer}
    `;
  }

  /**
   * Handle invoice.paid webhook event
   */
  private async handleInvoicePaid(invoice: any): Promise<void> {
    const userId = await this.getUserIdFromCustomerId(invoice.customer);
    if (!userId) return;

    await this.sql`
      UPDATE trading_subscriptions 
      SET status = 'active', updated_at = NOW()
      WHERE stripe_customer_id = ${invoice.customer}
    `;
  }

  /**
   * Get user ID from Stripe customer ID
   */
  private async getUserIdFromCustomerId(customerId: string): Promise<string | null> {
    const result = await this.sql`
      SELECT user_id FROM trading_subscriptions 
      WHERE stripe_customer_id = ${customerId}
    `;
    return result.length ? result[0].user_id : null;
  }

  /**
   * Map database row to subscription object
   */
  private mapSubscriptionRow(row: any): UserSubscription {
    return {
      id: row.id,
      user_id: row.user_id,
      stripe_customer_id: row.stripe_customer_id,
      stripe_subscription_id: row.stripe_subscription_id,
      plan_id: row.plan_id,
      status: row.status,
      current_period_start: row.current_period_start ? new Date(row.current_period_start) : null,
      current_period_end: row.current_period_end ? new Date(row.current_period_end) : null,
      cancel_at_period_end: row.cancel_at_period_end,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}

export { SUBSCRIPTION_TIERS };
