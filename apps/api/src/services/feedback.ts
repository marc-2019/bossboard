/**
 * Feedback Service
 * Lane A in-app capture (product-feedback-universal-pattern).
 * status: new → ingested (CF poller) → closed.
 */

import db from './database.js';
import {
  FeedbackItem,
  FeedbackCategory,
  FeedbackStatus,
  FeedbackCreateInput,
} from '../types/index.js';
import { createError } from '../middleware/error.js';

/**
 * Create a feedback entry for a user.
 */
export async function createFeedback(
  userId: string,
  input: FeedbackCreateInput
): Promise<FeedbackItem> {
  const { category, message, rating, pageContext, appVersion } = input;

  const result = await db.query(
    `INSERT INTO feedback (user_id, category, rating, message, page_context, app_version)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      userId,
      category,
      rating ?? null,
      message,
      pageContext || null,
      appVersion || null,
    ]
  );

  return mapRowToFeedback(result.rows[0] as Record<string, unknown>);
}

/**
 * List a user's own feedback entries (newest first).
 */
export async function listFeedback(
  userId: string,
  params: {
    status?: string;
    category?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ feedback: FeedbackItem[]; total: number }> {
  const { status, category, limit = 50, offset = 0 } = params;

  let whereClause = 'WHERE user_id = $1';
  const queryParams: (string | number)[] = [userId];
  let paramIndex = 2;

  if (status) {
    whereClause += ` AND status = $${paramIndex}`;
    queryParams.push(status);
    paramIndex++;
  }

  if (category) {
    whereClause += ` AND category = $${paramIndex}`;
    queryParams.push(category);
    paramIndex++;
  }

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM feedback ${whereClause}`,
    queryParams
  );

  const result = await db.query(
    `SELECT * FROM feedback ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...queryParams, limit, offset]
  );

  return {
    feedback: (result.rows as Record<string, unknown>[]).map(mapRowToFeedback),
    total: parseInt(countResult.rows[0].count, 10),
  };
}

/**
 * Cross-user export for CF poller (service token only).
 */
export async function exportFeedback(params: {
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ feedback: FeedbackItem[]; total: number }> {
  const { status = 'new', limit = 100, offset = 0 } = params;
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const safeOffset = Math.max(offset, 0);

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM feedback WHERE status = $1`,
    [status]
  );

  const result = await db.query(
    `SELECT * FROM feedback WHERE status = $1
     ORDER BY created_at ASC
     LIMIT $2 OFFSET $3`,
    [status, safeLimit, safeOffset]
  );

  return {
    feedback: (result.rows as Record<string, unknown>[]).map(mapRowToFeedback),
    total: parseInt(countResult.rows[0].count, 10),
  };
}

/**
 * Update feedback status (poller ack: new → ingested).
 */
export async function updateFeedbackStatus(
  id: string,
  status: FeedbackStatus
): Promise<FeedbackItem> {
  if (!['new', 'ingested', 'closed'].includes(status)) {
    throw createError('Invalid status', 400, 'VALIDATION_ERROR');
  }

  const result = await db.query(
    `UPDATE feedback SET status = $2 WHERE id = $1 RETURNING *`,
    [id, status]
  );

  if (result.rows.length === 0) {
    throw createError('Feedback not found', 404, 'NOT_FOUND');
  }

  return mapRowToFeedback(result.rows[0] as Record<string, unknown>);
}

function mapRowToFeedback(row: Record<string, unknown>): FeedbackItem {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    category: row.category as FeedbackCategory,
    rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
    message: row.message as string,
    pageContext: (row.page_context as string | null) ?? null,
    appVersion: (row.app_version as string | null) ?? null,
    status: row.status as FeedbackStatus,
    createdAt: (row.created_at as Date).toISOString?.() || (row.created_at as string),
  };
}

export default {
  createFeedback,
  listFeedback,
  exportFeedback,
  updateFeedbackStatus,
};
