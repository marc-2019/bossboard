/**
 * Bank Transactions Routes
 * /api/v1/bank-transactions/*
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bankTransactionsService from '../services/bank-transactions.js';
import { parseSpreadsheet } from '../services/mapped-spreadsheet.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const uploadSchema = z.object({
  csvContent: z.string().min(1, 'Spreadsheet content is required'),
  filename: z.string().min(1, 'Filename is required'),
  columnMap: z
    .object({
      date: z.string().min(1),
      amount: z.string().min(1),
      description: z.string().min(1),
    })
    .optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/bank-transactions/upload
 * Upload a mapped spreadsheet (operator maps Date, Amount, Description).
 */

/**
 * POST /api/v1/bank-transactions/preview
 * Return spreadsheet headers so the operator can map Date, Amount, Description.
 */
router.post('/preview', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = uploadSchema.pick({ csvContent: true, filename: true }).safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
      });
      return;
    }
    let content: string | Buffer = validation.data.csvContent;
    try {
      const buf = Buffer.from(validation.data.csvContent, 'base64');
      if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) {
        content = buf;
      }
    } catch {
      // keep text
    }
    const table = parseSpreadsheet(content, validation.data.filename);
    res.json({
      success: true,
      data: { headers: table.headers, rowCount: table.rows.length },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/upload', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = uploadSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors[0].message,
      });
      return;
    }

    let csvContent = validation.data.csvContent;
    try {
      const decoded = Buffer.from(csvContent, 'base64').toString('utf-8');
      if (decoded.includes(',') && decoded.includes('\n')) {
        csvContent = decoded;
      }
    } catch {
      // plain text
    }

    const result = validation.data.columnMap
      ? await bankTransactionsService.uploadCSV(
          req.user!.userId,
          csvContent,
          validation.data.filename,
          validation.data.columnMap
        )
      : await bankTransactionsService.uploadCSV(
          req.user!.userId,
          csvContent,
          validation.data.filename
        );

    res.status(201).json({
      success: true,
      data: result,
      message: `Imported ${result.imported} transactions (${result.duplicates} duplicates skipped)`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/bank-transactions
 * List bank transactions with filters
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isReconciled, startDate, endDate, batchId, limit, offset } = req.query;

    const result = await bankTransactionsService.listTransactions(
      req.user!.userId,
      {
        isReconciled: isReconciled !== undefined ? isReconciled === 'true' : undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
        batchId: batchId as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      }
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/bank-transactions/auto-match
 * Run simple matching algorithm against outstanding invoices
 */
router.post('/auto-match', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await bankTransactionsService.autoMatch(req.user!.userId);

    res.json({
      success: true,
      data: result,
      message: `Found ${result.matched} potential matches`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/bank-transactions/:id/confirm
 * Confirm a match: mark transaction reconciled and invoice as paid
 */
router.post('/:id/confirm', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const transaction = await bankTransactionsService.confirmMatch(
      id,
      req.user!.userId
    );

    if (!transaction) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Transaction not found or no match to confirm',
      });
      return;
    }

    res.json({
      success: true,
      data: { transaction },
      message: 'Match confirmed and invoice marked as paid',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/bank-transactions/:id/unmatch
 * Remove match from transaction
 */
router.post('/:id/unmatch', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const transaction = await bankTransactionsService.unmatchTransaction(
      id,
      req.user!.userId
    );

    if (!transaction) {
      res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Transaction not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { transaction },
      message: 'Match removed',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/bank-transactions/summary
 * Get transaction summary stats
 */
router.get('/summary', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await bankTransactionsService.getTransactionSummary(
      req.user!.userId
    );

    res.json({
      success: true,
      data: { summary },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
