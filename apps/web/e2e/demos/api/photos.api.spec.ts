/**
 * F-PHOTO API demos — Photos module
 *
 * Feature IDs covered:
 *   - F-PHOTO-01: Upload photo (multipart) with entityType + entityId
 *                 + subscription gate + size + mime validation
 *   - F-PHOTO-02: List photos by entity, GET file binary, DELETE photo,
 *                 multi-tenant isolation
 *
 * Surface: A (primary). The web surface for Photos is intentionally thin —
 * tradies attach photos on mobile; web only renders thumbnails. See
 * apps/web/e2e/demos/photos.spec.ts for the browser-side file-input demo.
 *
 * Real-services note: hits the running BossBoard API on
 * process.env.API_BASE_URL || http://localhost:29000. Uses an in-memory
 * 1x1 PNG buffer — no binary fixture committed.
 */
import { test, expect } from '@playwright/test';
import {
  API_BASE_URL,
  FIXTURE_ENTITY_IDS,
  buildMultipart,
  largePngBuffer,
  sampleCaptions,
  tinyPngBuffer,
  tinyTextBuffer,
  uploadPhoto,
} from '../helpers/photos';

const PASSWORD = 'CorrectHorseBatteryStaple1!';
const uniqueEmail = (slug = 'photos') =>
  `e2e-${slug}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@test.bossboard.nz`;

/**
 * Bootstrap a real user + access_token via the live auth API. Beta-mode is
 * assumed (all users get tradie-tier features including 'photos').
 */
async function registerUser(request: import('@playwright/test').APIRequestContext, slug: string) {
  const email = uniqueEmail(slug);
  const res = await request.post(`${API_BASE_URL}/auth/register`, {
    data: { email, password: PASSWORD, name: `E2E ${slug}` },
  });
  expect(res.ok(), `register ${slug}: status=${res.status()}`).toBeTruthy();
  const body = await res.json();
  // API may shape token under data.access_token or top-level — handle both.
  const token =
    body.access_token || body?.data?.access_token || body?.tokens?.access_token;
  expect(token, `no access token in register response`).toBeTruthy();
  return { email, token, body };
}

test.describe('F-PHOTO api — Photos module', () => {
  test.describe.configure({ mode: 'serial' });

  test('F-PHOTO-01: upload requires authentication', async ({ request }) => {
    // AC: photos endpoint is auth-gated; no Authorization → 401
    const res = await request.post(`${API_BASE_URL}/api/v1/photos`, {
      multipart: buildMultipart({
        entityType: 'expense',
        entityId: FIXTURE_ENTITY_IDS.expense,
        caption: sampleCaptions.expenseReceipt,
      }),
    });
    expect(res.status()).toBe(401);
  });

  test('F-PHOTO-01: upload rejects missing file with 400 VALIDATION_ERROR', async ({ request }) => {
    const { token } = await registerUser(request, 'p01-nofile');
    const res = await request.post(`${API_BASE_URL}/api/v1/photos`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        entityType: 'expense',
        entityId: FIXTURE_ENTITY_IDS.expense,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  test('F-PHOTO-01: upload rejects non-UUID entityId with 400', async ({ request }) => {
    const { token } = await registerUser(request, 'p01-uuid');
    const res = await uploadPhoto({
      request,
      token,
      entityType: 'expense',
      entityId: 'not-a-uuid',
      caption: sampleCaptions.expenseReceipt,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.message).toMatch(/UUID/i);
  });

  test('F-PHOTO-01: upload rejects invalid entityType with 400', async ({ request }) => {
    const { token } = await registerUser(request, 'p01-etype');
    const res = await uploadPhoto({
      request,
      token,
      // @ts-expect-error testing invalid runtime value
      entityType: 'banana',
      entityId: FIXTURE_ENTITY_IDS.expense,
    });
    expect(res.status()).toBe(400);
  });

  test('F-PHOTO-01: upload rejects non-image mime type with 400 INVALID_FILE_TYPE', async ({ request }) => {
    const { token } = await registerUser(request, 'p01-mime');
    const res = await uploadPhoto({
      request,
      token,
      entityType: 'expense',
      entityId: FIXTURE_ENTITY_IDS.expense,
      filename: 'notes.txt',
      buffer: tinyTextBuffer(),
      mimeType: 'text/plain',
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('INVALID_FILE_TYPE');
  });

  test('F-PHOTO-01: upload rejects >10MB file with 400 FILE_TOO_LARGE', async ({ request }) => {
    const { token } = await registerUser(request, 'p01-large');
    const res = await uploadPhoto({
      request,
      token,
      entityType: 'expense',
      entityId: FIXTURE_ENTITY_IDS.expense,
      filename: 'huge.png',
      buffer: largePngBuffer(),
      mimeType: 'image/png',
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('FILE_TOO_LARGE');
  });

  test('F-PHOTO-01: upload happy path returns 201 + photo record', async ({ request }) => {
    // AC: realistic expense receipt photo attached to an expense entity.
    const { token } = await registerUser(request, 'p01-ok');
    const res = await uploadPhoto({
      request,
      token,
      entityType: 'expense',
      entityId: FIXTURE_ENTITY_IDS.expense,
      caption: sampleCaptions.expenseReceipt,
      filename: 'bunnings-receipt-237-40.png',
      buffer: tinyPngBuffer(),
      mimeType: 'image/png',
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data?.photo).toBeDefined();
    const photo = body.data.photo;
    expect(photo.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(photo.entity_type).toBe('expense');
    expect(photo.entity_id).toBe(FIXTURE_ENTITY_IDS.expense);
    expect(photo.caption).toBe(sampleCaptions.expenseReceipt);
    expect(photo.url).toBe(`/api/v1/photos/${photo.id}/file`);
    expect(photo.mime_type).toMatch(/^image\//);
  });

  test('F-PHOTO-02: list photos by entity returns user-scoped collection', async ({ request }) => {
    // AC: GET /api/v1/photos/:entityType/:entityId returns only this user's
    // photos for the entity. Upload 2 SWMS photos, then list.
    const { token } = await registerUser(request, 'p02-list');
    const entityId = FIXTURE_ENTITY_IDS.swms;

    for (const cap of [sampleCaptions.beforeShot, sampleCaptions.afterShot]) {
      const upload = await uploadPhoto({
        request,
        token,
        entityType: 'swms',
        entityId,
        caption: cap,
      });
      expect(upload.status()).toBe(201);
    }

    const list = await request.get(
      `${API_BASE_URL}/api/v1/photos/swms/${entityId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(list.status()).toBe(200);
    const body = await list.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.photos)).toBe(true);
    expect(body.data.photos.length).toBeGreaterThanOrEqual(2);
    // ORDER BY created_at DESC — most recent first
    const captions = body.data.photos.map((p: { caption: string }) => p.caption);
    expect(captions).toContain(sampleCaptions.beforeShot);
    expect(captions).toContain(sampleCaptions.afterShot);
  });

  test('F-PHOTO-02: list rejects invalid entityType with 400', async ({ request }) => {
    const { token } = await registerUser(request, 'p02-list-bad');
    const res = await request.get(
      `${API_BASE_URL}/api/v1/photos/banana/${FIXTURE_ENTITY_IDS.swms}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  test('F-PHOTO-02: GET /photos/:id/file streams the image bytes', async ({ request }) => {
    const { token } = await registerUser(request, 'p02-file');
    const upload = await uploadPhoto({
      request,
      token,
      entityType: 'job_log',
      entityId: FIXTURE_ENTITY_IDS.jobLog,
      caption: sampleCaptions.swmsSite,
    });
    expect(upload.status()).toBe(201);
    const { photo } = (await upload.json()).data;

    const file = await request.get(
      `${API_BASE_URL}/api/v1/photos/${photo.id}/file`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(file.status()).toBe(200);
    const bytes = await file.body();
    expect(bytes.length).toBeGreaterThan(0);
    // PNG magic header (8 bytes): 89 50 4E 47 0D 0A 1A 0A
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
  });

  test('F-PHOTO-02: GET /photos/:id/file is multi-tenant isolated', async ({ request }) => {
    // Owner uploads; outsider cannot fetch the same photo ID.
    const owner = await registerUser(request, 'p02-iso-owner');
    const outsider = await registerUser(request, 'p02-iso-outsider');

    const upload = await uploadPhoto({
      request,
      token: owner.token,
      entityType: 'invoice',
      entityId: FIXTURE_ENTITY_IDS.invoice,
      caption: sampleCaptions.afterShot,
    });
    expect(upload.status()).toBe(201);
    const { photo } = (await upload.json()).data;

    const cross = await request.get(
      `${API_BASE_URL}/api/v1/photos/${photo.id}/file`,
      { headers: { Authorization: `Bearer ${outsider.token}` } }
    );
    expect(cross.status()).toBe(404);
  });

  test('F-PHOTO-02: DELETE removes photo (owner only)', async ({ request }) => {
    const { token } = await registerUser(request, 'p02-del');
    const upload = await uploadPhoto({
      request,
      token,
      entityType: 'expense',
      entityId: FIXTURE_ENTITY_IDS.expense,
      caption: sampleCaptions.expenseReceipt,
    });
    expect(upload.status()).toBe(201);
    const { photo } = (await upload.json()).data;

    const del = await request.delete(
      `${API_BASE_URL}/api/v1/photos/${photo.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(del.status()).toBe(200);
    const body = await del.json();
    expect(body.success).toBe(true);

    // Second delete → 404 (already gone)
    const del2 = await request.delete(
      `${API_BASE_URL}/api/v1/photos/${photo.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(del2.status()).toBe(404);
  });

  test('F-PHOTO-02: DELETE by outsider returns 404 (cannot enumerate)', async ({ request }) => {
    const owner = await registerUser(request, 'p02-del-owner');
    const outsider = await registerUser(request, 'p02-del-outsider');

    const upload = await uploadPhoto({
      request,
      token: owner.token,
      entityType: 'invoice',
      entityId: FIXTURE_ENTITY_IDS.invoice,
    });
    expect(upload.status()).toBe(201);
    const { photo } = (await upload.json()).data;

    const cross = await request.delete(
      `${API_BASE_URL}/api/v1/photos/${photo.id}`,
      { headers: { Authorization: `Bearer ${outsider.token}` } }
    );
    expect(cross.status()).toBe(404);

    // Owner can still fetch — outsider's DELETE didn't actually delete.
    const file = await request.get(
      `${API_BASE_URL}/api/v1/photos/${photo.id}/file`,
      { headers: { Authorization: `Bearer ${owner.token}` } }
    );
    expect(file.status()).toBe(200);
  });
});
