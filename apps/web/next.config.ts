import type { NextConfig } from 'next';
import path from 'path';

// Security response headers (F-X-03). Applied to every route. The CSP is
// intentionally moderate: Next.js needs 'unsafe-inline'/'unsafe-eval' for its
// runtime, and the dashboard talks to the same-origin API proxy + https only.
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // GA4 (gtag.js) is loaded from googletagmanager.com; google-analytics.com
      // serves the analytics.js fallback. Both must be allowlisted for script-src
      // or the consent-gated GA loader is CSP-blocked.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // GA4 collect/region beacons. 'https:' already permits these, but they are
      // listed explicitly so the analytics dependency is visible in the policy.
      "connect-src 'self' https: https://www.google-analytics.com https://*.google-analytics.com https://region1.google-analytics.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; '),
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // Pin the monorepo root so Next doesn't infer the wrong workspace root from a
  // stray ~/package-lock.json (multi-lockfile detection). Keeps standalone file
  // tracing correct and silences the "inferred workspace root" warning.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
