/**
 * SWMS Route Tests
 */

import request from 'supertest';
import express, { Express } from 'express';

// Mock SWMS service
const mockGetTemplates = jest.fn();
const mockGetTemplate = jest.fn();
const mockGenerateSWMS = jest.fn();
const mockGetSWMSById = jest.fn();
const mockListSWMS = jest.fn();
const mockUpdateSWMS = jest.fn();
const mockDeleteSWMS = jest.fn();
const mockSignSWMS = jest.fn();
const mockCopySWMS = jest.fn();

jest.mock('../../services/swms.js', () => ({
  __esModule: true,
  default: {
    getTemplates: mockGetTemplates,
    getTemplate: mockGetTemplate,
    generateSWMS: mockGenerateSWMS,
    getSWMSById: mockGetSWMSById,
    listSWMS: mockListSWMS,
    updateSWMS: mockUpdateSWMS,
    deleteSWMS: mockDeleteSWMS,
    signSWMS: mockSignSWMS,
    copySWMS: mockCopySWMS,
  },
}));

// Mock audit-log service so we can assert what the routes record without
// hitting the database.
const mockAuditRecord = jest.fn();
const mockAuditDiff = jest.fn();
const mockAuditList = jest.fn();

jest.mock('../../services/audit-log.js', () => ({
  __esModule: true,
  default: {
    record: mockAuditRecord,
    diffEntity: mockAuditDiff,
    listForEntity: mockAuditList,
  },
}));

// Mock auth middleware - using plain JS callback to avoid ts-jest transformation issues
jest.mock('../../middleware/auth.js', () => ({
  authenticate: function(req: any, _res: any, next: any) {
    req.user = { userId: 'test-user-id', email: 'test@example.com' };
    next();
  },
}));

// Mock subscription middleware to avoid hitting the real database
jest.mock('../../middleware/subscription.js', () => ({
  attachSubscription: function (_req: any, _res: any, next: any) { next(); },
  checkLimit: function () { return function (_req: any, _res: any, next: any) { next(); }; },
  requireFeature: function () { return function (_req: any, _res: any, next: any) { next(); }; },
}));

// Import routes after mocking
import swmsRoutes from '../../routes/swms.js';
import { errorHandler } from '../../middleware/error.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/v1/swms', swmsRoutes);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SWMS Routes', () => {
  describe('GET /api/v1/swms/templates', () => {
    it('should return list of available templates', async () => {
      const mockTemplates = [
        { tradeType: 'electrician', name: 'Electrician SWMS', version: '1.0' },
        { tradeType: 'plumber', name: 'Plumber SWMS', version: '1.0' },
        { tradeType: 'builder', name: 'Builder/Construction SWMS', version: '1.0' },
      ];

      mockGetTemplates.mockReturnValue(mockTemplates);

      const response = await request(app).get('/api/v1/swms/templates');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: { templates: mockTemplates },
      });
    });
  });

  describe('GET /api/v1/swms/templates/:tradeType', () => {
    it('should return specific template', async () => {
      const mockTemplate = {
        tradeType: 'electrician',
        version: '1.0',
        sections: [],
      };

      mockGetTemplate.mockReturnValue(mockTemplate);

      const response = await request(app).get('/api/v1/swms/templates/electrician');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: { template: mockTemplate },
      });
    });

    it('should return 404 for invalid trade type', async () => {
      const error = new Error('Template not found') as any;
      error.statusCode = 404;
      error.code = 'TEMPLATE_NOT_FOUND';
      mockGetTemplate.mockImplementation(() => {
        throw error;
      });

      const response = await request(app).get('/api/v1/swms/templates/invalid');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: 'TEMPLATE_NOT_FOUND',
      });
    });
  });

  describe('POST /api/v1/swms/generate', () => {
    const validInput = {
      tradeType: 'electrician',
      jobDescription: 'Install new switchboard at residential property',
      siteAddress: '123 Test Street, Auckland',
      clientName: 'John Smith',
      useAI: false,
    };

    it('should generate SWMS document successfully', async () => {
      const mockResponse = {
        swmsId: 'swms-123',
        document: {
          id: 'swms-123',
          templateType: 'electrician',
          title: 'SWMS - Install new switchboard',
          status: 'draft',
          jobDescription: validInput.jobDescription,
        },
        suggestedHazards: [],
        suggestedControls: [],
        template: { tradeType: 'electrician' },
      };

      mockGenerateSWMS.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/v1/swms/generate')
        .set('Authorization', 'Bearer mock-token')
        .send(validInput);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        data: mockResponse,
        message: 'SWMS document generated successfully',
      });
    });

    it('should reject invalid trade type', async () => {
      const response = await request(app)
        .post('/api/v1/swms/generate')
        .set('Authorization', 'Bearer mock-token')
        .send({ ...validInput, tradeType: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
      });
    });

    it('should reject short job description', async () => {
      const response = await request(app)
        .post('/api/v1/swms/generate')
        .set('Authorization', 'Bearer mock-token')
        .send({ ...validInput, jobDescription: 'Short' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Job description must be at least 10 characters',
      });
    });
  });

  describe('GET /api/v1/swms', () => {
    it('should list user SWMS documents', async () => {
      const mockResult = {
        items: [
          { id: 'swms-1', title: 'Test SWMS 1', status: 'draft' },
          { id: 'swms-2', title: 'Test SWMS 2', status: 'signed' },
        ],
        total: 2,
      };

      mockListSWMS.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/v1/swms')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: mockResult,
      });
    });

    it('should support filtering by status', async () => {
      mockListSWMS.mockResolvedValue({ items: [], total: 0 });

      await request(app)
        .get('/api/v1/swms?status=draft')
        .set('Authorization', 'Bearer mock-token');

      expect(mockListSWMS).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ status: 'draft' })
      );
    });
  });

  describe('GET /api/v1/swms/:id', () => {
    it('should return SWMS document by ID', async () => {
      const mockDocument = {
        id: 'swms-123',
        userId: 'test-user-id',
        templateType: 'electrician',
        title: 'Test SWMS',
        status: 'draft',
      };

      mockGetSWMSById.mockResolvedValue(mockDocument);

      const response = await request(app)
        .get('/api/v1/swms/swms-123')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: { document: mockDocument },
      });
    });

    it('should return 404 for non-existent document', async () => {
      mockGetSWMSById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/swms/non-existent')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: 'NOT_FOUND',
      });
    });
  });

  describe('PUT /api/v1/swms/:id', () => {
    it('should update SWMS document', async () => {
      const updates = { title: 'Updated Title', status: 'signed' };
      const mockDocument = {
        id: 'swms-123',
        title: 'Updated Title',
        status: 'signed',
      };

      mockUpdateSWMS.mockResolvedValue(mockDocument);

      const response = await request(app)
        .put('/api/v1/swms/swms-123')
        .set('Authorization', 'Bearer mock-token')
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: { document: mockDocument },
        message: 'SWMS document updated successfully',
      });
    });

    it('should return 404 when updating non-existent document', async () => {
      mockUpdateSWMS.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/v1/swms/non-existent')
        .set('Authorization', 'Bearer mock-token')
        .send({ title: 'New Title' });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: 'NOT_FOUND',
      });
    });

    it('should write an audit log entry with actor, entity id, and diff on successful update', async () => {
      const before = { id: 'swms-123', title: 'Old Title', status: 'draft' };
      const after = { id: 'swms-123', title: 'Updated Title', status: 'signed' };
      const diff = {
        title: { old: 'Old Title', new: 'Updated Title' },
        status: { old: 'draft', new: 'signed' },
      };

      mockGetSWMSById.mockResolvedValue(before);
      mockUpdateSWMS.mockResolvedValue(after);
      mockAuditDiff.mockReturnValue(diff);

      const response = await request(app)
        .put('/api/v1/swms/swms-123')
        .set('Authorization', 'Bearer mock-token')
        .send({ title: 'Updated Title', status: 'signed' });

      expect(response.status).toBe(200);
      expect(mockAuditDiff).toHaveBeenCalledWith(before, after);
      expect(mockAuditRecord).toHaveBeenCalledWith({
        entityType: 'swms',
        entityId: 'swms-123',
        action: 'update',
        actorUserId: 'test-user-id',
        changes: diff,
      });
    });

    it('should not write an audit log entry when the diff is empty', async () => {
      const before = { id: 'swms-123', title: 'Same', status: 'draft' };
      const after = { id: 'swms-123', title: 'Same', status: 'draft' };

      mockGetSWMSById.mockResolvedValue(before);
      mockUpdateSWMS.mockResolvedValue(after);
      mockAuditDiff.mockReturnValue({});

      await request(app)
        .put('/api/v1/swms/swms-123')
        .set('Authorization', 'Bearer mock-token')
        .send({ title: 'Same' })
        .expect(200);

      expect(mockAuditDiff).toHaveBeenCalledWith(before, after);
      expect(mockAuditRecord).not.toHaveBeenCalled();
    });

    it('should not write an audit log entry when the pre-update snapshot is unavailable', async () => {
      mockGetSWMSById.mockResolvedValue(null);
      mockUpdateSWMS.mockResolvedValue({ id: 'swms-123', title: 'Updated' });

      await request(app)
        .put('/api/v1/swms/swms-123')
        .set('Authorization', 'Bearer mock-token')
        .send({ title: 'Updated' })
        .expect(200);

      expect(mockAuditDiff).not.toHaveBeenCalled();
      expect(mockAuditRecord).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/v1/swms/:id', () => {
    it('should delete SWMS document', async () => {
      mockDeleteSWMS.mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/v1/swms/swms-123')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: 'SWMS document deleted successfully',
      });
    });

    it('should return 404 when deleting non-existent document', async () => {
      mockDeleteSWMS.mockResolvedValue(false);

      const response = await request(app)
        .delete('/api/v1/swms/non-existent')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: 'NOT_FOUND',
      });
    });
  });

  describe('POST /api/v1/swms/:id/sign', () => {
    it('should sign SWMS document as worker', async () => {
      const signData = {
        signature: 'base64-signature-data',
        role: 'worker',
      };
      const mockDocument = {
        id: 'swms-123',
        workerSignature: signData.signature,
        workerSignedAt: new Date().toISOString(),
        status: 'signed',
      };

      mockSignSWMS.mockResolvedValue(mockDocument);

      const response = await request(app)
        .post('/api/v1/swms/swms-123/sign')
        .set('Authorization', 'Bearer mock-token')
        .send(signData);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: { document: mockDocument },
        message: 'SWMS document signed successfully',
      });
    });

    it('should reject invalid role', async () => {
      const response = await request(app)
        .post('/api/v1/swms/swms-123/sign')
        .set('Authorization', 'Bearer mock-token')
        .send({ signature: 'data', role: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
      });
    });

    it('should reject missing signature', async () => {
      const response = await request(app)
        .post('/api/v1/swms/swms-123/sign')
        .set('Authorization', 'Bearer mock-token')
        .send({ role: 'worker' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
      });
    });

    it('should return 404 when SWMS document not found during sign', async () => {
      mockSignSWMS.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/swms/non-existent/sign')
        .set('Authorization', 'Bearer mock-token')
        .send({ signature: 'valid-signature-data', role: 'supervisor' });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: 'NOT_FOUND',
      });
    });
  });

  describe('PUT /api/v1/swms/:id — validation error branch', () => {
    it('should return 400 when status is invalid enum value', async () => {
      const response = await request(app)
        .put('/api/v1/swms/swms-123')
        .set('Authorization', 'Bearer mock-token')
        .send({ status: 'invalid-status' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
      });
    });
  });

  describe('POST /api/v1/swms/copy', () => {
    const copyResult = {
      swmsId: 'new-swms-1',
      sourceSwmsId: 'source-swms-1',
      document: {
        id: 'new-swms-1',
        title: 'Copy of SWMS - Install switchboard',
        status: 'draft',
        trade_type: 'electrician',
      },
      copiedFields: ['hazards', 'controls', 'ppe_required', 'emergency_plan'],
    };

    it('should copy SWMS into a new draft (201)', async () => {
      mockCopySWMS.mockResolvedValue(copyResult);

      const response = await request(app)
        .post('/api/v1/swms/copy')
        .set('Authorization', 'Bearer mock-token')
        .send({ sourceSwmsId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        data: copyResult,
      });
      expect(response.body.message).toMatch(/review/i);
      expect(mockCopySWMS).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ sourceSwmsId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
      );
      expect(mockAuditRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'swms',
          entityId: 'new-swms-1',
          action: 'create',
          metadata: expect.objectContaining({ copiedFrom: 'source-swms-1' }),
        })
      );
    });

    it('should accept empty body (copy last job)', async () => {
      mockCopySWMS.mockResolvedValue(copyResult);

      const response = await request(app)
        .post('/api/v1/swms/copy')
        .set('Authorization', 'Bearer mock-token')
        .send({});

      expect(response.status).toBe(201);
      expect(mockCopySWMS).toHaveBeenCalledWith('test-user-id', {});
    });

    it('should reject invalid sourceSwmsId (not uuid)', async () => {
      const response = await request(app)
        .post('/api/v1/swms/copy')
        .set('Authorization', 'Bearer mock-token')
        .send({ sourceSwmsId: 'not-a-uuid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(mockCopySWMS).not.toHaveBeenCalled();
    });

    it('should map SOURCE_NOT_FOUND from service to 404', async () => {
      const error = new Error('Source SWMS document not found') as any;
      error.statusCode = 404;
      error.code = 'SOURCE_NOT_FOUND';
      mockCopySWMS.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/v1/swms/copy')
        .set('Authorization', 'Bearer mock-token')
        .send({ sourceSwmsId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: 'SOURCE_NOT_FOUND',
      });
    });

    it('should map NO_SOURCE_SWMS to 404', async () => {
      const error = new Error('No previous SWMS found to copy') as any;
      error.statusCode = 404;
      error.code = 'NO_SOURCE_SWMS';
      mockCopySWMS.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/v1/swms/copy')
        .set('Authorization', 'Bearer mock-token')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NO_SOURCE_SWMS');
    });
  });

});
