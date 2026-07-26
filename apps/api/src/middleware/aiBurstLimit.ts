/**
 * Per-user AI burst rate limit.
 *
 * Monthly tier caps (canUseAICall) stop long-term overuse; this stops a stolen
 * token or tight loop from burning Anthropic spend in minutes.
 *
 * Uses Redis when connected; falls back to in-process memory (per instance).
 * Env: AI_BURST_MAX (default 15), AI_BURST_WINDOW_SEC (default 600).
 */

import { Request, Response, NextFunction } from 'express';
import redis from '../services/redis.js';

const DEFAULT_MAX = 15;
const DEFAULT_WINDOW_SEC = 600;

function limits(): { max: number; windowSec: number } {
  const max = parseInt(process.env.AI_BURST_MAX || String(DEFAULT_MAX), 10);
  const windowSec = parseInt(process.env.AI_BURST_WINDOW_SEC || String(DEFAULT_WINDOW_SEC), 10);
  return {
    max: Number.isFinite(max) && max > 0 ? max : DEFAULT_MAX,
    windowSec: Number.isFinite(windowSec) && windowSec > 0 ? windowSec : DEFAULT_WINDOW_SEC,
  };
}

/** In-memory fallback: userId → timestamps (ms) of recent AI-gated hits */
const memoryHits = new Map<string, number[]>();

function memoryConsume(userId: string, max: number, windowSec: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const cutoff = now - windowMs;
  const prev = (memoryHits.get(userId) || []).filter((t) => t > cutoff);
  if (prev.length >= max) {
    memoryHits.set(userId, prev);
    return { allowed: false, remaining: 0 };
  }
  prev.push(now);
  memoryHits.set(userId, prev);
  return { allowed: true, remaining: Math.max(0, max - prev.length) };
}

async function redisConsume(userId: string, max: number, windowSec: number): Promise<{ allowed: boolean; remaining: number } | null> {
  try {
    const client = redis.getClient();
    if (!client.isOpen) {
      return null;
    }
    const key = `ai_burst:${userId}`;
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, windowSec);
    }
    if (count > max) {
      // Do not keep inflating forever; leave key with TTL for natural reset
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: Math.max(0, max - count) };
  } catch (err) {
    console.error('[aiBurstLimit] Redis error, falling back to memory:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Middleware: limit authenticated AI-gated requests per user per window.
 * Must run after authenticate. Safe to stack with monthly checkLimit('aiCall').
 */
export async function aiBurstLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'AUTH_REQUIRED',
      message: 'Authentication required',
    });
    return;
  }

  const { max, windowSec } = limits();

  try {
    let result = await redisConsume(userId, max, windowSec);
    if (!result) {
      result = memoryConsume(userId, max, windowSec);
    }

    res.setHeader('X-AI-Burst-Limit', String(max));
    res.setHeader('X-AI-Burst-Remaining', String(result.remaining));
    res.setHeader('X-AI-Burst-Window-Sec', String(windowSec));

    if (!result.allowed) {
      res.status(429).json({
        success: false,
        error: 'AI_BURST_LIMIT',
        message: `Too many AI requests. Please wait a few minutes and try again (limit ${max} per ${Math.ceil(windowSec / 60)} minutes).`,
      });
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
}

/** Test helper: clear in-memory counters */
export function _resetAiBurstMemoryForTests(): void {
  memoryHits.clear();
}

export default { aiBurstLimit, _resetAiBurstMemoryForTests };
