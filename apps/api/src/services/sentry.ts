/**
 * Sentry error tracking + performance monitoring.
 *
 * Mirrors the pattern from MOSS (Instilligent.Moss.Web/Program.cs:15-28):
 * no-ops when SENTRY_DSN is unset (dev / CI default) so local + test runs
 * are never blocked by a missing DSN. Set SENTRY_DSN in Railway prod env
 * to enable error capture.
 *
 * Sample rate matches MOSS (TracesSampleRate 0.1) — 10% of transactions
 * traced, all errors captured. PII (user emails / IPs) explicitly NOT
 * sent by default; flip SendDefaultPii later if we add a privacy policy
 * carve-out for it.
 *
 * Usage:
 *   import { initSentry, sentryRequestHandler, sentryTracingHandler,
 *            sentryErrorHandler } from './services/sentry.js';
 *   initSentry(app);
 *   app.use(sentryRequestHandler());
 *   app.use(sentryTracingHandler());
 *   // ...routes...
 *   app.use(sentryErrorHandler()); // BEFORE the global error handler
 *   app.use(errorHandler);
 */

import * as Sentry from '@sentry/node';
import { Integrations as TracingIntegrations } from '@sentry/node';
import { ExtraErrorData } from '@sentry/integrations';
import type { Express, ErrorRequestHandler, RequestHandler } from 'express';

let initialized = false;

/**
 * Initialize Sentry. Safe to call when SENTRY_DSN is unset (no-op).
 * `app` is optional — passed only so the Express tracing integration can
 * pull route names for transaction grouping.
 */
export function initSentry(app?: Express): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || !dsn.trim()) {
    // Mirrors MOSS: no DSN → silently skip. Local dev + CI run normally.
    return;
  }

  // Resolve release tag. Railway exposes RAILWAY_GIT_COMMIT_SHA at runtime;
  // fall back to SENTRY_RELEASE override (set by deploy pipeline) or 'local'.
  const release =
    'bossboard-api@' +
    (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.SENTRY_RELEASE || 'local');

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release,
    tracesSampleRate: 0.1, // 10%, matches MOSS
    sendDefaultPii: false, // do NOT send user emails / IPs by default
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      // app is optional — when provided we get route-aware transaction names
      ...(app ? [new TracingIntegrations.Express({ app })] : []),
      new ExtraErrorData({ depth: 4 }),
    ],
  });

  initialized = true;
  // eslint-disable-next-line no-console
  console.log('[sentry] initialized for environment=' + (process.env.NODE_ENV || 'development') + ' release=' + release);
}

/**
 * Returns Sentry's request handler middleware. When Sentry is not
 * initialized, returns a no-op middleware so callers don't have to
 * branch on initialization state.
 */
export function sentryRequestHandler(): RequestHandler {
  if (!initialized) {
    return (_req, _res, next) => next();
  }
  return Sentry.Handlers.requestHandler();
}

/**
 * Returns Sentry's tracing handler middleware. No-op when Sentry isn't
 * initialized.
 */
export function sentryTracingHandler(): RequestHandler {
  if (!initialized) {
    return (_req, _res, next) => next();
  }
  return Sentry.Handlers.tracingHandler();
}

/**
 * Returns Sentry's error handler middleware. MUST be installed BEFORE
 * any application error handler (the global errorHandler in
 * middleware/error.ts) so Sentry captures the error before the response
 * is sent. No-op when Sentry isn't initialized.
 */
export function sentryErrorHandler(): ErrorRequestHandler {
  if (!initialized) {
    return (err, _req, _res, next) => next(err);
  }
  return Sentry.Handlers.errorHandler();
}

/**
 * Test-seam: lets jest setup verify the no-DSN no-op contract.
 */
/**
 * Capture an exception outside the Express middleware chain (e.g. startup
 * failures like migrations). No-op when Sentry is not initialized.
 */
export function captureException(err: unknown): void {
  if (initialized) {
    Sentry.captureException(err);
  }
}

export function isSentryInitialized(): boolean {
  return initialized;
}
