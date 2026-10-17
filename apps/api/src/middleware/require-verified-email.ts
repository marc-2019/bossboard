import type { Request, Response, NextFunction } from 'express';
import db from '../services/database.js';

/** Read current verification state; use after authenticate. */
export async function requireVerifiedEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await db.query<{ is_verified: boolean }>(
      'SELECT is_verified FROM users WHERE id = $1', [req.user!.userId],
    );
    if (result.rows[0]?.is_verified !== true) {
      res.status(403).json({ success: false, error: 'EMAIL_NOT_VERIFIED', message: 'Verify your email first.' });
      return;
    }
    next();
  } catch (error) { next(error); }
}
