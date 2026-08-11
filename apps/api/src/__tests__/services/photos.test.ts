/**
 * Photos Service Tests
 *
 * Universal photo attachments (SWMS, invoices, expenses, job logs). Covers:
 *   - createPhoto: defaults (mime, optional fields), mobile URL shape
 *   - listByEntity: maps rows to mobile shape
 *   - getPhotoById: found + not-found (null)
 *   - deletePhoto: success (unlink), file-already-gone (best effort), missing record, missing row
 *   - getUploadDir: returns an absolute path
 */

const mockDbQuery = jest.fn();
jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockDbQuery(...args),
  },
}));

const mockMkdir = jest.fn().mockResolvedValue(undefined);
const mockUnlink = jest.fn().mockResolvedValue(undefined);
jest.mock('fs/promises', () => ({
  __esModule: true,
  default: {
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
}));

import photosService from '../../services/photos.js';

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'photo-1',
    user_id: 'user-1',
    entity_type: 'invoice',
    entity_id: 'inv-1',
    filename: 'abc.jpg',
    original_filename: 'site.jpg',
    mime_type: 'image/jpeg',
    file_size: 2048,
    path: '/home/marc/projects/bossboard/uploads/photos/abc.jpg',
    caption: 'Before',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  mockDbQuery.mockReset();
  mockUnlink.mockReset().mockResolvedValue(undefined);
});

describe('createPhoto', () => {
  it('inserts a photo and returns the mobile shape with a file URL', async () => {
    // 1) ownership check  2) insert
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'inv-1' }] })
      .mockResolvedValueOnce({ rows: [makeRow()] });

    const result = await photosService.createPhoto('user-1', {
      entityType: 'invoice',
      entityId: 'inv-1',
      filename: 'abc.jpg',
      originalFilename: 'site.jpg',
      mimeType: 'image/png',
      fileSize: 2048,
      path: '/tmp/abc.jpg',
      caption: 'Before',
    });

    expect(result.id).toBe('photo-1');
    expect(result.url).toBe('/api/v1/photos/photo-1/file');
    expect(result.entity_type).toBe('invoice');
    const insertParams = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(insertParams[6]).toBe('image/png'); // explicit mime
  });

  it('defaults mime type and optional fields', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 'job-1' }] })
      .mockResolvedValueOnce({ rows: [makeRow()] });

    await photosService.createPhoto('user-1', {
      entityType: 'job_log',
      entityId: 'job-1',
      filename: 'x.jpg',
      path: '/tmp/x.jpg',
    });

    const insertParams = mockDbQuery.mock.calls[1][1] as unknown[];
    expect(insertParams[5]).toBeNull(); // originalFilename
    expect(insertParams[6]).toBe('image/jpeg'); // default mime
    expect(insertParams[7]).toBeNull(); // fileSize
    expect(insertParams[9]).toBeNull(); // caption
  });

  it('rejects photo when entity is not owned by user', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    await expect(
      photosService.createPhoto('user-1', {
        entityType: 'invoice',
        entityId: 'other-users-inv',
        filename: 'x.jpg',
        path: '/tmp/x.jpg',
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    // Only ownership query — no insert
    expect(mockDbQuery).toHaveBeenCalledTimes(1);
  });
});

describe('listByEntity', () => {
  it('returns the mobile shape for each row', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow(), makeRow({ id: 'photo-2' })] });
    const result = await photosService.listByEntity('invoice', 'inv-1', 'user-1');
    expect(result).toHaveLength(2);
    expect(result[1].url).toBe('/api/v1/photos/photo-2/file');
  });

  it('returns an empty array when there are no photos', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    expect(await photosService.listByEntity('invoice', 'inv-1', 'user-1')).toEqual([]);
  });
});

describe('getPhotoById', () => {
  it('returns the raw Photo when found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [makeRow()] });
    const result = await photosService.getPhotoById('photo-1', 'user-1');
    expect(result?.id).toBe('photo-1');
    expect(result?.path).toContain('abc.jpg');
  });

  it('returns null when not found', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] });
    expect(await photosService.getPhotoById('missing', 'user-1')).toBeNull();
  });
});

describe('deletePhoto', () => {
  it('deletes the record and unlinks the file', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [makeRow()] }) // getPhotoById
      .mockResolvedValueOnce({ rowCount: 1 }); // delete

    const result = await photosService.deletePhoto('photo-1', 'user-1');
    expect(result).toBe(true);
    expect(mockUnlink).toHaveBeenCalledWith(makeRow().path);
  });

  it('returns false when the photo record does not exist', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [] }); // getPhotoById -> null
    const result = await photosService.deletePhoto('missing', 'user-1');
    expect(result).toBe(false);
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('returns false when the delete affects no rows', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [makeRow()] })
      .mockResolvedValueOnce({ rowCount: 0 });
    expect(await photosService.deletePhoto('photo-1', 'user-1')).toBe(false);
  });

  it('still succeeds when the file is already gone (best effort)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockUnlink.mockRejectedValueOnce(new Error('ENOENT'));
    mockDbQuery
      .mockResolvedValueOnce({ rows: [makeRow()] })
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await photosService.deletePhoto('photo-1', 'user-1');
    expect(result).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('getUploadDir', () => {
  it('returns an absolute uploads/photos path', () => {
    const dir = photosService.getUploadDir();
    expect(dir.startsWith('/')).toBe(true);
    expect(dir).toContain('uploads/photos');
  });
});
