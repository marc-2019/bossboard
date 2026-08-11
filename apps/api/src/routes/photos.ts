/**
 * Photo Routes
 * /api/v1/photos/*
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import photosService from '../services/photos.js';
import { authenticate } from '../middleware/auth.js';
import { attachSubscription, requireFeature } from '../middleware/subscription.js';
import { PhotoEntityType } from '../types/index.js';
import { isPathInside } from '../utils/path-safe.js';

const router = Router();

// =============================================================================
// MULTER CONFIGURATION
// =============================================================================

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, photosService.getUploadDir());
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP, HEIC) are allowed'));
    }
  },
});

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const entityTypeSchema = z.enum(['swms', 'invoice', 'expense', 'job_log', 'certification', 'quote']);

const uploadSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.string().uuid('Entity ID must be a valid UUID'),
  caption: z.string().optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/photos
 * Upload a photo and attach to an entity
 */
router.post('/', authenticate, attachSubscription, requireFeature('photos'), upload.single('photo'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'No photo file provided',
      });
      return;
    }

    const validation = uploadSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
        details: validation.error.errors,
      });
      return;
    }

    const photo = await photosService.createPhoto(req.user!.userId, {
      entityType: validation.data.entityType,
      entityId: validation.data.entityId,
      filename: req.file.filename,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      path: req.file.path,
      caption: validation.data.caption,
    });

    res.status(201).json({
      success: true,
      data: { photo },
      message: 'Photo uploaded successfully',
    });
  } catch (error) {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          success: false,
          error: 'FILE_TOO_LARGE',
          message: 'Photo must be under 10MB',
        });
        return;
      }
    }
    // Handle file filter rejection (invalid file type)
    if (error instanceof Error && error.message.includes('Only image files')) {
      res.status(400).json({
        success: false,
        error: 'INVALID_FILE_TYPE',
        message: error.message,
      });
      return;
    }
    next(error);
  }
});

/**
 * GET /api/v1/photos/:entityType/:entityId
 * List photos for an entity
 */
router.get('/:entityType/:entityId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entityType = req.params.entityType as string;
    const entityId = req.params.entityId as string;

    const typeValidation = entityTypeSchema.safeParse(entityType);
    if (!typeValidation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Invalid entity type. Must be: swms, invoice, expense, or job_log',
      });
      return;
    }

    const photos = await photosService.listByEntity(
      entityType as PhotoEntityType,
      entityId,
      req.user!.userId
    );

    res.json({
      success: true,
      data: { photos },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/photos/:id/file
 * Serve the actual photo file
 */
router.get('/:id/file', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const photo = await photosService.getPhotoById(id, req.user!.userId);

    if (!photo) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Photo not found',
      });
      return;
    }

    // Path traversal guard: ensure resolved path is within the upload directory
    // (strict containment — not naive startsWith, which allows /uploads/photos_evil)
    const UPLOAD_DIR = photosService.getUploadDir();
    const resolvedPath = path.resolve(photo.path);
    if (!isPathInside(UPLOAD_DIR, resolvedPath)) {
      res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Access denied',
      });
      return;
    }
    res.sendFile(resolvedPath);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/photos/:id
 * Delete a photo
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const deleted = await photosService.deletePhoto(id, req.user!.userId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Photo not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Photo deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
