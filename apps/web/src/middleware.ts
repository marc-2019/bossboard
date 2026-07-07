import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from './lib/constants';

// Routes anyone (logged-in or not) can hit. Marketing landing at `/` is
// included as an exact match — it can't go in PUBLIC_PATHS because
// pathname.startsWith('/') would match every URL.
const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/onboarding', '/invoice', '/klaro/'];
// `/pricing` is public marketing: logged-out visitors must be able to compare
// plans before registering. It renders from the (public) tiers endpoint only.
const PUBLIC_EXACT = new Set<string>(['/', '/pricing', '/favicon.ico', '/robots.txt', '/sitemap.xml', '/llms.txt', '/humans.txt']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths, API routes, and static assets
  if (
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/')
  ) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    // Preserve the query string so intent survives the login round-trip
    // (e.g. /subscription?intent=team from the pricing page's paid CTAs).
    loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
