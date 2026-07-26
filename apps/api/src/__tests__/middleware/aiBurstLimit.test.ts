/**
 * Per-user AI burst limit middleware
 */

import { Response, NextFunction } from 'express';

const mockIsOpen = { value: false };
const mockIncr = jest.fn();
const mockExpire = jest.fn();

jest.mock('../../services/redis.js', () => ({
  __esModule: true,
  default: {
    getClient: () => ({
      get isOpen() {
        return mockIsOpen.value;
      },
      incr: (...a: unknown[]) => mockIncr(...a),
      expire: (...a: unknown[]) => mockExpire(...a),
    }),
  },
}));

import {
  aiBurstLimit,
  _resetAiBurstMemoryForTests,
} from '../../middleware/aiBurstLimit.js';

function mockReqRes(userId?: string) {
  const req = { user: userId ? { userId } : undefined } as any;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    headersSent: false,
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe('aiBurstLimit', () => {
  const prevMax = process.env.AI_BURST_MAX;
  const prevWin = process.env.AI_BURST_WINDOW_SEC;

  beforeEach(() => {
    jest.clearAllMocks();
    _resetAiBurstMemoryForTests();
    mockIsOpen.value = false;
    process.env.AI_BURST_MAX = '3';
    process.env.AI_BURST_WINDOW_SEC = '600';
  });

  afterAll(() => {
    if (prevMax === undefined) delete process.env.AI_BURST_MAX;
    else process.env.AI_BURST_MAX = prevMax;
    if (prevWin === undefined) delete process.env.AI_BURST_WINDOW_SEC;
    else process.env.AI_BURST_WINDOW_SEC = prevWin;
  });

  it('rejects unauthenticated requests', async () => {
    const { req, res, next } = mockReqRes();
    await aiBurstLimit(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows up to max requests then returns 429 (memory path)', async () => {
    for (let i = 0; i < 3; i++) {
      const { req, res, next } = mockReqRes('user-1');
      await aiBurstLimit(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(429);
    }
    const blocked = mockReqRes('user-1');
    await aiBurstLimit(blocked.req, blocked.res, blocked.next);
    expect(blocked.res.status).toHaveBeenCalledWith(429);
    expect(blocked.res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'AI_BURST_LIMIT' })
    );
    expect(blocked.next).not.toHaveBeenCalled();
  });

  it('isolates counters per user', async () => {
    for (let i = 0; i < 3; i++) {
      const a = mockReqRes('user-a');
      await aiBurstLimit(a.req, a.res, a.next);
    }
    const b = mockReqRes('user-b');
    await aiBurstLimit(b.req, b.res, b.next);
    expect(b.next).toHaveBeenCalled();
    expect(b.res.status).not.toHaveBeenCalledWith(429);
  });

  it('uses Redis when open', async () => {
    mockIsOpen.value = true;
    mockIncr.mockResolvedValueOnce(1);
    mockExpire.mockResolvedValueOnce(1);
    const { req, res, next } = mockReqRes('redis-user');
    await aiBurstLimit(req, res, next);
    expect(mockIncr).toHaveBeenCalledWith('ai_burst:redis-user');
    expect(mockExpire).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('blocks via Redis when over max', async () => {
    mockIsOpen.value = true;
    mockIncr.mockResolvedValueOnce(4); // max is 3
    const { req, res, next } = mockReqRes('redis-user');
    await aiBurstLimit(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });
});
