/**
 * BossBoard API Server
 *
 * Express server providing REST API for the BossBoard mobile app.
 *
 * Port: 29000
 *
 * Endpoints:
 * - /health - Health checks
 * - /api/v1/auth - Authentication
 * - /api/v1/swms - SWMS document management
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  initSentry,
  sentryRequestHandler,
  sentryTracingHandler,
  sentryErrorHandler,
  captureException,
} from './services/sentry.js';

// Load the marketing landing page once at startup so the / route serves it
// from memory. The HTML lives at ./landing.html so it can be edited as a
// real file instead of buried in a template literal. The previous version
// of this file inlined a "Boss Board / Coming Soon" placeholder — that's
// what bossboard.instilligent.com was serving and what tripped Apple's
// review (App Store reviewers see "Coming Soon" → reject under 2.1).
//
// __dirname is the CommonJS free variable; this file is compiled to CJS by
// tsc + NodeNext (no "type":"module" in package.json), so import.meta.url
// is not available here. The build copies src/landing.html → dist/landing
// .html so __dirname/landing.html resolves correctly in production too.
let LANDING_HTML = '';
try {
  LANDING_HTML = readFileSync(join(__dirname, 'landing.html'), 'utf8');
} catch (err) {
  console.error('[startup] Failed to load landing.html, falling back to minimal HTML:', err);
  LANDING_HTML = '<!DOCTYPE html><html><head><title>BossBoard</title></head><body><h1>BossBoard</h1><p>NZ tradies SaaS. <a href="mailto:support@instilligent.com">Contact us</a>.</p></body></html>';
}

import { config } from './config/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import db from './services/database.js';
import redis from './services/redis.js';
import { runMigrations } from './services/migrate.js';

// Route imports
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import feedbackRoutes from './routes/feedback.js';
import swmsRoutes from './routes/swms.js';
import invoicesRoutes from './routes/invoices.js';
import certificationsRoutes from './routes/certifications.js';
import statsRoutes from './routes/stats.js';
import businessProfileRoutes from './routes/business-profile.js';
import customersRoutes from './routes/customers.js';
import productsRoutes from './routes/products.js';
import recurringInvoicesRoutes from './routes/recurring-invoices.js';
import bankTransactionsRoutes from './routes/bank-transactions.js';
import photosRoutes from './routes/photos.js';
import documentsRoutes from './routes/documents.js';
import quotesRoutes from './routes/quotes.js';
import expensesRoutes from './routes/expenses.js';
import jobLogsRoutes from './routes/job-logs.js';
import notificationsRoutes from './routes/notifications.js';
import teamsRoutes from './routes/teams.js';
import publicRoutes from './routes/public.js';
import subscriptionsRoutes from './routes/subscriptions.js';
import referralsRoutes from './routes/referrals.js';
import stripeWebhookRoutes from './routes/stripe-webhook.js';
import syncRoutes from './routes/sync.js';
import legalRoutes from './routes/legal.js';
import gettingStartedRoutes from './routes/getting-started.js';
import cronService from './services/cron.js';

const app = express();

// Railway (and most PaaS) terminate TLS at a proxy. Required for correct
// client IPs, secure cookies, and rate-limit fairness.
app.set('trust proxy', 1);

// =============================================================================
// SENTRY (must be installed BEFORE any other middleware so it captures
// every request — see services/sentry.ts. No-op when SENTRY_DSN unset.)
// =============================================================================
initSentry(app);
app.use(sentryRequestHandler());
app.use(sentryTracingHandler());

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Security headers (helmet defaults + HSTS in production)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
  hsts: config.isDevelopment
    ? false
    : { maxAge: 31536000, includeSubDomains: true, preload: false },
  referrerPolicy: { policy: 'no-referrer' },
}));

// CORS configuration
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ---------------------------------------------------------------------------
// Stripe webhook MUST be registered before express.json() so that the raw
// Buffer body is available for HMAC signature verification.
// ---------------------------------------------------------------------------
app.use(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  stripeWebhookRoutes
);

// Body parsing (all other routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting for API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limit for auth endpoints. Env-overridable so the
// staging tier can bump the cap when running the full e2e suite (which
// can fire 30+ auth calls in quick succession from the test runner's
// single source IP). Production default stays at 20/15min per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${req.method} ${req.path}`);
  next();
});

// =============================================================================
// ROUTES
// =============================================================================

// Health check routes (no rate limit, no prefix)
app.use('/health', healthRoutes);

// Legal pages (no auth, no rate limit - required for App Store / Play Store)
app.use('/legal', legalRoutes);

// API v1 routes
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/swms', apiLimiter, swmsRoutes);
app.use('/api/v1/invoices', apiLimiter, invoicesRoutes);
app.use('/api/v1/certifications', apiLimiter, certificationsRoutes);
app.use('/api/v1/stats', apiLimiter, statsRoutes);
app.use('/api/v1/business-profile', apiLimiter, businessProfileRoutes);
app.use('/api/v1/customers', apiLimiter, customersRoutes);
app.use('/api/v1/products', apiLimiter, productsRoutes);
app.use('/api/v1/recurring-invoices', apiLimiter, recurringInvoicesRoutes);
app.use('/api/v1/bank-transactions', apiLimiter, bankTransactionsRoutes);
app.use('/api/v1/photos', apiLimiter, photosRoutes);
app.use('/api/v1/documents', apiLimiter, documentsRoutes);
app.use('/api/v1/quotes', apiLimiter, quotesRoutes);
app.use('/api/v1/expenses', apiLimiter, expensesRoutes);
app.use('/api/v1/job-logs', apiLimiter, jobLogsRoutes);
app.use('/api/v1/notifications', apiLimiter, notificationsRoutes);
app.use('/api/v1/teams', apiLimiter, teamsRoutes);
app.use('/api/v1/subscriptions', apiLimiter, subscriptionsRoutes);
app.use('/api/v1/referrals', apiLimiter, referralsRoutes);
app.use('/api/v1/sync', apiLimiter, syncRoutes);
app.use('/api/v1/feedback', apiLimiter, feedbackRoutes);
app.use('/api/v1/getting-started', apiLimiter, gettingStartedRoutes);

// Public routes (no auth required)
app.use('/api/v1/public', apiLimiter, publicRoutes);

// Compliance alias (points to swms for backwards compatibility)
app.use('/api/v1/compliance', apiLimiter, swmsRoutes);

// =============================================================================
// ROOT LANDING PAGE
// =============================================================================

app.get('/', (_req: Request, res: Response) => {
  // Allow Google Fonts (used by the landing page) and inline styles. The
  // previous CSP only allowed 'self' for fonts, which broke the polished
  // landing's Inter typeface.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self';"
  );
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(LANDING_HTML);
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use(notFoundHandler);

// Sentry error handler MUST come before the global errorHandler so it
// captures the error before the JSON response is written. No-op when
// SENTRY_DSN is unset (see services/sentry.ts).
app.use(sentryErrorHandler());

// Global error handler
app.use(errorHandler);

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  cronService.stop();
  await Promise.all([db.close(), redis.close()]);
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  cronService.stop();
  await Promise.all([db.close(), redis.close()]);
  process.exit(0);
});

// =============================================================================
// START SERVER
// =============================================================================

const PORT = config.port;

// Async startup: run migrations, connect Redis, then start server
async function startServer() {
  // Run database migrations first. Production environments that manage
  // schema via dedicated deployment scripts can opt out with SKIP_MIGRATIONS=true.
  if (process.env.SKIP_MIGRATIONS === 'true') {
    console.log('[startup] SKIP_MIGRATIONS=true, skipping database migration check');
  } else {
    try {
      await runMigrations();
    } catch (err) {
      console.error('Database migration failed:', err);
      console.error('Server will start but database may be incomplete.');
      // Startup runs before the Sentry Express middleware chain — capture
      // explicitly or a failed/skipped migration is only a console line.
      captureException(err);
    }
  }

  // Connect Redis (non-blocking)
  redis.connect().catch((err) => {
    console.error('Failed to connect to Redis on startup:', err.message);
  });

  app.listen(PORT, () => {
    // Start cron jobs
    cronService.start();
    console.log('[server] BossBoard API running on port ' + PORT + ' (' + config.nodeEnv + ')');
  });
}

// Skip auto-start under test so the app can be imported and exercised
// (construct/boot baseline) without binding a port or running migrations.
if (config.nodeEnv !== 'test') {
  startServer();
}

export default app;
