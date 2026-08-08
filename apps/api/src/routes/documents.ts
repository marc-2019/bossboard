/**
 * Business documents API
 * /api/v1/documents/*
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import documentsService, { DOCUMENT_DISCLAIMER } from '../services/documents.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = documentsService.getDocumentsUploadDir();
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, Word, or image files are allowed'));
  },
});

const scopeSchema = z.enum(['company', 'customer', 'invoice']);
const kindSchema = z.enum(['terms', 'contract', 'other']);

/**
 * POST /api/v1/documents
 * multipart: file + scope, title, docKind?, customerId?, invoiceId?, includeOnInvoices?
 */
router.post(
  '/',
  authenticate,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'No file provided',
        });
        return;
      }

      const scope = scopeSchema.parse(req.body.scope);
      const title = String(req.body.title || req.file.originalname || 'Document').trim();
      const docKind = req.body.docKind ? kindSchema.parse(req.body.docKind) : 'terms';
      const customerId = req.body.customerId || undefined;
      const invoiceId = req.body.invoiceId || undefined;
      const includeOnInvoices =
        req.body.includeOnInvoices === undefined
          ? true
          : req.body.includeOnInvoices === 'true' || req.body.includeOnInvoices === true;

      if (scope === 'customer' && !customerId) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'customerId required for customer documents',
        });
        return;
      }
      if (scope === 'invoice' && !invoiceId) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'invoiceId required for invoice documents',
        });
        return;
      }

      const doc = await documentsService.createDocument(req.user!.userId, {
        scope,
        customerId,
        invoiceId,
        title,
        docKind,
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        storagePath: req.file.path,
        includeOnInvoices,
      });

      res.status(201).json({
        success: true,
        data: { document: doc, disclaimer: DOCUMENT_DISCLAIMER },
        message: 'Document uploaded. You remain responsible for its legal content.',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/v1/documents?scope=&customerId=&invoiceId=
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scope = req.query.scope
      ? scopeSchema.parse(String(req.query.scope))
      : undefined;
    const docs = await documentsService.listDocuments(req.user!.userId, {
      scope,
      customerId: req.query.customerId as string | undefined,
      invoiceId: req.query.invoiceId as string | undefined,
    });
    res.json({
      success: true,
      data: { documents: docs, disclaimer: DOCUMENT_DISCLAIMER },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/documents/for-invoice/:invoiceId?customerId=
 */
router.get(
  '/for-invoice/:invoiceId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const docs = await documentsService.listDocumentsForInvoice(req.user!.userId, {
        invoiceId: req.params.invoiceId as string,
        customerId: (req.query.customerId as string) || null,
      });
      res.json({
        success: true,
        data: { documents: docs, disclaimer: DOCUMENT_DISCLAIMER },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/v1/documents/:id
 */
router.patch('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z
      .object({
        title: z.string().min(1).optional(),
        includeOnInvoices: z.boolean().optional(),
        docKind: kindSchema.optional(),
      })
      .parse(req.body);
    const doc = await documentsService.updateDocument(req.params.id as string, req.user!.userId, body);
    if (!doc) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Document not found' });
      return;
    }
    res.json({ success: true, data: { document: doc, disclaimer: DOCUMENT_DISCLAIMER } });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/documents/:id
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ok = await documentsService.deleteDocument(req.params.id as string, req.user!.userId);
    if (!ok) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Document not found' });
      return;
    }
    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/documents/:id/file
 */
router.get('/:id/file', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await documentsService.getDocument(req.params.id as string, req.user!.userId);
    if (!doc) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Document not found' });
      return;
    }
    const resolved = path.resolve(doc.storagePath);
    const root = path.resolve(documentsService.getDocumentsUploadDir());
    if (!resolved.startsWith(root)) {
      res.status(400).json({ success: false, error: 'INVALID_PATH', message: 'Invalid file path' });
      return;
    }
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${(doc.originalFilename || doc.filename).replace(/"/g, '')}"`,
    );
    res.sendFile(resolved);
  } catch (error) {
    next(error);
  }
});

export default router;
