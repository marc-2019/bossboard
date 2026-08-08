/**
 * Authentication Routes
 * /api/v1/auth/*
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import authService from '../services/auth.js';
import { authenticate } from '../middleware/auth.js';
import config from '../config/index.js';
import redis from '../services/redis.js';

// Brute-force protection: lock out after MAX_ATTEMPTS failed code verifications
const MAX_CODE_ATTEMPTS = 5;
const CODE_LOCKOUT_SECONDS = 900; // 15 minutes

// In-memory fallback when Redis is unavailable: { key -> { count, expiresAt } }
const memoryAttempts = new Map<string, { count: number; expiresAt: number }>();

function memoryCheckAttempts(key: string): { allowed: boolean; attempts: number } {
  const now = Date.now();
  const entry = memoryAttempts.get(key);
  if (!entry || entry.expiresAt < now) {
    memoryAttempts.set(key, { count: 1, expiresAt: now + CODE_LOCKOUT_SECONDS * 1000 });
    return { allowed: true, attempts: 1 };
  }
  entry.count += 1;
  return { allowed: entry.count <= MAX_CODE_ATTEMPTS, attempts: entry.count };
}

function memoryClearAttempts(key: string): void {
  memoryAttempts.delete(key);
}

async function checkCodeAttempts(key: string): Promise<{ allowed: boolean; attempts: number }> {
  try {
    const client = redis.getClient();
    if (!client.isOpen) return memoryCheckAttempts(key);
    const attempts = await client.incr(key);
    if (attempts === 1) {
      await client.expire(key, CODE_LOCKOUT_SECONDS);
    }
    return { allowed: attempts <= MAX_CODE_ATTEMPTS, attempts };
  } catch {
    return memoryCheckAttempts(key);
  }
}

async function clearCodeAttempts(key: string): Promise<void> {
  try {
    const client = redis.getClient();
    if (client.isOpen) {
      await client.del(key);
    } else {
      memoryClearAttempts(key);
    }
  } catch {
    memoryClearAttempts(key);
  }
}

// App error type for error handling
interface AppError extends Error {
  statusCode: number;
  code: string;
}

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional(),
  phone: z.string().optional(),
  tradeType: z.enum(['electrician', 'plumber', 'builder', 'landscaper', 'painter', 'other']).optional(),
  businessName: z.string().optional(),
  /** Friend referral code (from /r/CODE) — attached after account create */
  referralCode: z.string().min(4).max(32).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const updateProfileSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  tradeType: z.enum(['electrician', 'plumber', 'builder', 'landscaper', 'painter', 'other']).optional(),
  businessName: z.string().optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/auth/register
 * Register a new user
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
        details: validation.error.errors,
      });
      return;
    }

    const { referralCode, ...registerInput } = validation.data;
    const { user, tokens, verificationCode } = await authService.register(registerInput);

    // Best-effort friend-code attach (does not fail registration)
    if (referralCode) {
      try {
        const { attachReferralCode } = await import('../services/referrals.js');
        await attachReferralCode(user.id, referralCode);
      } catch (err) {
        console.warn('[Auth] referral attach on register failed (non-fatal):', err);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        user,
        tokens,
        ...(config.isDevelopment && { verificationCode }), // Only include in dev; production uses email
      },
      message: 'Registration successful. Please verify your email.',
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      const appError = error as AppError;
      res.status(appError.statusCode).json({
        success: false,
        error: appError.code,
        message: appError.message,
      });
      return;
    }
    next(error);
  }
});

/**
 * POST /api/v1/auth/login
 * Login a user
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const { user, tokens } = await authService.login(validation.data);

    res.json({
      success: true,
      data: {
        user,
        tokens,
      },
      message: 'Login successful',
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      const appError = error as AppError;
      res.status(appError.statusCode).json({
        success: false,
        error: appError.code,
        message: appError.message,
      });
      return;
    }
    next(error);
  }
});

/**
 * POST /api/v1/auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = refreshSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const tokens = await authService.refreshToken(validation.data.refreshToken);

    res.json({
      success: true,
      data: { tokens },
      message: 'Token refreshed successfully',
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      const appError = error as AppError;
      res.status(appError.statusCode).json({
        success: false,
        error: appError.code,
        message: appError.message,
      });
      return;
    }
    next(error);
  }
});

/**
 * POST /api/v1/auth/logout
 * Logout user (revoke refresh token)
 */
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    await authService.logout(req.user!.userId, refreshToken);

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/auth/account
 * Delete user account and all associated data.
 * Required by Google Play Account Deletion policy (effective Dec 2023).
 */
router.delete('/account', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.deleteAccount(req.user!.userId);

    res.json({
      success: true,
      message: 'Account and all associated data have been permanently deleted.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/auth/me
 * Get current user profile
 */
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await authService.getUserById(req.user!.userId);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/auth/me
 * Update current user profile
 */
router.put('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = updateProfileSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const user = await authService.updateUser(req.user!.userId, validation.data);

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { user },
      message: 'Profile updated successfully',
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// PASSWORD RESET ROUTES (unauthenticated)
// =============================================================================

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'Reset code must be 6 digits'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * POST /api/v1/auth/forgot-password
 * Request a password reset code (unauthenticated)
 */
router.post('/forgot-password', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const validation = forgotPasswordSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
      });
      return;
    }

    await authService.forgotPassword(validation.data.email);

    // Always return success to prevent email enumeration
    res.json({
      success: true,
      message: 'If an account exists with that email, a reset code has been sent.',
    });
  } catch (error) {
    // Swallow errors to prevent email enumeration
    res.json({
      success: true,
      message: 'If an account exists with that email, a reset code has been sent.',
    });
  }
});

/**
 * POST /api/v1/auth/reset-password
 * Reset password with code (unauthenticated)
 */
router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = resetPasswordSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
      });
      return;
    }

    // Brute-force protection: limit failed attempts per email
    const attemptKey = `bf:reset:${validation.data.email.toLowerCase()}`;
    const { allowed } = await checkCodeAttempts(attemptKey);
    if (!allowed) {
      res.status(429).json({
        success: false,
        error: 'TOO_MANY_ATTEMPTS',
        message: 'Too many failed attempts. Please request a new reset code.',
      });
      return;
    }

    await authService.resetPassword(
      validation.data.email,
      validation.data.code,
      validation.data.newPassword
    );

    // Success — clear attempt counter
    await clearCodeAttempts(attemptKey);

    res.json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.',
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      const appError = error as AppError;
      res.status(appError.statusCode).json({
        success: false,
        error: appError.code,
        message: appError.message,
      });
      return;
    }
    next(error);
  }
});

// =============================================================================
// VERIFICATION & ONBOARDING ROUTES
// =============================================================================

const verifyEmailSchema = z.object({
  code: z.string().length(6, 'Verification code must be 6 digits'),
});

/**
 * POST /api/v1/auth/verify-email
 * Verify email with 6-digit code
 */
router.post('/verify-email', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = verifyEmailSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
      });
      return;
    }

    // Brute-force protection: limit failed attempts per user
    const attemptKey = `bf:verify:${req.user!.userId}`;
    const { allowed } = await checkCodeAttempts(attemptKey);
    if (!allowed) {
      res.status(429).json({
        success: false,
        error: 'TOO_MANY_ATTEMPTS',
        message: 'Too many failed attempts. Please request a new verification code.',
      });
      return;
    }

    const user = await authService.verifyEmail(req.user!.userId, validation.data.code);

    // Success — clear attempt counter
    await clearCodeAttempts(attemptKey);

    res.json({
      success: true,
      data: { user },
      message: 'Email verified successfully',
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      const appError = error as AppError;
      res.status(appError.statusCode).json({
        success: false,
        error: appError.code,
        message: appError.message,
      });
      return;
    }
    next(error);
  }
});

/**
 * POST /api/v1/auth/resend-verification
 * Resend verification code
 */
router.post('/resend-verification', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { verificationCode } = await authService.resendVerification(req.user!.userId);

    res.json({
      success: true,
      data: {
        ...(config.isDevelopment && { verificationCode }), // Only include in dev; production uses email
      },
      message: 'Verification code sent',
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      const appError = error as AppError;
      res.status(appError.statusCode).json({
        success: false,
        error: appError.code,
        message: appError.message,
      });
      return;
    }
    next(error);
  }
});

/**
 * POST /api/v1/auth/complete-onboarding
 * Mark onboarding as completed
 */
router.post('/complete-onboarding', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await authService.completeOnboarding(req.user!.userId);

    res.json({
      success: true,
      data: { user },
      message: 'Onboarding completed',
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      const appError = error as AppError;
      res.status(appError.statusCode).json({
        success: false,
        error: appError.code,
        message: appError.message,
      });
      return;
    }
    next(error);
  }
});

export default router;
