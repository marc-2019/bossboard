/**
 * API Service Tests
 * Tests token management and error classes
 */

// Mock expo-constants before importing
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { apiUrl: 'http://test-api:29000' } },
  },
}));

import {
  api,
  setAuthToken,
  getAuthToken,
  authApi,
  swmsApi,
  invoicesApi,
  customersApi,
  teamsApi,
  subscriptionsApi,
  NetworkError,
  TimeoutError,
  ApiError,
} from '../api';

const API_BASE_URL = 'http://test-api:29000';

/**
 * Build a fake `fetch` Response with the minimal surface api.ts uses:
 *  - .ok / .status
 *  - .headers.get('content-type')
 *  - .json() / .text()
 */
function makeResponse(opts: {
  status?: number;
  body?: unknown;
  contentType?: string | null;
}): Response {
  const { status = 200, body = {}, contentType = 'application/json' } = opts;
  const isJson = contentType?.includes('application/json');
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? contentType : null,
    },
    json: jest.fn(async () => body),
    text: jest.fn(async () =>
      typeof body === 'string' ? body : JSON.stringify(body)
    ),
  } as unknown as Response;
}

const originalFetch = global.fetch;
const originalRandom = Math.random;

beforeEach(() => {
  setAuthToken(null);
  // Deterministic jitter (Math.random() * 500 => 0) for retry-delay assertions
  Math.random = jest.fn(() => 0);
  // Fake timers across the suite so the request wrapper's 30s timeout timer
  // (createTimeoutPromise) never leaks as an open handle into real time.
  jest.useFakeTimers();
});

afterEach(() => {
  // Drain any timers the request wrapper left pending (e.g. the losing side of
  // the fetch-vs-timeout race) before restoring real timers.
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  global.fetch = originalFetch;
  Math.random = originalRandom;
  jest.restoreAllMocks();
});

describe('API Service', () => {
  describe('Token Management', () => {
    it('should start with null token', () => {
      expect(getAuthToken()).toBeNull();
    });

    it('should set and get auth token', () => {
      setAuthToken('test-token-123');
      expect(getAuthToken()).toBe('test-token-123');
    });

    it('should clear token when set to null', () => {
      setAuthToken('some-token');
      setAuthToken(null);
      expect(getAuthToken()).toBeNull();
    });
  });

  describe('Error Classes', () => {
    describe('NetworkError', () => {
      it('should create with message and default code', () => {
        const error = new NetworkError('Connection failed');
        expect(error.message).toBe('Connection failed');
        expect(error.code).toBe('NETWORK_ERROR');
        expect(error.name).toBe('NetworkError');
        expect(error).toBeInstanceOf(Error);
      });

      it('should accept custom code', () => {
        const error = new NetworkError('DNS failed', 'DNS_ERROR');
        expect(error.code).toBe('DNS_ERROR');
      });
    });

    describe('TimeoutError', () => {
      it('should create with default message', () => {
        const error = new TimeoutError();
        expect(error.message).toBe('Request timeout');
        expect(error.name).toBe('TimeoutError');
      });

      it('should accept custom message', () => {
        const error = new TimeoutError('Took too long');
        expect(error.message).toBe('Took too long');
      });
    });

    describe('ApiError', () => {
      it('should create with message, status, and code', () => {
        const error = new ApiError('Not found', 404, 'NOT_FOUND');
        expect(error.message).toBe('Not found');
        expect(error.status).toBe(404);
        expect(error.code).toBe('NOT_FOUND');
        expect(error.name).toBe('ApiError');
      });

      it('should default code to API_ERROR', () => {
        const error = new ApiError('Server error', 500);
        expect(error.code).toBe('API_ERROR');
      });
    });
  });
});

// ===========================================================================
// REQUEST CORE — the fetch wrapper, error classification, auth, parsing
// ===========================================================================
describe('Request Core', () => {
  describe('happy path & request construction', () => {
    it('GET hits the correct URL with default JSON headers and no body', async () => {
      global.fetch = jest
        .fn<any>()
        .mockResolvedValue(makeResponse({ status: 200, body: { ok: true } }));

      const res = await api.get('/api/v1/ping');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${API_BASE_URL}/api/v1/ping`);
      expect(init.method).toBe('GET');
      expect(init.body).toBeUndefined();
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(res).toEqual({ data: { ok: true }, status: 200 });
    });

    it('POST serializes the body as JSON', async () => {
      global.fetch = jest
        .fn<any>()
        .mockResolvedValue(makeResponse({ status: 201, body: { id: '1' } }));

      const payload = { name: 'Bob', amount: 42 };
      const res = await api.post('/api/v1/things', payload);

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify(payload));
      expect(res.status).toBe(201);
    });

    it('merges caller-supplied headers over the defaults', async () => {
      global.fetch = jest
        .fn<any>()
        .mockResolvedValue(makeResponse({ status: 200, body: {} }));

      await api.get('/api/v1/thing', { 'X-Custom': 'yes' });

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.headers['X-Custom']).toBe('yes');
      expect(init.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('auth header injection', () => {
    it('omits Authorization when no token is set', async () => {
      global.fetch = jest
        .fn<any>()
        .mockResolvedValue(makeResponse({ status: 200, body: {} }));

      await api.get('/api/v1/me');

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.headers.Authorization).toBeUndefined();
    });

    it('injects Bearer token when set', async () => {
      setAuthToken('tok-abc');
      global.fetch = jest
        .fn<any>()
        .mockResolvedValue(makeResponse({ status: 200, body: {} }));

      await api.get('/api/v1/me');

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(init.headers.Authorization).toBe('Bearer tok-abc');
    });
  });

  describe('response parsing', () => {
    it('parses JSON when content-type is application/json', async () => {
      global.fetch = jest.fn<any>().mockResolvedValue(
        makeResponse({
          status: 200,
          body: { hello: 'world' },
          contentType: 'application/json; charset=utf-8',
        })
      );

      const res = await api.get('/api/v1/json');
      expect(res.data).toEqual({ hello: 'world' });
    });

    it('falls back to text() for non-JSON content types', async () => {
      global.fetch = jest.fn<any>().mockResolvedValue(
        makeResponse({
          status: 200,
          body: 'plain text body',
          contentType: 'text/plain',
        })
      );

      const res = await api.get('/api/v1/text');
      expect(res.data).toBe('plain text body');
    });

    it('treats a missing content-type header as non-JSON (text)', async () => {
      global.fetch = jest.fn<any>().mockResolvedValue(
        makeResponse({
          status: 200,
          body: 'no-ct',
          contentType: null,
        })
      );

      const res = await api.get('/api/v1/noct');
      expect(res.data).toBe('no-ct');
    });
  });

  describe('error classification', () => {
    it('throws ApiError with status/code/message from the body on a non-ok response', async () => {
      global.fetch = jest.fn<any>().mockResolvedValue(
        makeResponse({
          status: 404,
          body: { message: 'Missing', error: 'NOT_FOUND' },
        })
      );

      await expect(api.get('/api/v1/missing')).rejects.toMatchObject({
        name: 'ApiError',
        status: 404,
        code: 'NOT_FOUND',
        message: 'Missing',
      });
    });

    it('falls back to default ApiError message/code when body lacks them', async () => {
      // 500 is retryable; with the default retries=3 the request keeps trying
      // and ultimately throws the same ApiError. Fake timers fast-forward the backoff.
      jest.useFakeTimers();
      global.fetch = jest
        .fn<any>()
        .mockResolvedValue(makeResponse({ status: 500, body: {} }));

      const promise = api.get('/api/v1/boom');
      const assertion = expect(promise).rejects.toMatchObject({
        name: 'ApiError',
        status: 500,
        message: 'API request failed',
        code: 'UNKNOWN_ERROR',
      });
      await jest.runAllTimersAsync();
      await assertion;
    });

    it('classifies a fetch TypeError as a NetworkError', async () => {
      jest.useFakeTimers();
      global.fetch = jest
        .fn<any>()
        .mockRejectedValue(new TypeError('Failed to fetch'));

      const promise = api.get('/api/v1/down');
      const assertion = expect(promise).rejects.toMatchObject({
        name: 'NetworkError',
        code: 'NETWORK_ERROR',
      });
      await jest.runAllTimersAsync();
      await assertion;
    });

    it('wraps an unknown thrown error as a NetworkError with UNKNOWN_ERROR code', async () => {
      jest.useFakeTimers();
      global.fetch = jest
        .fn<any>()
        .mockRejectedValue(new Error('something weird'));

      const promise = api.get('/api/v1/weird');
      const assertion = expect(promise).rejects.toMatchObject({
        name: 'NetworkError',
        code: 'UNKNOWN_ERROR',
        message: 'something weird',
      });
      await jest.runAllTimersAsync();
      await assertion;
    });
  });

  describe('timeout behaviour', () => {
    it('rejects with TimeoutError when fetch outlives the timeout', async () => {
      jest.useFakeTimers();
      // fetch never resolves -> the timeout promise wins the race.
      // TimeoutError is retryable, so it retries (default 3x) and finally rejects with TimeoutError.
      global.fetch = jest.fn<any>().mockImplementation(() => new Promise(() => {}));

      const promise = api.get('/api/v1/slow');
      const assertion = expect(promise).rejects.toBeInstanceOf(TimeoutError);
      await jest.runAllTimersAsync();
      await assertion;
    });

    it('resolves normally when fetch beats the timeout', async () => {
      jest.useFakeTimers();
      global.fetch = jest
        .fn<any>()
        .mockResolvedValue(makeResponse({ status: 200, body: { ok: 1 } }));

      const promise = api.get('/api/v1/fast');
      await jest.runAllTimersAsync();
      await expect(promise).resolves.toEqual({ data: { ok: 1 }, status: 200 });
    });
  });

  describe('retry & backoff', () => {
    it('retries a 5xx and succeeds on a later attempt', async () => {
      jest.useFakeTimers();
      const fetchMock = jest
        .fn<any>()
        .mockResolvedValueOnce(makeResponse({ status: 503, body: {} }))
        .mockResolvedValueOnce(makeResponse({ status: 200, body: { ok: true } }));
      global.fetch = fetchMock;

      const promise = api.get('/api/v1/flaky');
      await jest.runAllTimersAsync();
      const res = await promise;

      // failed once (503) then succeeded -> 2 fetch calls
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(res).toEqual({ data: { ok: true }, status: 200 });
    });

    it('does NOT retry a 4xx client error (skipRetryOn default)', async () => {
      const fetchMock = jest
        .fn<any>()
        .mockResolvedValue(makeResponse({ status: 400, body: { message: 'bad' } }));
      global.fetch = fetchMock;

      // 400 is in the default skipRetryOn list -> no retry, no backoff timers involved
      await expect(api.get('/api/v1/bad')).rejects.toMatchObject({
        name: 'ApiError',
        status: 400,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('exhausts all (default 3) retries on persistent 5xx then throws the last ApiError', async () => {
      jest.useFakeTimers();
      const fetchMock = jest
        .fn<any>()
        .mockResolvedValue(makeResponse({ status: 500, body: { error: 'BOOM' } }));
      global.fetch = fetchMock;

      const promise = api.get('/api/v1/dead');
      const assertion = expect(promise).rejects.toMatchObject({
        name: 'ApiError',
        status: 500,
        code: 'BOOM',
      });
      await jest.runAllTimersAsync();
      await assertion;

      // initial attempt + 3 retries = 4 calls (default retries=3)
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('retries network failures (TypeError -> NetworkError) up to the default limit', async () => {
      jest.useFakeTimers();
      const fetchMock = jest
        .fn<any>()
        .mockRejectedValue(new TypeError('Failed to fetch'));
      global.fetch = fetchMock;

      const promise = api.get('/api/v1/offline');
      const assertion = expect(promise).rejects.toBeInstanceOf(NetworkError);
      await jest.runAllTimersAsync();
      await assertion;

      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('uses exponential backoff between retries (1s, 2s, 4s with jitter pinned to 0)', async () => {
      jest.useFakeTimers();
      const backoffDelays: number[] = [];
      const setTimeoutSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation(((fn: (...a: any[]) => void, ms?: number) => {
          // The per-attempt timeout uses 30000ms; backoff sleeps are < 30000.
          if (typeof ms === 'number' && ms < 30000) backoffDelays.push(ms);
          // Fire backoff (sleep) callbacks immediately; never fire the 30000 timeout.
          if (typeof ms === 'number' && ms < 30000) fn();
          return 0 as unknown as ReturnType<typeof setTimeout>;
        }) as any);

      const fetchMock = jest
        .fn<any>()
        .mockResolvedValue(makeResponse({ status: 500, body: {} }));
      global.fetch = fetchMock;

      await api.get('/api/v1/backoff').catch(() => {});

      setTimeoutSpy.mockRestore();
      // baseDelay 1000 * 2^attempt, jitter=0 => 1000, 2000, 4000 for attempts 0,1,2
      expect(backoffDelays).toEqual([1000, 2000, 4000]);
    });
  });

  describe('GET request deduplication', () => {
    it('dedupes concurrent identical in-flight GETs into a single fetch', async () => {
      let resolveFetch: (r: Response) => void = () => {};
      const fetchMock = jest.fn<any>().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          })
      );
      global.fetch = fetchMock;

      const p1 = api.get('/api/v1/dedupe');
      const p2 = api.get('/api/v1/dedupe');

      resolveFetch(makeResponse({ status: 200, body: { v: 1 } }));
      const [r1, r2] = await Promise.all([p1, p2]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(r1).toEqual({ data: { v: 1 }, status: 200 });
      expect(r2).toEqual({ data: { v: 1 }, status: 200 });
    });

    it('does NOT dedupe sequential GETs once the first has settled', async () => {
      global.fetch = jest
        .fn<any>()
        .mockResolvedValue(makeResponse({ status: 200, body: { v: 1 } }));

      await api.get('/api/v1/seq');
      await api.get('/api/v1/seq');

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('does NOT dedupe POST requests', async () => {
      global.fetch = jest
        .fn<any>()
        .mockImplementation(() =>
          Promise.resolve(makeResponse({ status: 200, body: {} }))
        );

      await Promise.all([
        api.post('/api/v1/p', { a: 1 }),
        api.post('/api/v1/p', { a: 1 }),
      ]);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});

// ===========================================================================
// ENDPOINT WRAPPERS — representative sample: method/URL/body correctness
// ===========================================================================
describe('Endpoint Wrappers', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest
      .fn<any>()
      .mockResolvedValue(makeResponse({ status: 200, body: { ok: true } }));
    global.fetch = fetchMock;
  });

  const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1];

  it('authApi.login POSTs to /auth/login with credentials', async () => {
    await authApi.login({ email: 'a@b.com', password: 'pw' });
    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE_URL}/api/v1/auth/login`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.com', password: 'pw' }));
  });

  it('authApi.refreshToken wraps the token in a refreshToken field', async () => {
    await authApi.refreshToken('rt-123');
    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE_URL}/api/v1/auth/refresh`);
    expect(init.body).toBe(JSON.stringify({ refreshToken: 'rt-123' }));
  });

  it('authApi.deleteAccount issues a DELETE', async () => {
    await authApi.deleteAccount();
    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE_URL}/api/v1/auth/account`);
    expect(init.method).toBe('DELETE');
  });

  it('swmsApi.getTemplate interpolates the trade type into the path', async () => {
    await swmsApi.getTemplate('electrician');
    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE_URL}/api/v1/swms/templates/electrician`);
    expect(init.method).toBe('GET');
  });

  it('swmsApi.sign POSTs signature + role to the sign endpoint', async () => {
    await swmsApi.sign('s1', 'sigdata', 'supervisor');
    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE_URL}/api/v1/swms/s1/sign`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(
      JSON.stringify({ signature: 'sigdata', role: 'supervisor' })
    );
  });

  it('invoicesApi.list builds a query string from params', async () => {
    await invoicesApi.list({ status: 'sent', limit: 10, offset: 20 });
    const [url] = lastCall();
    expect(url).toBe(
      `${API_BASE_URL}/api/v1/invoices?status=sent&limit=10&offset=20`
    );
  });

  it('invoicesApi.list omits the query string entirely when no params given', async () => {
    await invoicesApi.list();
    const [url] = lastCall();
    expect(url).toBe(`${API_BASE_URL}/api/v1/invoices`);
  });

  it('invoicesApi.markAsPaid POSTs to the /paid sub-resource', async () => {
    await invoicesApi.markAsPaid('inv-9');
    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE_URL}/api/v1/invoices/inv-9/paid`);
    expect(init.method).toBe('POST');
  });

  it('invoicesApi.getPdfUrl returns a plain URL string without calling fetch', () => {
    const url = invoicesApi.getPdfUrl('inv-9');
    expect(url).toBe(`${API_BASE_URL}/api/v1/invoices/inv-9/pdf`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('customersApi.list encodes a search term safely', async () => {
    await customersApi.list({ search: 'John & Co' });
    const [url] = lastCall();
    // URLSearchParams encodes spaces as + and & as %26
    expect(url).toBe(`${API_BASE_URL}/api/v1/customers?search=John+%26+Co`);
  });

  it('teamsApi.updateMemberRole PUTs the role into a nested member path', async () => {
    await teamsApi.updateMemberRole('t1', 'm2', 'admin');
    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE_URL}/api/v1/teams/t1/members/m2/role`);
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ role: 'admin' }));
  });

  it('subscriptionsApi.createBillingPortalSession defaults to an empty-object body', async () => {
    await subscriptionsApi.createBillingPortalSession();
    const [url, init] = lastCall();
    expect(url).toBe(`${API_BASE_URL}/api/v1/subscriptions/portal`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({}));
  });
});
