/**
 * Block invitee actions until the caller's email is verified.
 * Must run after authenticate. Registration returns a live JWT while
 * is_verified is still false, so the token cannot be trusted for this.
 */

import { Request, Response, NextFunction } from 'express';
import db from '../services/database.js';

export async function requireVerifiedEmail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'No authenticated user',
      });
      return;
    }

    const result = await db.query<{ is_verified: boolean }>(
      'SELECT is_verified FROM users WHERE id = $1 AND is_active = true',
      [userId]
    );

    if (result.rows[0]?.is_verified !== true) {
      res.status(403).json({
        success: false,
        error: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email before viewing or accepting team invites',
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}
