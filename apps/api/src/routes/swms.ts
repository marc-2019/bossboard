/**
 * SWMS Routes
 * /api/v1/swms/*
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import swmsService from '../services/swms.js';
import auditLog from '../services/audit-log.js';
import { authenticate } from '../middleware/auth.js';
import { attachSubscription, checkLimit } from '../middleware/subscription.js';

// App error type for error handling
interface AppError extends Error {
  statusCode: number;
  code: string;
}

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const generateSchema = z.object({
  tradeType: z.enum(['electrician', 'plumber', 'builder', 'landscaper', 'painter', 'other']),
  jobDescription: z.string().min(10, 'Job description must be at least 10 characters'),
  siteAddress: z.string().optional(),
  clientName: z.string().optional(),
  expectedDuration: z.string().optional(),
  useAI: z.boolean().optional().default(true),
});

const updateSchema = z.object({
  title: z.string().optional(),
  status: z.enum(['draft', 'signed', 'archived']).optional(),
  jobDescription: z.string().optional(),
  siteAddress: z.string().optional(),
  clientName: z.string().optional(),
  expectedDuration: z.string().optional(),
  hazards: z.array(z.any()).optional(),
  controls: z.array(z.any()).optional(),
  ppeRequired: z.array(z.string()).optional(),
  emergencyPlan: z.string().optional(),
  isolationProcedure: z.string().optional(),
});

const signSchema = z.object({
  signature: z.string().min(1, 'Signature is required'),
  role: z.enum(['worker', 'supervisor']),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/v1/swms/templates
 * List available SWMS templates
 */
router.get('/templates', (_req: Request, res: Response) => {
  const templates = swmsService.getTemplates();
  res.json({
    success: true,
    data: { templates },
  });
});

/**
 * GET /api/v1/swms/templates/:tradeType
 * Get specific SWMS template
 */
router.get('/templates/:tradeType', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tradeType } = req.params;
    const template = swmsService.getTemplate(tradeType as any);
    res.json({
      success: true,
      data: { template },
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
 * POST /api/v1/swms/generate
 * Generate a new SWMS document
 */
router.post(
  '/generate',
  authenticate,
  attachSubscription,
  checkLimit('swms'),
  // Add AI call limit check if useAI is enabled (default is true)
  async (req, res, next) => {
    if (req.body.useAI !== false) {
      return checkLimit('aiCall')(req, res, next);
    }
    next();
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = generateSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
        details: validation.error.errors,
      });
      return;
    }

    const result = await swmsService.generateSWMS(req.user!.userId, validation.data);

    // Audit: log SWMS creation. Best-effort; failure must not block the user.
    void auditLog.record({
      entityType: 'swms',
      entityId: result.swmsId,
      action: 'create',
      actorUserId: req.user!.userId,
      metadata: {
        tradeType: validation.data.tradeType,
        title: result.document.title,
        useAI: validation.data.useAI !== false,
      },
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'SWMS document generated successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/swms
 * List user's SWMS documents
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, limit, offset } = req.query;

    const result = await swmsService.listSWMS(req.user!.userId, {
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/swms/:id
 * Get specific SWMS document
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const document = await swmsService.getSWMSById(id as string, req.user!.userId);

    if (!document) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'SWMS document not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { document },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/swms/:id
 * Update SWMS document
 */
router.put('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = updateSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const { id } = req.params;

    // Snapshot BEFORE state for audit diff. If the doc doesn't exist or the
    // snapshot itself fails, fall through — updateSWMS will 404 below.
    const before = await swmsService
      .getSWMSById(id as string, req.user!.userId)
      .catch(() => null);

    const document = await swmsService.updateSWMS(
      id as string,
      req.user!.userId,
      validation.data
    );

    if (!document) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'SWMS document not found',
      });
      return;
    }

    // Audit: log SWMS update with field-level diff. Best-effort.
    if (before) {
      const changes = auditLog.diffEntity(
        before as unknown as Record<string, unknown>,
        document as unknown as Record<string, unknown>,
      );
      if (Object.keys(changes).length > 0) {
        void auditLog.record({
          entityType: 'swms',
          entityId: id as string,
          action: 'update',
          actorUserId: req.user!.userId,
          changes,
        });
      }
    }

    res.json({
      success: true,
      data: { document },
      message: 'SWMS document updated successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/swms/:id
 * Delete SWMS document
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Snapshot title/trade BEFORE delete so the audit row carries enough
    // context to be meaningful after the source row is gone.
    const before = await swmsService
      .getSWMSById(id as string, req.user!.userId)
      .catch(() => null);

    const deleted = await swmsService.deleteSWMS(id as string, req.user!.userId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'SWMS document not found',
      });
      return;
    }

    // Audit: log SWMS deletion. Best-effort.
    void auditLog.record({
      entityType: 'swms',
      entityId: id as string,
      action: 'delete',
      actorUserId: req.user!.userId,
      metadata: before
        ? {
            title: (before as unknown as Record<string, unknown>).title,
            tradeType: (before as unknown as Record<string, unknown>).trade_type
              ?? (before as unknown as Record<string, unknown>).templateType,
          }
        : null,
    });

    res.json({
      success: true,
      message: 'SWMS document deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/swms/:id/sign
 * Sign SWMS document
 */
router.post('/:id/sign', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = signSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const { id } = req.params;
    const document = await swmsService.signSWMS(
      id as string,
      req.user!.userId,
      validation.data.signature,
      validation.data.role
    );

    if (!document) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'SWMS document not found',
      });
      return;
    }

    // Audit: log SWMS signature event. Best-effort. We record the role and
    // timestamp but NEVER the raw signature blob — that lives only on the
    // document row itself.
    void auditLog.record({
      entityType: 'swms',
      entityId: id as string,
      action: 'sign',
      actorUserId: req.user!.userId,
      metadata: {
        role: validation.data.role,
      },
    });

    res.json({
      success: true,
      data: { document },
      message: 'SWMS document signed successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
