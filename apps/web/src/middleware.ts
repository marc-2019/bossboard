import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from './lib/constants';

// Routes anyone (logged-in or not) can hit. Marketing landing at `/` is
// included as an exact match — it can't go in PUBLIC_PATHS because
// pathname.startsWith('/') would match every URL.
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/onboarding',
  '/invoice',
  '/klaro/',
  '/r/',
  '/tools/', // public lead tools (e.g. GST invoice helper)
];
const PUBLIC_EXACT = new Set<string>(['/', '/favicon.ico', '/robots.txt', '/sitemap.xml', '/llms.txt', '/humans.txt']);

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
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
