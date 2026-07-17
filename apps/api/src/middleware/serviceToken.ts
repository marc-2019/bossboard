/**
 * Service-token auth for CF pollers (feedback export, etc.).
 * Accepts Authorization: Bearer <token> or X-Service-Token: <token>
 * against FEEDBACK_SERVICE_TOKEN (or generic SERVICE_TOKEN) env.
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

export function authenticateServiceToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const expected = config.feedbackServiceToken;
  if (!expected) {
    res.status(503).json({
      success: false,
      error: 'SERVICE_TOKEN_NOT_CONFIGURED',
      message: 'Feedback service token is not configured on this server',
    });
    return;
  }

  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const xToken = (req.headers['x-service-token'] as string | undefined)?.trim() || '';
  const provided = bearer || xToken;

  if (!provided || provided !== expected) {
    res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Invalid or missing service token',
    });
    return;
  }

  next();
}
