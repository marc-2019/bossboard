/**
 * GA4 server-side helper tests
 *
 * Focus: the safety contract that protects the Stripe webhook —
 *   - no-op (no fetch) when GA4_MP_API_SECRET is unset
 *   - happy-path POST to the Measurement Protocol endpoint with the right
 *     measurement_id / api_secret and a well-formed body
 *   - undefined params are stripped
 *   - network failures are swallowed (never throws)
 *
 * The config module is mocked so we can flip mpApiSecret per-test. global.fetch
 * is mocked so no network call is ever made.
 */

const configMock: {
  config: { isDevelopment: boolean; ga4: { measurementId: string; mpApiSecret: string } };
} = {
  config: {
    isDevelopment: false,
    ga4: { measurementId: 'G-83NPHN0QP5', mpApiSecret: '' },
  },
};

jest.mock('../../config/index.js', () => configMock);

import { trackServerEvent } from '../../services/ga4.js';

const mockFetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (global as unknown as { fetch: jest.Mock }).fetch = mockFetch;
  configMock.config.ga4.measurementId = 'G-83NPHN0QP5';
  configMock.config.ga4.mpApiSecret = '';
});

describe('trackServerEvent', () => {
  it('is a clean no-op (no fetch, no throw) when GA4_MP_API_SECRET is unset', async () => {
    configMock.config.ga4.mpApiSecret = '';

    await expect(
      trackServerEvent('checkout_completed', { tier: 'tradie', value: 19.99 })
    ).resolves.toBeUndefined();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('POSTs to the Measurement Protocol endpoint with measurement_id + api_secret when configured', async () => {
    configMock.config.ga4.mpApiSecret = 'secret_abc';
    mockFetch.mockResolvedValue({ ok: true, status: 204 });

    await trackServerEvent(
      'checkout_completed',
      { tier: 'team', value: 39.99, currency: 'nzd', transaction_id: 'cs_1', user_id: 'u1' },
      'cus_1'
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('https://www.google-analytics.com/mp/collect');
    expect(url).toContain('measurement_id=G-83NPHN0QP5');
    expect(url).toContain('api_secret=secret_abc');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body.client_id).toBe('cus_1');
    expect(body.events).toHaveLength(1);
    expect(body.events[0].name).toBe('checkout_completed');
    expect(body.events[0].params).toEqual({
      tier: 'team',
      value: 39.99,
      currency: 'nzd',
      transaction_id: 'cs_1',
      user_id: 'u1',
    });
  });

  it('defaults client_id to "server" when none is provided', async () => {
    configMock.config.ga4.mpApiSecret = 'secret_abc';
    mockFetch.mockResolvedValue({ ok: true, status: 204 });

    await trackServerEvent('checkout_completed', { tier: 'tradie' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.client_id).toBe('server');
  });

  it('strips undefined params before sending', async () => {
    configMock.config.ga4.mpApiSecret = 'secret_abc';
    mockFetch.mockResolvedValue({ ok: true, status: 204 });

    await trackServerEvent('checkout_completed', {
      tier: 'tradie',
      value: 19.99,
      user_id: undefined,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.events[0].params).toEqual({ tier: 'tradie', value: 19.99 });
    expect('user_id' in body.events[0].params).toBe(false);
  });

  it('swallows network errors and never throws (fail-open)', async () => {
    configMock.config.ga4.mpApiSecret = 'secret_abc';
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(trackServerEvent('checkout_completed', { tier: 'tradie' })).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[GA4]'),
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('logs a warning but does not throw when the endpoint returns non-2xx', async () => {
    configMock.config.ga4.mpApiSecret = 'secret_abc';
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(trackServerEvent('checkout_completed', { tier: 'tradie' })).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('500'));
    consoleSpy.mockRestore();
  });
});
