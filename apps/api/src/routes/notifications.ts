/**
 * Notification Routes
 * Push token management and notification preferences
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { authenticateServiceToken } from '../middleware/serviceToken.js';
import { config } from '../config/index.js';
import notificationsService from '../services/notifications.js';
import cronService from '../services/cron.js';

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const registerTokenSchema = z.object({
  pushToken: z.string().min(1, 'Push token is required'),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/notifications/push-token - Register push token
 */
router.post('/push-token', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = registerTokenSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const userId = req.user!.userId;
    await notificationsService.savePushToken(userId, validation.data.pushToken);

    res.json({
      success: true,
      message: 'Push token registered',
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        error: error.code,
        message: error.message,
      });
      return;
    }
    next(error);
  }
});

/**
 * DELETE /api/v1/notifications/push-token - Remove push token (on logout)
 */
router.delete('/push-token', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    await notificationsService.removePushToken(userId);

    res.json({
      success: true,
      message: 'Push token removed',
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        error: error.code,
        message: error.message,
      });
      return;
    }
    next(error);
  }
});

/**
 * POST /api/v1/notifications/test - Send a test notification to the current user
 */
router.post('/test', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const token = await notificationsService.getPushToken(userId);

    if (!token) {
      res.status(400).json({
        success: false,
        error: 'NO_PUSH_TOKEN',
        message: 'No push token registered. Enable notifications in the app first.',
      });
      return;
    }

    const tickets = await notificationsService.sendPushNotifications([{
      to: token,
      title: `🔔 ${config.appName} Test`,
      body: 'Push notifications are working! You\'ll receive cert expiry reminders.',
      data: { type: 'test' },
      sound: 'default',
    }]);

    const success = tickets.length > 0 && tickets[0].status === 'ok';

    res.json({
      success,
      message: success ? 'Test notification sent' : 'Failed to send test notification',
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        success: false,
        error: error.code,
        message: error.message,
      });
      return;
    }
    next(error);
  }
});

/**
 * POST /api/v1/notifications/check-expiry - Manually trigger cert expiry check
 * for ALL users. Restricted to service token (ops/CF) — never any logged-in user.
 * In development only, allow JWT auth for local debugging.
 */
router.post(
  '/check-expiry',
  (req: Request, res: Response, next: NextFunction) => {
    if (config.isDevelopment) {
      return authenticate(req, res, next);
    }
    return authenticateServiceToken(req, res, next);
  },
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await cronService.runCertExpiryCheckNow();

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          success: false,
          error: error.code,
          message: error.message,
        });
        return;
      }
      next(error);
    }
  },
);

export default router;
