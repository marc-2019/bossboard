/**
 * Feedback Routes — Lane A (product-feedback-universal-pattern).
 * User JWT: create + list own. Service token: export + status ack for CF poller.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { authenticateServiceToken } from '../middleware/serviceToken.js';
import feedbackService from '../services/feedback.js';

const router = Router();

const createFeedbackSchema = z.object({
  category: z.enum(['bug', 'idea', 'other', 'rating']),
  message: z.string().min(1, 'Message is required').max(5000),
  rating: z.number().int().min(1).max(5).optional(),
  pageContext: z.string().max(500).optional(),
  appVersion: z.string().max(100).optional(),
});

const statusSchema = z.object({
  status: z.enum(['new', 'ingested', 'closed']),
});

/**
 * POST /api/v1/feedback — submit feedback (user JWT, no tier gate)
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = createFeedbackSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const userId = req.user!.userId;
    const feedback = await feedbackService.createFeedback(userId, validation.data);

    res.status(201).json({
      success: true,
      data: { feedback },
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; code?: string; message?: string };
    if (err.statusCode) {
      res.status(err.statusCode).json({
        success: false,
        error: err.code,
        message: err.message,
      });
      return;
    }
    next(error);
  }
});

/**
 * GET /api/v1/feedback — list own feedback
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { status, category, limit, offset } = req.query;

    const result = await feedbackService.listFeedback(userId, {
      status: status as string | undefined,
      category: category as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      success: true,
      data: {
        feedback: result.feedback,
        total: result.total,
      },
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; code?: string; message?: string };
    if (err.statusCode) {
      res.status(err.statusCode).json({
        success: false,
        error: err.code,
        message: err.message,
      });
      return;
    }
    next(error);
  }
});

/**
 * GET /api/v1/feedback/export — CF poller cross-user export
 */
router.get(
  '/export',
  authenticateServiceToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, limit, offset } = req.query;
      const result = await feedbackService.exportFeedback({
        status: (status as string) || 'new',
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });

      res.json({
        success: true,
        data: {
          feedback: result.feedback,
          total: result.total,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/feedback/:id/status — poller ack (new → ingested)
 */
router.patch(
  '/:id/status',
  authenticateServiceToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = statusSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: validation.error.errors.map((e) => e.message).join(', '),
        });
        return;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const feedback = await feedbackService.updateFeedbackStatus(
        id,
        validation.data.status
      );

      res.json({
        success: true,
        data: { feedback },
      });
    } catch (error: unknown) {
      const err = error as { statusCode?: number; code?: string; message?: string };
      if (err.statusCode) {
        res.status(err.statusCode).json({
          success: false,
          error: err.code,
          message: err.message,
        });
        return;
      }
      next(error);
    }
  }
);

export default router;
