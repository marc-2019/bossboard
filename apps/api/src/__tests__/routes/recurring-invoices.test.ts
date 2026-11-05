/**
 * Recurring Invoice Route Tests
 */

import request from 'supertest';
import express, { Express } from 'express';
import { MAX_INVOICE_LINE_AMOUNT_CENTS } from '../../services/invoice-integer-cap.js';

// Mock service functions
const mockCreateRecurringInvoice = jest.fn();
const mockListRecurringInvoices = jest.fn();
const mockGetPendingRecurringInvoices = jest.fn();
const mockGetRecurringInvoiceById = jest.fn();
const mockUpdateRecurringInvoice = jest.fn();
const mockDeleteRecurringInvoice = jest.fn();
const mockGenerateInvoiceFromRecurring = jest.fn();
const mockGetLastAmounts = jest.fn();

jest.mock('../../services/recurring-invoices.js', () => ({
  __esModule: true,
  default: {
    createRecurringInvoice: mockCreateRecurringInvoice,
    listRecurringInvoices: mockListRecurringInvoices,
    getPendingRecurringInvoices: mockGetPendingRecurringInvoices,
    getRecurringInvoiceById: mockGetRecurringInvoiceById,
    updateRecurringInvoice: mockUpdateRecurringInvoice,
    deleteRecurringInvoice: mockDeleteRecurringInvoice,
    generateInvoiceFromRecurring: mockGenerateInvoiceFromRecurring,
    getLastAmounts: mockGetLastAmounts,
  },
}));

jest.mock('../../middleware/auth.js', () => ({
  authenticate: function (req: any, _res: any, next: any) {
    req.user = { userId: 'test-user-id', email: 'test@example.com' };
    next();
  },
}));

import recurringInvoiceRoutes from '../../routes/recurring-invoices.js';
import { errorHandler } from '../../middleware/error.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/v1/recurring-invoices', recurringInvoiceRoutes);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Recurring Invoice Routes', () => {
  const validLineItem = {
    productServiceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Monthly electrical maintenance',
    unitPrice: 15000,
    quantity: 1,
    type: 'fixed',
  };

  const validRecurringInvoice = {
    customerId: 'f1e2d3c4-b5a6-7890-fedc-ba9876543210',
    name: 'Monthly Maintenance',
    dayOfMonth: 1,
    includeGst: true,
    paymentTerms: 14,
    notes: 'Auto-generated monthly',
    lineItems: [validLineItem],
  };

  // ============================================================
  // POST /api/v1/recurring-invoices
  // ============================================================

  describe('POST /api/v1/recurring-invoices', () => {
    it('should create a recurring invoice successfully', async () => {
      const mockRecurring = { id: 'ri-1', ...validRecurringInvoice, isActive: true };
      mockCreateRecurringInvoice.mockResolvedValue(mockRecurring);

      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send(validRecurringInvoice);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        data: { recurring: mockRecurring },
        message: 'Recurring invoice created successfully',
      });
      expect(mockCreateRecurringInvoice).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ name: 'Monthly Maintenance' })
      );
    });

    it('should reject missing customerId', async () => {
      const { customerId: _omit, ...noCustomer } = validRecurringInvoice;

      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send(noCustomer);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
      });
    });

    it('should reject invalid customerId (not uuid)', async () => {
      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send({ ...validRecurringInvoice, customerId: 'not-a-uuid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toContain('Valid customer ID is required');
    });

    it('should reject missing name', async () => {
      const { name: _omit, ...noName } = validRecurringInvoice;

      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send(noName);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject empty line items array', async () => {
      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send({ ...validRecurringInvoice, lineItems: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toContain('At least one line item is required');
    });

    it('should reject missing line items field', async () => {
      const { lineItems: _omit, ...noLineItems } = validRecurringInvoice;

      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send(noLineItems);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject line item with invalid productServiceId (not uuid)', async () => {
      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send({
          ...validRecurringInvoice,
          lineItems: [{ ...validLineItem, productServiceId: 'bad-id' }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject line item with negative unitPrice', async () => {
      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send({
          ...validRecurringInvoice,
          lineItems: [{ ...validLineItem, unitPrice: -100 }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject line item with zero quantity', async () => {
      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send({
          ...validRecurringInvoice,
          lineItems: [{ ...validLineItem, quantity: 0 }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject a unit price above the invoice total cap', async () => {
      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send({
          ...validRecurringInvoice,
          lineItems: [{ ...validLineItem, unitPrice: MAX_INVOICE_LINE_AMOUNT_CENTS + 1, quantity: 1 }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(mockCreateRecurringInvoice).not.toHaveBeenCalled();
    });

    it('should reject a line whose unit price times quantity exceeds the invoice total cap', async () => {
      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send({
          ...validRecurringInvoice,
          lineItems: [{ ...validLineItem, unitPrice: 1_000_000, quantity: 2_000 }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Line total exceeds the maximum');
      expect(mockCreateRecurringInvoice).not.toHaveBeenCalled();
    });

    it('should reject line items whose combined total exceeds the invoice total cap', async () => {
      const capped = { ...validLineItem, unitPrice: MAX_INVOICE_LINE_AMOUNT_CENTS, quantity: 1 };
      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send({
          ...validRecurringInvoice,
          lineItems: [capped, { ...capped, productServiceId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Total exceeds the maximum');
      expect(mockCreateRecurringInvoice).not.toHaveBeenCalled();
    });

    it('should reject line item with invalid type', async () => {
      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send({
          ...validRecurringInvoice,
          lineItems: [{ ...validLineItem, type: 'monthly' }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject dayOfMonth below 1', async () => {
      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send({ ...validRecurringInvoice, dayOfMonth: 0 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject dayOfMonth above 28', async () => {
      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send({ ...validRecurringInvoice, dayOfMonth: 29 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should accept dayOfMonth at boundary values (1 and 28)', async () => {
      const mockRecurring = { id: 'ri-1', ...validRecurringInvoice, dayOfMonth: 28 };
      mockCreateRecurringInvoice.mockResolvedValue(mockRecurring);

      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send({ ...validRecurringInvoice, dayOfMonth: 28 });

      expect(response.status).toBe(201);
    });

    it('should accept variable type line item without quantity', async () => {
      const mockRecurring = { id: 'ri-1', ...validRecurringInvoice };
      mockCreateRecurringInvoice.mockResolvedValue(mockRecurring);

      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send({
          ...validRecurringInvoice,
          lineItems: [{ productServiceId: validLineItem.productServiceId, unitPrice: 0, type: 'variable' }],
        });

      expect(response.status).toBe(201);
    });

    it('should include validation details in error response', async () => {
      const response = await request(app)
        .post('/api/v1/recurring-invoices')
        .send({ lineItems: [] });

      expect(response.status).toBe(400);
      expect(response.body.details).toBeDefined();
      expect(Array.isArray(response.body.details)).toBe(true);
    });
  });

  // ============================================================
  // GET /api/v1/recurring-invoices
  // ============================================================

  describe('GET /api/v1/recurring-invoices', () => {
    it('should list recurring invoices', async () => {
      const mockResult = { recurringInvoices: [], total: 0 };
      mockListRecurringInvoices.mockResolvedValue(mockResult);

      const response = await request(app).get('/api/v1/recurring-invoices');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ success: true, data: mockResult });
    });

    it('should pass limit and offset to service', async () => {
      mockListRecurringInvoices.mockResolvedValue({ recurringInvoices: [], total: 0 });

      await request(app).get('/api/v1/recurring-invoices?limit=10&offset=20');

      expect(mockListRecurringInvoices).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ limit: 10, offset: 20 })
      );
    });

    it('should pass undefined when no pagination params', async () => {
      mockListRecurringInvoices.mockResolvedValue({ recurringInvoices: [], total: 0 });

      await request(app).get('/api/v1/recurring-invoices');

      expect(mockListRecurringInvoices).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ limit: undefined, offset: undefined })
      );
    });

    it('should return list of active recurring invoices', async () => {
      const mockRecurring = { id: 'ri-1', name: 'Monthly Maintenance', isActive: true };
      mockListRecurringInvoices.mockResolvedValue({ recurringInvoices: [mockRecurring], total: 1 });

      const response = await request(app).get('/api/v1/recurring-invoices');

      expect(response.status).toBe(200);
      expect(response.body.data.recurringInvoices).toHaveLength(1);
      expect(response.body.data.total).toBe(1);
    });
  });

  // ============================================================
  // GET /api/v1/recurring-invoices/pending
  // ============================================================

  describe('GET /api/v1/recurring-invoices/pending', () => {
    it('should return pending recurring invoices', async () => {
      const mockPending = [{ id: 'ri-1', name: 'Monthly Maintenance', nextBillingDate: '2026-04-01' }];
      mockGetPendingRecurringInvoices.mockResolvedValue(mockPending);

      const response = await request(app).get('/api/v1/recurring-invoices/pending');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ success: true, data: mockPending });
      expect(mockGetPendingRecurringInvoices).toHaveBeenCalledWith('test-user-id');
    });

    it('should return empty array when nothing is pending', async () => {
      mockGetPendingRecurringInvoices.mockResolvedValue([]);

      const response = await request(app).get('/api/v1/recurring-invoices/pending');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    it('should resolve before /:id route (route ordering)', async () => {
      // Verify /pending is not captured by /:id
      mockGetPendingRecurringInvoices.mockResolvedValue([]);

      const response = await request(app).get('/api/v1/recurring-invoices/pending');

      expect(response.status).toBe(200);
      expect(mockGetPendingRecurringInvoices).toHaveBeenCalled();
      expect(mockGetRecurringInvoiceById).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // GET /api/v1/recurring-invoices/:id
  // ============================================================

  describe('GET /api/v1/recurring-invoices/:id', () => {
    it('should return a recurring invoice by id', async () => {
      const mockRecurring = { id: 'ri-1', name: 'Monthly Maintenance' };
      mockGetRecurringInvoiceById.mockResolvedValue(mockRecurring);

      const response = await request(app).get('/api/v1/recurring-invoices/ri-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: { recurring: mockRecurring },
      });
      expect(mockGetRecurringInvoiceById).toHaveBeenCalledWith('ri-1', 'test-user-id');
    });

    it('should return 404 when recurring invoice not found', async () => {
      mockGetRecurringInvoiceById.mockResolvedValue(null);

      const response = await request(app).get('/api/v1/recurring-invoices/ri-999');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: 'NOT_FOUND',
        message: 'Recurring invoice not found',
      });
    });
  });

  // ============================================================
  // PUT /api/v1/recurring-invoices/:id
  // ============================================================

  describe('PUT /api/v1/recurring-invoices/:id', () => {
    it('should update a recurring invoice successfully', async () => {
      const updated = { id: 'ri-1', name: 'Updated Name', isActive: false };
      mockUpdateRecurringInvoice.mockResolvedValue(updated);

      const response = await request(app)
        .put('/api/v1/recurring-invoices/ri-1')
        .send({ name: 'Updated Name', isActive: false });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: { recurring: updated },
        message: 'Recurring invoice updated successfully',
      });
      expect(mockUpdateRecurringInvoice).toHaveBeenCalledWith(
        'ri-1',
        'test-user-id',
        expect.objectContaining({ name: 'Updated Name', isActive: false })
      );
    });

    it('should return 404 when recurring invoice not found', async () => {
      mockUpdateRecurringInvoice.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/v1/recurring-invoices/ri-999')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: 'NOT_FOUND',
        message: 'Recurring invoice not found',
      });
    });

    it('should reject name as empty string', async () => {
      const response = await request(app)
        .put('/api/v1/recurring-invoices/ri-1')
        .send({ name: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject dayOfMonth above 28 on update', async () => {
      const response = await request(app)
        .put('/api/v1/recurring-invoices/ri-1')
        .send({ dayOfMonth: 31 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject paymentTerms above 365', async () => {
      const response = await request(app)
        .put('/api/v1/recurring-invoices/ri-1')
        .send({ paymentTerms: 366 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should allow setting notes to null', async () => {
      const updated = { id: 'ri-1', notes: null };
      mockUpdateRecurringInvoice.mockResolvedValue(updated);

      const response = await request(app)
        .put('/api/v1/recurring-invoices/ri-1')
        .send({ notes: null });

      expect(response.status).toBe(200);
    });

    it('should accept partial update with only isActive', async () => {
      const updated = { id: 'ri-1', isActive: false };
      mockUpdateRecurringInvoice.mockResolvedValue(updated);

      const response = await request(app)
        .put('/api/v1/recurring-invoices/ri-1')
        .send({ isActive: false });

      expect(response.status).toBe(200);
      expect(response.body.data.recurring.isActive).toBe(false);
    });
  });

  // ============================================================
  // DELETE /api/v1/recurring-invoices/:id
  // ============================================================

  describe('DELETE /api/v1/recurring-invoices/:id', () => {
    it('should delete a recurring invoice', async () => {
      mockDeleteRecurringInvoice.mockResolvedValue(true);

      const response = await request(app).delete('/api/v1/recurring-invoices/ri-1');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Recurring invoice deleted successfully',
      });
      expect(mockDeleteRecurringInvoice).toHaveBeenCalledWith('ri-1', 'test-user-id');
    });

    it('should return 404 when recurring invoice not found', async () => {
      mockDeleteRecurringInvoice.mockResolvedValue(false);

      const response = await request(app).delete('/api/v1/recurring-invoices/ri-999');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: 'NOT_FOUND',
        message: 'Recurring invoice not found',
      });
    });
  });

  // ============================================================
  // POST /api/v1/recurring-invoices/:id/generate
  // ============================================================

  describe('POST /api/v1/recurring-invoices/:id/generate', () => {
    it('should generate a draft invoice from recurring config', async () => {
      const mockInvoice = { id: 'inv-1', status: 'draft', recurringInvoiceId: 'ri-1' };
      mockGenerateInvoiceFromRecurring.mockResolvedValue(mockInvoice);

      const response = await request(app)
        .post('/api/v1/recurring-invoices/ri-1/generate')
        .send({});

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        data: { invoice: mockInvoice },
        message: 'Draft invoice generated successfully',
      });
      expect(mockGenerateInvoiceFromRecurring).toHaveBeenCalledWith(
        'ri-1',
        'test-user-id',
        undefined
      );
    });

    it('should pass variable amounts to service', async () => {
      const mockInvoice = { id: 'inv-1', status: 'draft' };
      mockGenerateInvoiceFromRecurring.mockResolvedValue(mockInvoice);
      const variableAmounts = { 'item-uuid-1': 20000, 'item-uuid-2': 5000 };

      const response = await request(app)
        .post('/api/v1/recurring-invoices/ri-1/generate')
        .send({ variableAmounts });

      expect(response.status).toBe(201);
      expect(mockGenerateInvoiceFromRecurring).toHaveBeenCalledWith(
        'ri-1',
        'test-user-id',
        variableAmounts
      );
    });

    it('should reject variable amounts with negative values', async () => {
      const response = await request(app)
        .post('/api/v1/recurring-invoices/ri-1/generate')
        .send({ variableAmounts: { 'item-1': -500 } });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should generate with no body (all fixed items)', async () => {
      const mockInvoice = { id: 'inv-1', status: 'draft' };
      mockGenerateInvoiceFromRecurring.mockResolvedValue(mockInvoice);

      const response = await request(app)
        .post('/api/v1/recurring-invoices/ri-1/generate')
        .send();

      expect(response.status).toBe(201);
    });

    it('should call service with correct user and recurring invoice id', async () => {
      const mockInvoice = { id: 'inv-2', status: 'draft' };
      mockGenerateInvoiceFromRecurring.mockResolvedValue(mockInvoice);

      await request(app)
        .post('/api/v1/recurring-invoices/ri-42/generate')
        .send({});

      expect(mockGenerateInvoiceFromRecurring).toHaveBeenCalledWith(
        'ri-42',
        'test-user-id',
        undefined
      );
    });
  });

  // ============================================================
  // GET /api/v1/recurring-invoices/:id/last-amounts
  // ============================================================

  describe('GET /api/v1/recurring-invoices/:id/last-amounts', () => {
    it('should return last invoice amounts', async () => {
      const mockAmounts = { 'item-uuid-1': 18000, 'item-uuid-2': 7500 };
      mockGetLastAmounts.mockResolvedValue(mockAmounts);

      const response = await request(app).get('/api/v1/recurring-invoices/ri-1/last-amounts');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: { lastAmounts: mockAmounts },
      });
      expect(mockGetLastAmounts).toHaveBeenCalledWith('ri-1', 'test-user-id');
    });

    it('should return null when no invoices have been generated yet', async () => {
      mockGetLastAmounts.mockResolvedValue(null);

      const response = await request(app).get('/api/v1/recurring-invoices/ri-1/last-amounts');

      expect(response.status).toBe(200);
      expect(response.body.data.lastAmounts).toBeNull();
    });

    it('should return empty object when last invoice had no variable amounts', async () => {
      mockGetLastAmounts.mockResolvedValue({});

      const response = await request(app).get('/api/v1/recurring-invoices/ri-1/last-amounts');

      expect(response.status).toBe(200);
      expect(response.body.data.lastAmounts).toEqual({});
    });
  });
});
