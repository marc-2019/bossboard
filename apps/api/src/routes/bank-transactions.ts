/**
 * Bank Transactions Routes
 * /api/v1/bank-transactions/*
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bankTransactionsService from '../services/bank-transactions.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const uploadSchema = z.object({
  csvContent: z.string().min(1, 'CSV content is required'),
  filename: z.string().min(1, 'Filename is required'),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/bank-transactions/upload
 * Upload bank CSV (Wise / ANZ / ASB / BNZ / generic; base64 or plain text in JSON body)
 */
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

    // Decode base64 if needed
    let csvContent = validation.data.csvContent;
    try {
      // Try base64 decode
      const decoded = Buffer.from(csvContent, 'base64').toString('utf-8');
      // If it looks like CSV (has commas and newlines), use decoded version
      if (decoded.includes(',') && decoded.includes('\n')) {
        csvContent = decoded;
      }
    } catch {
      // Not base64, use as-is (plain text CSV)
    }

    const result = await bankTransactionsService.uploadCSV(
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
