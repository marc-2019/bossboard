/**
 * Job Logs Routes
 * Time tracking for job sites
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { attachSubscription, requireFeature } from '../middleware/subscription.js';
import jobLogsService, { buildPublicJobCompletionLink } from '../services/job-logs.js';

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createJobLogSchema = z.object({
  description: z.string().min(1, 'Description is required').max(500),
  siteAddress: z.string().max(500).optional(),
  customerId: z.string().uuid().optional(),
  startTime: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

const updateJobLogSchema = z.object({
  description: z.string().min(1).max(500).optional(),
  siteAddress: z.string().max(500).optional(),
  customerId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

const clockOutSchema = z.object({
  notes: z.string().max(2000).optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/job-logs - Create job log (clock in)
 */
router.post('/', authenticate, attachSubscription, requireFeature('jobLogs'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = createJobLogSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const userId = req.user!.userId;
    const jobLog = await jobLogsService.createJobLog(userId, validation.data);

    res.status(201).json({
      success: true,
      data: { jobLog },
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
 * GET /api/v1/job-logs/active - Get current active job log
 */
router.get('/active', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const jobLog = await jobLogsService.getActiveJobLog(userId);

    res.json({
      success: true,
      data: { jobLog },
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
 * GET /api/v1/job-logs/stats - Get job log stats
 */
router.get('/stats', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const stats = await jobLogsService.getJobLogStats(userId);

    res.json({
      success: true,
      data: { stats },
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
 * GET /api/v1/job-logs - List job logs
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const { status, customerId, startDate, endDate, limit, offset } = req.query;

    const result = await jobLogsService.listJobLogs(userId, {
      status: status as string | undefined,
      customerId: customerId as string | undefined,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      success: true,
      data: {
        jobLogs: result.jobLogs,
        total: result.total,
      },
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
 * GET /api/v1/job-logs/:id - Get job log by ID
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const jobLog = await jobLogsService.getJobLog(userId, req.params.id as string);

    res.json({
      success: true,
      data: { jobLog },
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
 * PUT /api/v1/job-logs/:id - Update job log
 */
router.put('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = updateJobLogSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const userId = req.user!.userId;
    const jobLog = await jobLogsService.updateJobLog(userId, req.params.id as string, validation.data);

    res.json({
      success: true,
      data: { jobLog },
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
 * POST /api/v1/job-logs/:id/clock-out - Clock out of a job
 *
 * NOTE (CF): public client completion view added via /api/v1/public/jobs/:id (see public.ts + service).
 * Completion link endpoint to be added in related task (returns shareable URL to the public view).
 */
router.post('/:id/clock-out', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = clockOutSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const userId = req.user!.userId;
    const jobLog = await jobLogsService.clockOut(userId, req.params.id as string, validation.data.notes);

    res.json({
      success: true,
      data: { jobLog },
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
 * POST /api/v1/job-logs/:id/completion-link
 * Returns public client completion view link for a job (completed or not; caller decides).
 * Reuses build fn. Auth required so only owner can distribute the link.
 */
router.post('/:id/completion-link', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.userId;
    // Verify ownership (will throw 404 if not found or not owned)
    await jobLogsService.getJobLog(userId, id);

    const link = buildPublicJobCompletionLink(id);

    res.json({
      success: true,
      data: { link, url: link },
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
 * DELETE /api/v1/job-logs/:id - Delete job log
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    await jobLogsService.deleteJobLog(userId, req.params.id as string);

    res.json({
      success: true,
      message: 'Job log deleted',
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

export default router;
