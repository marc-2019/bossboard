/**
 * Application Configuration
 * Centralized configuration management
 */

import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // App Branding (configurable - no hardcoded product name)
  appName: process.env.APP_NAME || 'BossBoard',
  appDomain: process.env.APP_DOMAIN || '',

  // Server
  port: parseInt(process.env.PORT || '29000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV !== 'production',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://bossboard:bossboard_dev_2026@localhost:29432/bossboard',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:29379',

  // JWT — no fallback: missing secret = startup failure in all environments
  jwt: {
    secret: process.env.JWT_SECRET as string,
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
  },

  // AI
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',

  // CORS
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || (
    process.env.NODE_ENV === 'production' ? [] : [
      'http://localhost:19006',
      'http://localhost:8081',
      'http://localhost:8082',
      'http://localhost:3000',
    ]
  ),

  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    priceIdTradie: process.env.STRIPE_PRICE_ID_TRADIE || '',
    priceIdTeam: process.env.STRIPE_PRICE_ID_TEAM || '',
    // Billing portal return URL (must be the mobile app or a web success page)
    returnUrl: process.env.STRIPE_RETURN_URL || 'http://localhost:19006',
  },

  // Email (SMTP)
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.SMTP_FROM_NAME || 'BossBoard',
    fromEmail: process.env.SMTP_FROM_EMAIL || '',
  },

  // Resend HTTP API (preferred over SMTP on cloud platforms)
  resendApiKey: process.env.RESEND_API_KEY || '',

  // GA4 (Google Analytics 4) — server-side Measurement Protocol.
  // Used to report off-web conversions (Stripe Checkout / mobile / webhook
  // tier upgrades) that the web gtag.js client can't observe. The web stream
  // measurement ID matches the public landing page tag (G-83NPHN0QP5).
  // mpApiSecret is generated in GA4 Admin → Data Streams → Measurement Protocol
  // API secrets; when unset, trackServerEvent() is a clean no-op.
  ga4: {
    measurementId: process.env.GA4_MEASUREMENT_ID || 'G-83NPHN0QP5',
    mpApiSecret: process.env.GA4_MP_API_SECRET || '',
  },
} as const;

// Fail fast: require critical env vars in production
if (!config.isDevelopment) {
  const required: Record<string, string | undefined> = {
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      throw new Error(`${key} environment variable is required in production`);
    }
  }
  // STRIPE_RETURN_URL is required in prod ONLY when paid checkout is enabled
  // (BETA_MODE=false). The dev fallback http://localhost:19006 would silently
  // break post-payment redirect on a live server.
  if (process.env.BETA_MODE === 'false') {
    if (!process.env.STRIPE_RETURN_URL || process.env.STRIPE_RETURN_URL.startsWith('http://localhost')) {
      throw new Error(
        'STRIPE_RETURN_URL must be set to a non-localhost URL in production when BETA_MODE=false'
      );
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is required in production when BETA_MODE=false');
    }
    if (!process.env.STRIPE_PRICE_ID_TRADIE) {
      throw new Error('STRIPE_PRICE_ID_TRADIE is required in production when BETA_MODE=false');
    }
  }
  // Warn about missing but non-fatal vars
  if (!process.env.CORS_ORIGINS) {
    console.warn('WARNING: CORS_ORIGINS not set in production — defaulting to deny-all');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn('WARNING: STRIPE_WEBHOOK_SECRET not set — Stripe webhooks will fail');
  }
}

// Validate NODE_ENV is a known value
if (!['development', 'test', 'production'].includes(config.nodeEnv)) {
  throw new Error(`Invalid NODE_ENV: "${config.nodeEnv}". Must be development, test, or production.`);
}

export default config;

