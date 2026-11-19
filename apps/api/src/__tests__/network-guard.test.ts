/**
 * The suite must fail a non-localhost network attempt before any socket opens.
 */

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

describe('non-localhost network guard', () => {
  it('blocks HTTPS requests to a supplier host before connect', () => {
    expect(() => {
      https.request('https://example.com/price');
    }).toThrow(/Non-localhost network request blocked in tests: example\.com/);
  });

  it('blocks fetch to a non-localhost host before connect', () => {
    expect(() => {
      void fetch('https://example.com/price');
    }).toThrow(/Non-localhost network request blocked in tests: example\.com/);
  });

  it('blocks a raw socket to a non-localhost host', () => {
    expect(() => {
      const socket = new net.Socket();
      socket.connect(443, 'example.com');
    }).toThrow(/Non-localhost network request blocked in tests: example\.com/);
  });

  it('allows the loopback host used by local Postgres and supertest', () => {
    expect(() => {
      const req = http.request({ hostname: '127.0.0.1', port: 9, path: '/', method: 'GET' });
      req.on('error', () => undefined);
      req.destroy();
    }).not.toThrow();
  });
});
