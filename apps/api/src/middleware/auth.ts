/**
 * Authentication Middleware
 * JWT verification and user context
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { JwtPayload, TeamRole } from '../types/index.js';

/**
 * Verify JWT token and attach user to request
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'No valid authorization header provided',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      // Explicit algorithm allowlist — reject alg=none / unexpected algs
      const decoded = jwt.verify(token, config.jwt.secret, {
        algorithms: ['HS256'],
      }) as JwtPayload;
      req.user = decoded;
      next();
    } catch (jwtError) {
      if (jwtError instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          success: false,
          error: 'Token expired',
          message: 'Access token has expired. Please refresh your token.',
        });
        return;
      }

      res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'The provided token is invalid',
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      message: 'An error occurred during authentication',
    });
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
    }) as JwtPayload;
    req.user = decoded;
  } catch {
    // Token invalid but we don't fail - just no user attached
  }

  next();
}

/**
 * Require user to be a member of a team
 * Must be used after authenticate middleware
 */
export function requireTeam(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.teamId) {
    res.status(403).json({
      success: false,
      error: 'TEAM_REQUIRED',
      message: 'You must belong to a team to access this resource',
    });
    return;
  }
  next();
}

/**
 * Require specific team role(s)
 * Must be used after authenticate middleware
 * Usage: requireTeamRole('owner', 'admin')
 */
export function requireTeamRole(...roles: TeamRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user?.teamId || !req.user?.teamRole) {
      res.status(403).json({
        success: false,
        error: 'TEAM_REQUIRED',
        message: 'You must belong to a team to access this resource',
      });
      return;
    }

    if (!roles.includes(req.user.teamRole)) {
      res.status(403).json({
        success: false,
        error: 'INSUFFICIENT_ROLE',
        message: `This action requires one of the following roles: ${roles.join(', ')}`,
      });
      return;
    }

    next();
  };
}

export default { authenticate, optionalAuth, requireTeam, requireTeamRole };
