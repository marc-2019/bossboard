/**
 * Notifications Route Tests
 */

import request from 'supertest';
import express, { Express } from 'express';

// Mock services
const mockSavePushToken = jest.fn();
const mockRemovePushToken = jest.fn();
const mockGetPushToken = jest.fn();
const mockSendPushNotifications = jest.fn();
const mockRunCertExpiryCheckNow = jest.fn();

jest.mock('../../services/notifications.js', () => ({
  __esModule: true,
  default: {
    savePushToken: mockSavePushToken,
    removePushToken: mockRemovePushToken,
    getPushToken: mockGetPushToken,
    sendPushNotifications: mockSendPushNotifications,
  },
}));

jest.mock('../../services/cron.js', () => ({
  __esModule: true,
  default: {
    runCertExpiryCheckNow: mockRunCertExpiryCheckNow,
  },
}));

jest.mock('../../middleware/auth.js', () => ({
  authenticate: function (req: any, _res: any, next: any) {
    req.user = { userId: 'test-user-id', email: 'test@example.com' };
    next();
  },
}));

jest.mock('../../config/index.js', () => ({
  // isDevelopment: true → check-expiry uses JWT auth (mocked above) for local tests
  config: { appName: 'BossBoard', port: 29001, isDevelopment: true },
}));

jest.mock('../../middleware/serviceToken.js', () => ({
  authenticateServiceToken: function (_req: any, res: any, _next: any) {
    res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Invalid or missing service token',
    });
  },
}));

import notificationRoutes from '../../routes/notifications.js';
import { errorHandler } from '../../middleware/error.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/v1/notifications', notificationRoutes);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Notification Routes', () => {
  // =========================================================================
  // POST /push-token
  // =========================================================================
  describe('POST /api/v1/notifications/push-token', () => {
    it('should register a push token successfully', async () => {
      mockSavePushToken.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/notifications/push-token')
        .send({ pushToken: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('registered');
      expect(mockSavePushToken).toHaveBeenCalledWith(
        'test-user-id',
        'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]'
      );
    });

    it('should reject missing pushToken', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/push-token')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject empty pushToken', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/push-token')
        .send({ pushToken: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should handle service errors with statusCode', async () => {
      const serviceError = Object.assign(new Error('Token invalid'), {
        statusCode: 422,
        code: 'INVALID_TOKEN',
      });
      mockSavePushToken.mockRejectedValue(serviceError);

      const response = await request(app)
        .post('/api/v1/notifications/push-token')
        .send({ pushToken: 'bad-token' });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe('INVALID_TOKEN');
    });

    it('should forward unexpected errors (no statusCode) to the error handler', async () => {
      mockSavePushToken.mockRejectedValue(new Error('db down'));

      const response = await request(app)
        .post('/api/v1/notifications/push-token')
        .send({ pushToken: 'ExponentPushToken[abc]' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

  });

  // =========================================================================
  // DELETE /push-token
  // =========================================================================
  describe('DELETE /api/v1/notifications/push-token', () => {
    it('should remove the push token on logout', async () => {
      mockRemovePushToken.mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/v1/notifications/push-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('removed');
      expect(mockRemovePushToken).toHaveBeenCalledWith('test-user-id');
    });

    it('should handle service errors with statusCode', async () => {
      const serviceError = Object.assign(new Error('Not found'), {
        statusCode: 404,
        code: 'TOKEN_NOT_FOUND',
      });
      mockRemovePushToken.mockRejectedValue(serviceError);

      const response = await request(app)
        .delete('/api/v1/notifications/push-token');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('TOKEN_NOT_FOUND');
    });

    it('should forward unexpected errors (no statusCode) to the error handler', async () => {
      mockRemovePushToken.mockRejectedValue(new Error('db down'));

      const response = await request(app)
        .delete('/api/v1/notifications/push-token');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  // =========================================================================
  // POST /test
  // =========================================================================
  describe('POST /api/v1/notifications/test', () => {
    it('should send a test notification when token exists', async () => {
      mockGetPushToken.mockResolvedValue('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]');
      mockSendPushNotifications.mockResolvedValue([{ status: 'ok', id: 'ticket-1' }]);

      const response = await request(app)
        .post('/api/v1/notifications/test')
        .send();

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('sent');
      expect(mockSendPushNotifications).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            to: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
            title: expect.stringContaining('BossBoard'),
          }),
        ])
      );
    });

    it('should return 400 when no push token registered', async () => {
      mockGetPushToken.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/notifications/test')
        .send();

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('NO_PUSH_TOKEN');
    });

    it('should report failure when notification ticket status is not ok', async () => {
      mockGetPushToken.mockResolvedValue('ExponentPushToken[xxx]');
      mockSendPushNotifications.mockResolvedValue([{ status: 'error', message: 'DeviceNotRegistered' }]);

      const response = await request(app)
        .post('/api/v1/notifications/test')
        .send();

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Failed');
    });

    it('should report failure when no tickets returned', async () => {
      mockGetPushToken.mockResolvedValue('ExponentPushToken[xxx]');
      mockSendPushNotifications.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/v1/notifications/test')
        .send();

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
    });

    it('should handle service errors with statusCode', async () => {
      const serviceError = Object.assign(new Error('Expo down'), {
        statusCode: 502,
        code: 'PUSH_PROVIDER_ERROR',
      });
      mockGetPushToken.mockRejectedValue(serviceError);

      const response = await request(app)
        .post('/api/v1/notifications/test')
        .send();

      expect(response.status).toBe(502);
      expect(response.body.error).toBe('PUSH_PROVIDER_ERROR');
    });

    it('should forward unexpected errors (no statusCode) to the error handler', async () => {
      mockGetPushToken.mockRejectedValue(new Error('db down'));

      const response = await request(app)
        .post('/api/v1/notifications/test')
        .send();

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  // =========================================================================
  // POST /check-expiry
  // =========================================================================
  describe('POST /api/v1/notifications/check-expiry', () => {
    it('should trigger cert expiry check and return results', async () => {
      const mockResult = { checked: 5, notified: 2, errors: 0 };
      mockRunCertExpiryCheckNow.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/notifications/check-expiry')
        .send();

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.checked).toBe(5);
      expect(response.body.data.notified).toBe(2);
      expect(mockRunCertExpiryCheckNow).toHaveBeenCalled();
    });

    it('should handle service errors with statusCode', async () => {
      const serviceError = Object.assign(new Error('Cron locked'), {
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
      });
      mockRunCertExpiryCheckNow.mockRejectedValue(serviceError);

      const response = await request(app)
        .post('/api/v1/notifications/check-expiry')
        .send();

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('SERVICE_UNAVAILABLE');
    });

    it('should forward unexpected errors (no statusCode) to the error handler', async () => {
      mockRunCertExpiryCheckNow.mockRejectedValue(new Error('cron crashed'));

      const response = await request(app)
        .post('/api/v1/notifications/check-expiry')
        .send();

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });
});
