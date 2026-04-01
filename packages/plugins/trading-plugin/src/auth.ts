/**
 * trAIder Auth Module
 * ====================
 * Simple JWT-based authentication. Designed to be swapped for Clerk
 * once the publishable key is configured.
 *
 * Endpoints:
 *   POST /api/auth/signup   — Create account
 *   POST /api/auth/signin   — Login, returns JWT
 *   GET  /api/auth/me       — Verify token, return user
 */

import { createHmac, randomBytes } from "node:crypto";
import type postgres from "postgres";

const JWT_SECRET = process.env.JWT_SECRET || "traider-dev-secret-change-in-prod-" + randomBytes(8).toString("hex");
const TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// Simple JWT implementation (no external deps)
function base64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function createToken(payload: Record<string, any>): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL,
  }));
  const sig = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verifyToken(token: string): Record<string, any> | null {
  try {
    const [header, body, sig] = token.split(".");
    const expectedSig = createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");
    if (sig !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || randomBytes(16).toString("hex");
  const hash = createHmac("sha256", s).update(password).digest("hex");
  return { hash, salt: s };
}

export function createAuthHandlers(sql: ReturnType<typeof postgres>) {
  return {
    async signup(body: string): Promise<{ status: number; data: any }> {
      try {
        const { name, email, password } = JSON.parse(body);
        if (!email || !password) {
          return { status: 400, data: { ok: false, error: "Email and password are required" } };
        }
        if (password.length < 8) {
          return { status: 400, data: { ok: false, error: "Password must be at least 8 characters" } };
        }

        // Check if email exists
        const existing = await sql`SELECT id FROM trading_users WHERE email = ${email}`;
        if (existing.length > 0) {
          return { status: 400, data: { ok: false, error: "An account with this email already exists" } };
        }

        // Hash password and create user
        const { hash, salt } = hashPassword(password);
        const userId = randomBytes(12).toString("hex");
        const clerkId = "local_" + userId; // Will be real Clerk ID once integrated

        await sql`
          INSERT INTO trading_users (id, clerk_id, email, name, plan, is_active, onboarded_at)
          VALUES (${userId}, ${clerkId}, ${email}, ${name || ''}, 'free', true, NOW())
        `;

        // Store password hash (in a separate table for security)
        await sql`
          CREATE TABLE IF NOT EXISTS trading_user_credentials (
            user_id VARCHAR(100) PRIMARY KEY REFERENCES trading_users(id),
            password_hash VARCHAR(255) NOT NULL,
            password_salt VARCHAR(64) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `;
        await sql`
          INSERT INTO trading_user_credentials (user_id, password_hash, password_salt)
          VALUES (${userId}, ${hash}, ${salt})
        `;

        // Create default settings
        await sql`
          INSERT INTO trading_user_settings (user_id)
          VALUES (${userId})
          ON CONFLICT DO NOTHING
        `;

        const token = createToken({ sub: userId, email, name: name || '' });
        return {
          status: 200,
          data: {
            ok: true,
            token,
            user: { id: userId, email, name: name || '', plan: 'free' },
          },
        };
      } catch (err: any) {
        console.error("[Auth] Signup error:", err);
        return { status: 500, data: { ok: false, error: "Could not create account" } };
      }
    },

    async signin(body: string): Promise<{ status: number; data: any }> {
      try {
        const { email, password } = JSON.parse(body);
        if (!email || !password) {
          return { status: 400, data: { ok: false, error: "Email and password are required" } };
        }

        // Find user
        const [user] = await sql`
          SELECT u.id, u.email, u.name, u.plan, u.avatar_url,
                 c.password_hash, c.password_salt
          FROM trading_users u
          JOIN trading_user_credentials c ON c.user_id = u.id
          WHERE u.email = ${email} AND u.is_active = true
        `;

        if (!user) {
          return { status: 401, data: { ok: false, error: "Invalid email or password" } };
        }

        // Verify password
        const { hash } = hashPassword(password, user.password_salt);
        if (hash !== user.password_hash) {
          return { status: 401, data: { ok: false, error: "Invalid email or password" } };
        }

        const token = createToken({ sub: user.id, email: user.email, name: user.name });
        return {
          status: 200,
          data: {
            ok: true,
            token,
            user: { id: user.id, email: user.email, name: user.name, plan: user.plan },
          },
        };
      } catch (err: any) {
        console.error("[Auth] Signin error:", err);
        return { status: 500, data: { ok: false, error: "Authentication failed" } };
      }
    },

    async me(authHeader: string | undefined): Promise<{ status: number; data: any }> {
      const token = authHeader?.replace("Bearer ", "");
      if (!token) {
        return { status: 401, data: { ok: false, error: "No token provided" } };
      }

      const payload = verifyToken(token);
      if (!payload) {
        return { status: 401, data: { ok: false, error: "Invalid or expired token" } };
      }

      try {
        const [user] = await sql`
          SELECT id, email, name, plan, avatar_url, created_at
          FROM trading_users WHERE id = ${payload.sub} AND is_active = true
        `;
        if (!user) {
          return { status: 401, data: { ok: false, error: "User not found" } };
        }
        return { status: 200, data: { ok: true, user } };
      } catch {
        return { status: 500, data: { ok: false, error: "Could not verify user" } };
      }
    },
  };
}

// Middleware helper: extract user from request
export function getUserFromToken(authHeader: string | undefined): { id: string; email: string } | null {
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  return { id: payload.sub, email: payload.email };
}
