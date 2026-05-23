/**
 * Photos demo helpers — F-PHOTO-01, F-PHOTO-02
 *
 * Multipart upload helper for Photo demo specs.
 * Provides:
 *   - tinyPngBuffer()  : 1x1 valid PNG as Buffer (no binary fixture on disk)
 *   - largePngBuffer() : >10MB pseudo-PNG buffer to exercise size-limit branch
 *   - sampleCaptions   : realistic NZ tradie photo captions
 *   - uploadPhoto()    : POST /api/v1/photos multipart helper for Playwright APIRequestContext
 *
 * Mobile-primary module — these helpers are used by both api.spec.ts and the
 * minimal browser file-input demo in photos.spec.ts.
 */
import type { APIRequestContext } from '@playwright/test';

export const API_BASE_URL =
  process.env.API_BASE_URL || 'http://localhost:29000';

/**
 * A valid 1x1 transparent PNG (67 bytes), base64-decoded at runtime.
 * Avoids checking a binary fixture into git.
 */
export function tinyPngBuffer(): Buffer {
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  return Buffer.from(base64, 'base64');
}

/**
 * A buffer larger than the 10MB multer limit (used to test 400 FILE_TOO_LARGE).
 * Returns ~11MB of zeros prepended with a valid PNG header — multer rejects
 * based on stream size before mime-sniffing, so any byte content is fine.
 */
export function largePngBuffer(): Buffer {
  // 11MB
  return Buffer.alloc(11 * 1024 * 1024, 0);
}

/**
 * Tiny non-image buffer for invalid-mime-type negative case.
 */
export function tinyTextBuffer(): Buffer {
  return Buffer.from('not a real image', 'utf-8');
}

/**
 * Realistic NZ tradie photo captions — keep demos visually credible.
 */
export const sampleCaptions = {
  expenseReceipt:
    'Receipt for materials at Bunnings $237.40 — Smith Residence job',
  beforeShot: 'Before — bathroom tile install at 14 Kotare St, Hamilton',
  afterShot: 'After — bathroom tile install at 14 Kotare St, Hamilton',
  swmsSite: 'SWMS site condition photos: trench depth 1.8m, shoring in place',
  certScan: 'EWRB practising licence — back side with expiry stamp',
} as const;

/**
 * Stand-in test entity IDs (UUIDs). Real demos override these by creating
 * the entity first; these defaults let the helper compile and let
 * negative-path tests (entity-mismatch, auth) run without a fixture.
 */
export const FIXTURE_ENTITY_IDS = {
  invoice: '00000000-0000-4000-8000-000000000001',
  expense: '00000000-0000-4000-8000-000000000002',
  swms: '00000000-0000-4000-8000-000000000003',
  jobLog: '00000000-0000-4000-8000-000000000004',
} as const;

export type PhotoEntityType = 'swms' | 'invoice' | 'expense' | 'job_log';

export interface UploadPhotoOptions {
  request: APIRequestContext;
  token: string;
  entityType: PhotoEntityType;
  entityId: string;
  caption?: string;
  filename?: string;
  buffer?: Buffer;
  mimeType?: string;
}

/**
 * Multipart upload helper for Playwright's APIRequestContext.
 * Returns the raw response so callers can assert on status + body.
 */
export async function uploadPhoto(opts: UploadPhotoOptions) {
  const {
    request,
    token,
    entityType,
    entityId,
    caption,
    filename = 'tiny.png',
    buffer = tinyPngBuffer(),
    mimeType = 'image/png',
  } = opts;

  const multipart: Record<string, unknown> = {
    entityType,
    entityId,
    photo: {
      name: filename,
      mimeType,
      buffer,
    },
  };
  if (caption) multipart.caption = caption;

  return request.post(`${API_BASE_URL}/api/v1/photos`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart,
  });
}

/**
 * Convenience: build a multipart upload payload to feed directly into
 * Playwright's request.post — useful when a test wants finer control.
 */
export function buildMultipart(opts: {
  entityType: PhotoEntityType;
  entityId: string;
  caption?: string;
  filename?: string;
  buffer?: Buffer;
  mimeType?: string;
}) {
  const {
    entityType,
    entityId,
    caption,
    filename = 'tiny.png',
    buffer = tinyPngBuffer(),
    mimeType = 'image/png',
  } = opts;
  const out: Record<string, unknown> = {
    entityType,
    entityId,
    photo: { name: filename, mimeType, buffer },
  };
  if (caption) out.caption = caption;
  return out;
}
