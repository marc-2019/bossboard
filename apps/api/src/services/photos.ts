/**
 * Photos Service
 * Universal photo attachment management for SWMS, invoices, expenses, job logs
 */

import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import db from './database.js';
import { Photo, CreatePhotoInput, PhotoEntityType } from '../types/index.js';

const UPLOAD_DIR = path.resolve('./uploads/photos');

// Ensure upload directory exists on startup
async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }
}
ensureUploadDir();

function transformPhoto(row: Record<string, unknown>): Photo {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    entityType: row.entity_type as PhotoEntityType,
    entityId: row.entity_id as string,
    filename: row.filename as string,
    originalFilename: row.original_filename as string | null,
    mimeType: row.mime_type as string,
    fileSize: row.file_size as number | null,
    path: row.path as string,
    caption: row.caption as string | null,
    createdAt: row.created_at as Date,
  };
}

function transformForMobile(photo: Photo): Record<string, unknown> {
  return {
    id: photo.id,
    user_id: photo.userId,
    entity_type: photo.entityType,
    entity_id: photo.entityId,
    filename: photo.filename,
    original_filename: photo.originalFilename,
    mime_type: photo.mimeType,
    file_size: photo.fileSize,
    caption: photo.caption,
    created_at: photo.createdAt,
    // URL path for downloading - actual URL prefix added by route
    url: `/api/v1/photos/${photo.id}/file`,
  };
}

/** Map photo entity types to owner-scoped tables (prevent attaching to foreign rows). */
const ENTITY_TABLE: Record<PhotoEntityType, string> = {
  swms: 'swms_documents',
  invoice: 'invoices',
  expense: 'expenses',
  job_log: 'job_logs',
  certification: 'certifications',
  quote: 'quotes',
};

/**
 * Ensure the target entity exists and belongs to this user (tenancy).
 */
async function assertEntityOwnedByUser(
  userId: string,
  entityType: PhotoEntityType,
  entityId: string,
): Promise<void> {
  const table = ENTITY_TABLE[entityType];
  if (!table) {
    const err = new Error('Invalid entity type') as Error & { statusCode?: number; code?: string };
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  // table name is from a fixed allowlist map, not user input
  const result = await db.query(
    `SELECT id FROM ${table} WHERE id = $1 AND user_id = $2`,
    [entityId, userId],
  );
  if (result.rows.length === 0) {
    const err = new Error('Entity not found') as Error & { statusCode?: number; code?: string };
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
}

/**
 * Create a photo record after file upload
 */
async function createPhoto(
  userId: string,
  input: CreatePhotoInput
): Promise<Record<string, unknown>> {
  await assertEntityOwnedByUser(userId, input.entityType, input.entityId);

  const id = uuidv4();

  const result = await db.query<Record<string, unknown>>(
    `INSERT INTO photos (id, user_id, entity_type, entity_id, filename, original_filename, mime_type, file_size, path, caption)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      id,
      userId,
      input.entityType,
      input.entityId,
      input.filename,
      input.originalFilename || null,
      input.mimeType || 'image/jpeg',
      input.fileSize || null,
      input.path,
      input.caption || null,
    ]
  );

  return transformForMobile(transformPhoto(result.rows[0]));
}

/**
 * List photos for a specific entity
 */
async function listByEntity(
  entityType: PhotoEntityType,
  entityId: string,
  userId: string
): Promise<Record<string, unknown>[]> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM photos
     WHERE entity_type = $1 AND entity_id = $2 AND user_id = $3
     ORDER BY created_at DESC`,
    [entityType, entityId, userId]
  );

  return result.rows.map((row) => transformForMobile(transformPhoto(row)));
}

/**
 * Get a single photo by ID (for file serving)
 */
async function getPhotoById(
  id: string,
  userId: string
): Promise<Photo | null> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT * FROM photos WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  if (result.rows.length === 0) return null;
  return transformPhoto(result.rows[0]);
}

/**
 * Delete a photo and its file from disk
 */
async function deletePhoto(
  id: string,
  userId: string
): Promise<boolean> {
  // Get the photo first to find the file path
  const photo = await getPhotoById(id, userId);
  if (!photo) return false;

  // Delete from database
  const result = await db.query(
    `DELETE FROM photos WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  if (result.rowCount === 0) return false;

  // Delete file from disk (best effort - don't fail if file is already gone)
  try {
    await fs.unlink(photo.path);
  } catch {
    console.warn(`[Photos] Could not delete file: ${photo.path}`);
  }

  return true;
}

/**
 * Get the upload directory path
 */
function getUploadDir(): string {
  return UPLOAD_DIR;
}

export default {
  createPhoto,
  listByEntity,
  getPhotoById,
  deletePhoto,
  getUploadDir,
};
