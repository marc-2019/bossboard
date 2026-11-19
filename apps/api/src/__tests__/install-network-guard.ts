/**
 * Fail any test that opens a non-localhost network connection.
 * Supplier pricing must not call a merchant. Local Postgres and supertest stay allowed.
 */

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function assertLoopbackHost(hostname: string): void {
  const bare = hostname.replace(/^\[|\]$/g, '').trim().toLowerCase();
  if (bare === '' || LOCAL_HOSTS.has(bare)) return;
  throw new Error(`Non-localhost network request blocked in tests: ${hostname}`);
}

function hostFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function inspectRequestArgs(args: unknown[]): void {
  const first = args[0];
  if (typeof first === 'string') {
    const host = hostFromUrl(first);
    if (host) assertLoopbackHost(host);
    return;
  }
  if (first instanceof URL) {
    assertLoopbackHost(first.hostname);
    return;
  }
  if (first && typeof first === 'object') {
    const opts = first as { hostname?: string; host?: string; href?: string };
    if (typeof opts.href === 'string') {
      const host = hostFromUrl(opts.href);
      if (host) assertLoopbackHost(host);
    }
    const raw = opts.hostname || (opts.host ? String(opts.host).split(':')[0] : '');
    if (raw) assertLoopbackHost(raw);
  }
}

function wrapHttpMethod(
  mod: { request: (...args: never[]) => unknown; get: (...args: never[]) => unknown },
  name: 'request' | 'get',
): void {
  const original = mod[name].bind(mod) as (...args: unknown[]) => unknown;
  (mod as unknown as Record<string, (...args: unknown[]) => unknown>)[name] = (...args: unknown[]) => {
    inspectRequestArgs(args);
    return original(...args);
  };
}

wrapHttpMethod(http, 'request');
wrapHttpMethod(http, 'get');
wrapHttpMethod(https, 'request');
wrapHttpMethod(https, 'get');

if (typeof globalThis.fetch === 'function') {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: string | URL | { url: string }, init?: Parameters<typeof fetch>[1]) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const host = hostFromUrl(url);
    if (host) assertLoopbackHost(host);
    return originalFetch(input as Parameters<typeof fetch>[0], init);
  }) as typeof fetch;
}

const originalSocketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function connectGuarded(
  this: net.Socket,
  ...args: unknown[]
): net.Socket {
  const first = args[0];
  if (typeof first === 'number') {
    const host = args[1];
    if (typeof host === 'string') assertLoopbackHost(host);
  } else if (first && typeof first === 'object') {
    const opts = first as { host?: string; hostname?: string };
    const host = opts.hostname || opts.host;
    if (typeof host === 'string' && host !== '') assertLoopbackHost(host);
  }
  return originalSocketConnect.apply(this, args as never);
} as typeof net.Socket.prototype.connect;
