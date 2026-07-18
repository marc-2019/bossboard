/**
 * Business Profile Route Tests
 */

import request from 'supertest';
import express, { Express } from 'express';

// Mock services
const mockGetBusinessProfile = jest.fn();
const mockUpsertBusinessProfile = jest.fn();

jest.mock('../../services/business-profile.js', () => ({
  __esModule: true,
  default: {
    getBusinessProfile: mockGetBusinessProfile,
    upsertBusinessProfile: mockUpsertBusinessProfile,
  },
}));

jest.mock('../../middleware/auth.js', () => ({
  authenticate: function (req: any, _res: any, next: any) {
    req.user = { userId: 'test-user-id', email: 'test@example.com' };
    next();
  },
}));

import businessProfileRoutes from '../../routes/business-profile.js';
import { errorHandler } from '../../middleware/error.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/v1/business-profile', businessProfileRoutes);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Business Profile Routes', () => {
  const validProfile = {
    companyName: 'Armstrong Electrical Ltd',
    tradingAs: 'Armstrong Electrical',
    irdNumber: '123-456-789',
    gstNumber: '123-456-789',
    isGstRegistered: true,
    companyAddress: '1 Main Street, Auckland 1010',
    companyPhone: '09-123-4567',
    companyEmail: 'info@armstrong.co.nz',
    bankAccountName: 'Armstrong Electrical Ltd',
    bankAccountNumber: '02-0000-0000000-00',
    bankName: 'ANZ',
    defaultPaymentTerms: 20,
    invoicePrefix: 'INV',
  };

  // =========================================================================
  // GET /
  // =========================================================================
  describe('GET /api/v1/business-profile', () => {
    it('should return the business profile when it exists', async () => {
      const mockProfile = { id: 'bp-1', ...validProfile };
      mockGetBusinessProfile.mockResolvedValue(mockProfile);

      const response = await request(app).get('/api/v1/business-profile');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.profile.id).toBe('bp-1');
      expect(response.body.data.profile.companyName).toBe('Armstrong Electrical Ltd');
      expect(mockGetBusinessProfile).toHaveBeenCalledWith('test-user-id');
    });

    it('should return null profile when not set up yet (new user)', async () => {
      mockGetBusinessProfile.mockResolvedValue(null);

      const response = await request(app).get('/api/v1/business-profile');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.profile).toBeNull();
    });

    it('should forward service errors to the error handler', async () => {
      mockGetBusinessProfile.mockRejectedValue(new Error('db down'));

      const response = await request(app).get('/api/v1/business-profile');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

  });

  // =========================================================================
  // PUT /
  // =========================================================================
  describe('PUT /api/v1/business-profile', () => {
    it('should upsert business profile successfully', async () => {
      const mockUpdated = { id: 'bp-1', ...validProfile };
      mockUpsertBusinessProfile.mockResolvedValue(mockUpdated);

      const response = await request(app)
        .put('/api/v1/business-profile')
        .send(validProfile);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.profile.companyName).toBe('Armstrong Electrical Ltd');
      expect(response.body.message).toContain('updated');
      expect(mockUpsertBusinessProfile).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ companyName: 'Armstrong Electrical Ltd' })
      );
    });

    it('should accept a partial update (only some fields)', async () => {
      const mockUpdated = { id: 'bp-1', companyName: 'New Name' };
      mockUpsertBusinessProfile.mockResolvedValue(mockUpdated);

      const response = await request(app)
        .put('/api/v1/business-profile')
        .send({ companyName: 'New Name' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should accept an empty body (no-op upsert)', async () => {
      mockUpsertBusinessProfile.mockResolvedValue({ id: 'bp-1' });

      const response = await request(app)
        .put('/api/v1/business-profile')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .put('/api/v1/business-profile')
        .send({ companyEmail: 'not-an-email' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    // Regression 2026-07-18: empty/whitespace email must not 400 — coerce to omitted.
    it('should accept empty-string companyEmail as omitted', async () => {
      mockUpsertBusinessProfile.mockResolvedValue({ id: 'bp-1' });
      const response = await request(app)
        .put('/api/v1/business-profile')
        .send({ companyEmail: '', companyName: 'Test Co' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockUpsertBusinessProfile).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ companyName: 'Test Co', companyEmail: undefined })
      );
    });

    it('should accept whitespace-only companyEmail as omitted', async () => {
      mockUpsertBusinessProfile.mockResolvedValue({ id: 'bp-1' });
      const response = await request(app)
        .put('/api/v1/business-profile')
        .send({ companyEmail: '   ' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject invoicePrefix longer than 10 characters', async () => {
      const response = await request(app)
        .put('/api/v1/business-profile')
        .send({ invoicePrefix: 'TOOLONGPREFIX' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject defaultPaymentTerms out of range', async () => {
      const response = await request(app)
        .put('/api/v1/business-profile')
        .send({ defaultPaymentTerms: 0 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject defaultPaymentTerms above maximum', async () => {
      const response = await request(app)
        .put('/api/v1/business-profile')
        .send({ defaultPaymentTerms: 366 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should accept valid international banking fields', async () => {
      mockUpsertBusinessProfile.mockResolvedValue({ id: 'bp-1', intlIban: 'GB33BUKB20201555555555' });

      const response = await request(app)
        .put('/api/v1/business-profile')
        .send({
          intlBankAccountName: 'Armstrong Electrical Ltd',
          intlIban: 'GB33BUKB20201555555555',
          intlSwiftBic: 'BUKBGB22',
          intlBankName: 'Barclays',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should forward service errors to the error handler', async () => {
      mockUpsertBusinessProfile.mockRejectedValue(new Error('write failed'));

      const response = await request(app)
        .put('/api/v1/business-profile')
        .send({ companyName: 'X' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

  });
});
