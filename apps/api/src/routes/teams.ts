/**
 * Teams Routes
 * /api/v1/teams/*
 *
 * IMPORTANT: Static routes (/my-team, /invites/*) MUST come before
 * parameterised routes (/:teamId) to avoid incorrect matching.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { attachSubscription, checkLimit } from '../middleware/subscription.js';
import teamsService from '../services/teams.js';

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(255),
});

const updateTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(255),
});

const inviteMemberSchema = z.object({
  email: z.string().email('Valid email is required'),
  role: z.enum(['admin', 'worker']).optional(),
});

const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'worker']),
});

// =============================================================================
// STATIC ROUTES (must be before /:teamId)
// =============================================================================

/**
 * POST /api/v1/teams
 * Create a new team (user becomes owner)
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = createTeamSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const userId = req.user!.userId;
    const team = await teamsService.createTeam(userId, validation.data);

    res.status(201).json({
      success: true,
      data: { team },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/teams/my-team
 * Get current user's team with members
 */
router.get('/my-team', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await teamsService.getMyTeam(userId);

    if (!result) {
      res.json({
        success: true,
        data: { team: null, role: null, members: [] },
      });
      return;
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// INVITES - USER-FACING (invited user accepts/declines)
// These MUST be before /:teamId routes
// =============================================================================

/**
 * GET /api/v1/teams/invites/pending
 * Get pending invites for the current user
 */
router.get('/invites/pending', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const invites = await teamsService.getMyPendingInvites(userId);

    res.json({
      success: true,
      data: { invites },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/teams/invites/:inviteCode/accept
 * Accept a team invite
 */
router.post('/invites/:inviteCode/accept', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const result = await teamsService.acceptInvite(userId, req.params.inviteCode as string);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/teams/invites/:inviteCode/decline
 * Decline a team invite
 */
router.post('/invites/:inviteCode/decline', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    await teamsService.declineInvite(userId, req.params.inviteCode as string);

    res.json({
      success: true,
      message: 'Invite declined',
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// PARAMETERISED ROUTES (/:teamId)
// =============================================================================

/**
 * GET /api/v1/teams/:teamId
 * Get team details
 */
router.get('/:teamId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const team = await teamsService.getTeam(userId, req.params.teamId as string);

    res.json({
      success: true,
      data: { team },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/teams/:teamId
 * Update team name (owner/admin only)
 */
router.put('/:teamId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = updateTeamSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const userId = req.user!.userId;
    const team = await teamsService.updateTeam(
      userId,
      req.params.teamId as string,
      validation.data.name
    );

    res.json({
      success: true,
      data: { team },
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// TEAM MEMBERS
// =============================================================================

/**
 * GET /api/v1/teams/:teamId/members
 * List team members
 */
router.get('/:teamId/members', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const members = await teamsService.listMembers(userId, req.params.teamId as string);

    res.json({
      success: true,
      data: { members },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/teams/:teamId/members/:memberId
 * Remove a member from the team (owner/admin only)
 */
router.delete('/:teamId/members/:memberId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    await teamsService.removeMember(
      userId,
      req.params.teamId as string,
      req.params.memberId as string
    );

    res.json({
      success: true,
      message: 'Member removed successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/teams/:teamId/members/:memberId/role
 * Update a member's role (owner only)
 */
router.put('/:teamId/members/:memberId/role', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = updateMemberRoleSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const userId = req.user!.userId;
    const member = await teamsService.updateMemberRole(
      userId,
      req.params.teamId as string,
      req.params.memberId as string,
      validation.data.role
    );

    res.json({
      success: true,
      data: { member },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/teams/:teamId/leave
 * Leave a team (non-owners only)
 */
router.post('/:teamId/leave', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    await teamsService.leaveTeam(userId, req.params.teamId as string);

    res.json({
      success: true,
      message: 'Left team successfully',
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// INVITES - TEAM MANAGEMENT (owner/admin sends invites)
// =============================================================================

/**
 * POST /api/v1/teams/:teamId/invites
 * Invite a member by email (owner/admin only)
 */
router.post('/:teamId/invites', authenticate, attachSubscription, checkLimit('teamMember'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = inviteMemberSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: validation.error.errors.map((e) => e.message).join(', '),
      });
      return;
    }

    const userId = req.user!.userId;
    const invite = await teamsService.inviteMember(
      userId,
      req.params.teamId as string,
      validation.data
    );

    res.status(201).json({
      success: true,
      data: { invite },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/teams/:teamId/invites
 * List pending invites for a team (owner/admin only)
 */
router.get('/:teamId/invites', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const invites = await teamsService.listInvites(userId, req.params.teamId as string);

    res.json({
      success: true,
      data: { invites },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/teams/:teamId/invites/:inviteId
 * Cancel a pending invite (owner/admin only)
 */
router.delete('/:teamId/invites/:inviteId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    await teamsService.cancelInvite(
      userId,
      req.params.teamId as string,
      req.params.inviteId as string
    );

    res.json({
      success: true,
      message: 'Invite cancelled successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
