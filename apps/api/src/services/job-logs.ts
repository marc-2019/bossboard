/**
 * Job Logs Service
 * Simple time tracking for job sites
 */

import db from './database.js';
import {
  JobLog,
  JobLogStatus,
  JobLogCreateInput,
  JobLogUpdateInput,
} from '../types/index.js';
import { createError } from '../middleware/error.js';
import { assertCustomerOwnedByUser } from './customers.js';

/**
 * Create a new job log (clock in)
 */
export async function createJobLog(userId: string, input: JobLogCreateInput): Promise<JobLog> {
  const {
    description,
    siteAddress,
    customerId,
    startTime,
    notes,
  } = input;

  if (customerId) {
    await assertCustomerOwnedByUser(userId, customerId);
  }

  const result = await db.query<{
    id: string;
    user_id: string;
    description: string;
    site_address: string | null;
    customer_id: string | null;
    start_time: string;
    end_time: string | null;
    status: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `INSERT INTO job_logs (user_id, description, site_address, customer_id, start_time, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      userId,
      description,
      siteAddress || null,
      customerId || null,
      startTime || new Date().toISOString(),
      notes || null,
    ]
  );

  return mapRowToJobLog(result.rows[0]);
}

/**
 * Get a job log by ID
 */
export async function getJobLog(userId: string, jobLogId: string): Promise<JobLog> {
  const result = await db.query(
    'SELECT * FROM job_logs WHERE id = $1 AND user_id = $2',
    [jobLogId, userId]
  );

  if (result.rows.length === 0) {
    throw createError('Job log not found', 404, 'JOB_LOG_NOT_FOUND');
  }

  return mapRowToJobLog(result.rows[0] as Record<string, unknown>);
}

/**
 * List job logs with optional filtering
 */
export async function listJobLogs(
  userId: string,
  params: {
    status?: string;
    customerId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ jobLogs: JobLog[]; total: number }> {
  const { status, customerId, startDate, endDate, limit = 50, offset = 0 } = params;

  let whereClause = 'WHERE user_id = $1';
  const queryParams: (string | number)[] = [userId];
  let paramIndex = 2;

  if (status) {
    whereClause += ` AND status = $${paramIndex}`;
    queryParams.push(status);
    paramIndex++;
  }

  if (customerId) {
    whereClause += ` AND customer_id = $${paramIndex}`;
    queryParams.push(customerId);
    paramIndex++;
  }

  if (startDate) {
    whereClause += ` AND start_time >= $${paramIndex}`;
    queryParams.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    whereClause += ` AND start_time <= $${paramIndex}`;
    queryParams.push(endDate);
    paramIndex++;
  }

  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM job_logs ${whereClause}`,
    queryParams
  );

  // Get paginated results
  const result = await db.query(
    `SELECT * FROM job_logs ${whereClause} ORDER BY start_time DESC, created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...queryParams, limit, offset]
  );

  return {
    jobLogs: (result.rows as Record<string, unknown>[]).map(mapRowToJobLog),
    total: parseInt(countResult.rows[0].count, 10),
  };
}

/**
 * Get the currently active job log for a user (if any)
 */
export async function getActiveJobLog(userId: string): Promise<JobLog | null> {
  const result = await db.query(
    `SELECT * FROM job_logs WHERE user_id = $1 AND status = 'active' ORDER BY start_time DESC LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToJobLog(result.rows[0] as Record<string, unknown>);
}

/**
 * Update a job log
 */
export async function updateJobLog(
  userId: string,
  jobLogId: string,
  input: JobLogUpdateInput
): Promise<JobLog> {
  // Verify ownership
  await getJobLog(userId, jobLogId);

  if (typeof input.customerId === 'string' && input.customerId) {
    await assertCustomerOwnedByUser(userId, input.customerId);
  }

  const updates: string[] = [];
  const values: (string | number | boolean | null)[] = [];
  let paramIndex = 1;

  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex}`);
    values.push(input.description);
    paramIndex++;
  }

  if (input.siteAddress !== undefined) {
    updates.push(`site_address = $${paramIndex}`);
    values.push(input.siteAddress || null);
    paramIndex++;
  }

  if (input.customerId !== undefined) {
    updates.push(`customer_id = $${paramIndex}`);
    values.push(input.customerId || null);
    paramIndex++;
  }

  if (input.notes !== undefined) {
    updates.push(`notes = $${paramIndex}`);
    values.push(input.notes || null);
    paramIndex++;
  }

  if (updates.length === 0) {
    return getJobLog(userId, jobLogId);
  }

  values.push(jobLogId);
  values.push(userId);

  const result = await db.query(
    `UPDATE job_logs SET ${updates.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING *`,
    values
  );

  return mapRowToJobLog(result.rows[0] as Record<string, unknown>);
}

/**
 * Clock out - end an active job log
 */
export async function clockOut(userId: string, jobLogId: string, notes?: string): Promise<JobLog> {
  const existing = await getJobLog(userId, jobLogId);

  if (existing.status !== 'active') {
    throw createError('Job log is not active', 400, 'JOB_LOG_NOT_ACTIVE');
  }

  const updates = ['end_time = NOW()', "status = 'completed'"];
  const values: (string | null)[] = [];
  let paramIndex = 1;

  if (notes !== undefined) {
    updates.push(`notes = $${paramIndex}`);
    values.push(notes || null);
    paramIndex++;
  }

  values.push(jobLogId);
  values.push(userId);

  const result = await db.query(
    `UPDATE job_logs SET ${updates.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING *`,
    values
  );

  return mapRowToJobLog(result.rows[0] as Record<string, unknown>);
}

/**
 * Delete a job log
 */
export async function deleteJobLog(userId: string, jobLogId: string): Promise<void> {
  const result = await db.query(
    'DELETE FROM job_logs WHERE id = $1 AND user_id = $2',
    [jobLogId, userId]
  );

  if (result.rowCount === 0) {
    throw createError('Job log not found', 404, 'JOB_LOG_NOT_FOUND');
  }
}

/**
 * Get job log stats for a user
 */
export async function getJobLogStats(userId: string): Promise<{
  totalLogs: number;
  thisWeek: number;
  activeLog: boolean;
  totalHoursThisWeek: number;
}> {
  const result = await db.query<{
    total: string;
    this_week: string;
    active_count: string;
    hours_this_week: string;
  }>(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE start_time >= date_trunc('week', CURRENT_DATE)) as this_week,
      COUNT(*) FILTER (WHERE status = 'active') as active_count,
      COALESCE(
        EXTRACT(EPOCH FROM SUM(
          CASE
            WHEN status = 'completed' AND start_time >= date_trunc('week', CURRENT_DATE)
            THEN end_time - start_time
            WHEN status = 'active' AND start_time >= date_trunc('week', CURRENT_DATE)
            THEN NOW() - start_time
            ELSE INTERVAL '0'
          END
        )) / 3600,
        0
      ) as hours_this_week
     FROM job_logs WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  return {
    totalLogs: parseInt(row.total, 10),
    thisWeek: parseInt(row.this_week, 10),
    activeLog: parseInt(row.active_count, 10) > 0,
    totalHoursThisWeek: Math.round(parseFloat(row.hours_this_week) * 10) / 10,
  };
}

/**
 * Map database row to JobLog interface
 */
function mapRowToJobLog(row: Record<string, unknown>): JobLog {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    description: row.description as string,
    siteAddress: row.site_address as string | null,
    customerId: row.customer_id as string | null,
    startTime: (row.start_time as Date).toISOString?.() || (row.start_time as string),
    endTime: row.end_time ? ((row.end_time as Date).toISOString?.() || (row.end_time as string)) : null,
    status: row.status as JobLogStatus,
    notes: row.notes as string | null,
    createdAt: (row.created_at as Date).toISOString?.() || (row.created_at as string),
    updatedAt: (row.updated_at as Date).toISOString?.() || (row.updated_at as string),
  };
}

export default {
  createJobLog,
  getJobLog,
  listJobLogs,
  getActiveJobLog,
  updateJobLog,
  clockOut,
  deleteJobLog,
  getJobLogStats,
};
