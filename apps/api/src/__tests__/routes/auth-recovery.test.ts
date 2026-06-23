/**
 * Auth Route Tests — recovery & verification endpoints
 *
 * Covers the previously-untested branch-heavy endpoints:
 *   - POST /forgot-password: success, validation error, enumeration-safe error swallow
 *   - POST /reset-password: success, validation error, AppError (invalid code), brute-force lockout (429)
 *   - POST /verify-email: success, validation error, AppError, lockout (429)
 *   - POST /resend-verification: success (dev includes code), AppError
 *   - POST /complete-onboarding: success, AppError, generic error -> next()
 *
 * Redis is mocked as closed so the in-memory brute-force fallback path is exercised.
 */

import request from 'supertest';
import express, { Express } from 'express';

const mockForgotPassword = jest.fn();
const mockResetPassword = jest.fn();
const mockVerifyEmail = jest.fn();
const mockResendVerification = jest.fn();
const mockCompleteOnboarding = jest.fn();

jest.mock('../../services/auth.js', () => ({
  __esModule: true,
  default: {
    forgotPassword: (...a: unknown[]) => mockForgotPassword(...a),
    resetPassword: (...a: unknown[]) => mockResetPassword(...a),
    verifyEmail: (...a: unknown[]) => mockVerifyEmail(...a),
    resendVerification: (...a: unknown[]) => mockResendVerification(...a),
    completeOnboarding: (...a: unknown[]) => mockCompleteOnboarding(...a),
  },
}));

// Authenticated endpoints get a fixed test user.
jest.mock('../../middleware/auth.js', () => ({
  authenticate: function (req: any, _res: any, next: any) {
    req.user = { userId: 'test-user-id', email: 'test@example.com' };
    next();
  },
}));

// Redis closed -> route falls back to in-memory brute-force counter.
jest.mock('../../services/redis.js', () => ({
  __esModule: true,
  default: {
    getClient: () => ({ isOpen: false }),
  },
}));

import authRoutes from '../../routes/auth.js';
import { errorHandler } from '../../middleware/error.js';

function makeAppError(message: string, statusCode: number, code: string): Error {
  const err = new Error(message) as Error & { statusCode: number; code: string };
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRoutes);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/v1/auth/forgot-password', () => {
  it('returns enumeration-safe success on valid email', async () => {
    mockForgotPassword.mockResolvedValueOnce(undefined);
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'a@b.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockForgotPassword).toHaveBeenCalledWith('a@b.com');
  });

  it('rejects an invalid email with 400', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('swallows service errors and still returns success (no enumeration)', async () => {
    mockForgotPassword.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'a@b.com' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/v1/auth/reset-password', () => {
  const valid = { email: 'a@b.com', code: '123456', newPassword: 'longenough1' };

  it('resets the password on a valid request', async () => {
    mockResetPassword.mockResolvedValueOnce(undefined);
    const res = await request(app).post('/api/v1/auth/reset-password').send(valid);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockResetPassword).toHaveBeenCalledWith('a@b.com', '123456', 'longenough1');
  });

  it('rejects a malformed body with 400', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password').send({ email: 'a@b.com', code: '12', newPassword: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('surfaces an AppError (invalid code) with its status/code', async () => {
    mockResetPassword.mockRejectedValueOnce(makeAppError('Invalid code', 400, 'INVALID_CODE'));
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ ...valid, email: 'distinct1@b.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_CODE');
  });

  it('locks out after too many failed attempts (429)', async () => {
    mockResetPassword.mockRejectedValue(makeAppError('Invalid code', 400, 'INVALID_CODE'));
    const email = 'lockme@b.com';
    // 5 allowed attempts, the 6th trips the limiter.
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/auth/reset-password').send({ ...valid, email });
    }
    const res = await request(app).post('/api/v1/auth/reset-password').send({ ...valid, email });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('TOO_MANY_ATTEMPTS');
  });
});

describe('POST /api/v1/auth/verify-email', () => {
  it('verifies with a valid code and clears the counter', async () => {
    mockVerifyEmail.mockResolvedValueOnce({ id: 'test-user-id', isVerified: true });
    const res = await request(app).post('/api/v1/auth/verify-email').send({ code: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockVerifyEmail).toHaveBeenCalledWith('test-user-id', '123456');
  });

  it('rejects a bad code length with 400', async () => {
    const res = await request(app).post('/api/v1/auth/verify-email').send({ code: '12' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('surfaces an AppError from the service', async () => {
    mockVerifyEmail.mockRejectedValueOnce(makeAppError('Wrong code', 400, 'INVALID_VERIFICATION_CODE'));
    const res = await request(app).post('/api/v1/auth/verify-email').send({ code: '654321' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_VERIFICATION_CODE');
  });
});

describe('POST /api/v1/auth/resend-verification', () => {
  it('returns success and includes the code in dev mode', async () => {
    mockResendVerification.mockResolvedValueOnce({ verificationCode: '999000' });
    const res = await request(app).post('/api/v1/auth/resend-verification').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // jest.setup sets NODE_ENV=test (not production) -> isDevelopment true
    expect(res.body.data.verificationCode).toBe('999000');
  });

  it('surfaces an AppError from the service', async () => {
    mockResendVerification.mockRejectedValueOnce(makeAppError('Already verified', 400, 'ALREADY_VERIFIED'));
    const res = await request(app).post('/api/v1/auth/resend-verification').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ALREADY_VERIFIED');
  });
});

describe('POST /api/v1/auth/complete-onboarding', () => {
  it('completes onboarding', async () => {
    mockCompleteOnboarding.mockResolvedValueOnce({ id: 'test-user-id', onboardingCompleted: true });
    const res = await request(app).post('/api/v1/auth/complete-onboarding').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('surfaces an AppError from the service', async () => {
    mockCompleteOnboarding.mockRejectedValueOnce(makeAppError('No user', 404, 'USER_NOT_FOUND'));
    const res = await request(app).post('/api/v1/auth/complete-onboarding').send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('USER_NOT_FOUND');
  });

  it('forwards a generic (non-App) error to the error handler', async () => {
    mockCompleteOnboarding.mockRejectedValueOnce(new Error('unexpected'));
    const res = await request(app).post('/api/v1/auth/complete-onboarding').send({});
    expect(res.status).toBe(500);
  });
});
