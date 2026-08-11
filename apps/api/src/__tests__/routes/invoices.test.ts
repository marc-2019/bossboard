/**
 * Invoice Route Tests
 */

import request from 'supertest';
import express, { Express } from 'express';

// Mock services
const mockCreateInvoice = jest.fn();
const mockListInvoices = jest.fn();
const mockGetInvoiceById = jest.fn();
const mockGetInvoiceByIdRaw = jest.fn();
const mockUpdateInvoice = jest.fn();
const mockDeleteInvoice = jest.fn();
const mockMarkAsSent = jest.fn();
const mockMarkAsPaid = jest.fn();
const mockGenerateShareToken = jest.fn();

jest.mock('../../services/invoices.js', () => ({
  __esModule: true,
  default: {
    createInvoice: mockCreateInvoice,
    listInvoices: mockListInvoices,
    getInvoiceById: mockGetInvoiceById,
    getInvoiceByIdRaw: mockGetInvoiceByIdRaw,
    updateInvoice: mockUpdateInvoice,
    deleteInvoice: mockDeleteInvoice,
    markAsSent: mockMarkAsSent,
    markAsPaid: mockMarkAsPaid,
    generateShareToken: mockGenerateShareToken,
  },
}));

const mockGenerateInvoicePDF = jest.fn();
jest.mock('../../services/pdf.js', () => ({
  __esModule: true,
  default: {
    generateInvoicePDF: mockGenerateInvoicePDF,
  },
}));

const mockIsEmailConfigured = jest.fn();
const mockSendInvoiceEmail = jest.fn();
const mockResolveInvoiceBcc = jest.fn();
jest.mock('../../services/email.js', () => ({
  __esModule: true,
  default: {
    isEmailConfigured: mockIsEmailConfigured,
    isSmtpConfigured: mockIsEmailConfigured,
    sendInvoiceEmail: mockSendInvoiceEmail,
    resolveInvoiceBcc: (...args: unknown[]) => mockResolveInvoiceBcc(...args),
  },
  resolveInvoiceBcc: (...args: unknown[]) => mockResolveInvoiceBcc(...args),
}));

const mockGetBusinessProfile = jest.fn();
jest.mock('../../services/business-profile.js', () => ({
  getBusinessProfile: (...args: unknown[]) => mockGetBusinessProfile(...args),
}));

jest.mock('../../middleware/auth.js', () => ({
  authenticate: function (req: any, _res: any, next: any) {
    req.user = { userId: 'test-user-id', email: 'test@example.com' };
    next();
  },
}));

jest.mock('../../middleware/subscription.js', () => ({
  attachSubscription: function (_req: any, _res: any, next: any) { next(); },
  checkLimit: function () { return function (_req: any, _res: any, next: any) { next(); }; },
  requireFeature: function () { return function (_req: any, _res: any, next: any) { next(); }; },
}));

jest.mock('../../config/index.js', () => ({
  config: { port: 29001, isDevelopment: true },
}));

import invoiceRoutes from '../../routes/invoices.js';
import { errorHandler } from '../../middleware/error.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/v1/invoices', invoiceRoutes);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetBusinessProfile.mockResolvedValue({ company_name: 'Test Co' });
  // Default: no BCC unless a test sets it
  mockResolveInvoiceBcc.mockReturnValue(null);
});

describe('Invoice Routes', () => {
  const validInvoice = {
    clientName: 'John Smith',
    clientEmail: 'john@example.com',
    lineItems: [{ description: 'Electrical work', amount: 15000 }],
    includeGst: true,
  };

  describe('POST /api/v1/invoices', () => {
    it('should create an invoice successfully', async () => {
      const mockInvoice = { id: 'inv-1', ...validInvoice, status: 'draft' };
      mockCreateInvoice.mockResolvedValue(mockInvoice);

      const response = await request(app)
        .post('/api/v1/invoices')
        .send(validInvoice);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        data: { invoice: mockInvoice },
        message: 'Invoice created successfully',
      });
      expect(mockCreateInvoice).toHaveBeenCalledWith('test-user-id', expect.objectContaining({
        clientName: 'John Smith',
      }));
    });

    it('should reject missing client name', async () => {
      const response = await request(app)
        .post('/api/v1/invoices')
        .send({ lineItems: [{ description: 'Work', amount: 100 }] });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
      });
    });

    it('should reject empty line items', async () => {
      const response = await request(app)
        .post('/api/v1/invoices')
        .send({ clientName: 'John', lineItems: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject line items with negative amount', async () => {
      const response = await request(app)
        .post('/api/v1/invoices')
        .send({
          clientName: 'John',
          lineItems: [{ description: 'Work', amount: -100 }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/invoices', () => {
    it('should list invoices', async () => {
      const mockResult = { invoices: [], total: 0 };
      mockListInvoices.mockResolvedValue(mockResult);

      const response = await request(app).get('/api/v1/invoices');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ success: true, data: mockResult });
    });

    it('should pass status filter to service', async () => {
      mockListInvoices.mockResolvedValue({ invoices: [], total: 0 });

      await request(app).get('/api/v1/invoices?status=paid');

      expect(mockListInvoices).toHaveBeenCalledWith('test-user-id', expect.objectContaining({
        status: 'paid',
      }));
    });
  });

  describe('GET /api/v1/invoices/:id', () => {
    it('should return an invoice by id', async () => {
      const mockInvoice = { id: 'inv-1', clientName: 'John' };
      mockGetInvoiceById.mockResolvedValue(mockInvoice);

      const response = await request(app).get('/api/v1/invoices/inv-1');

      expect(response.status).toBe(200);
      expect(response.body.data.invoice).toEqual(mockInvoice);
    });

    it('should return 404 for non-existent invoice', async () => {
      mockGetInvoiceById.mockResolvedValue(null);

      const response = await request(app).get('/api/v1/invoices/non-existent');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: 'NOT_FOUND',
      });
    });
  });

  describe('PUT /api/v1/invoices/:id', () => {
    it('should update a draft invoice', async () => {
      const updated = { id: 'inv-1', clientName: 'Jane' };
      mockUpdateInvoice.mockResolvedValue(updated);

      const response = await request(app)
        .put('/api/v1/invoices/inv-1')
        .send({ clientName: 'Jane' });

      expect(response.status).toBe(200);
      expect(response.body.data.invoice.clientName).toBe('Jane');
    });

    it('should return 404 when invoice not found', async () => {
      mockUpdateInvoice.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/v1/invoices/inv-1')
        .send({ clientName: 'Jane' });

      expect(response.status).toBe(404);
    });

    it('should return error when updating non-draft invoice', async () => {
      const error = new Error('Cannot edit a sent invoice') as any;
      error.statusCode = 400;
      error.code = 'INVOICE_NOT_EDITABLE';
      mockUpdateInvoice.mockRejectedValue(error);

      const response = await request(app)
        .put('/api/v1/invoices/inv-1')
        .send({ clientName: 'Jane' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('INVOICE_NOT_EDITABLE');
    });
  });

  describe('DELETE /api/v1/invoices/:id', () => {
    it('should delete an invoice', async () => {
      mockDeleteInvoice.mockResolvedValue(true);

      const response = await request(app).delete('/api/v1/invoices/inv-1');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Invoice deleted successfully');
    });

    it('should return 404 for non-existent invoice', async () => {
      mockDeleteInvoice.mockResolvedValue(false);

      const response = await request(app).delete('/api/v1/invoices/non-existent');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/v1/invoices/:id/send', () => {
    it('should mark invoice as sent', async () => {
      const sent = { id: 'inv-1', status: 'sent' };
      mockMarkAsSent.mockResolvedValue(sent);

      const response = await request(app).post('/api/v1/invoices/inv-1/send');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Invoice marked as sent');
    });

    it('should return 404 when invoice not found', async () => {
      mockMarkAsSent.mockResolvedValue(null);

      const response = await request(app).post('/api/v1/invoices/inv-1/send');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/v1/invoices/:id/paid', () => {
    it('should mark invoice as paid', async () => {
      const paid = { id: 'inv-1', status: 'paid' };
      mockMarkAsPaid.mockResolvedValue(paid);

      const response = await request(app).post('/api/v1/invoices/inv-1/paid');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Invoice marked as paid');
    });

    it('should return 404 when invoice not found or wrong status', async () => {
      mockMarkAsPaid.mockResolvedValue(null);

      const response = await request(app).post('/api/v1/invoices/inv-1/paid');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/v1/invoices/:id/share', () => {
    it('should generate a shareable link', async () => {
      mockGenerateShareToken.mockResolvedValue('share-token-123');
      mockGetInvoiceById.mockResolvedValue({ id: 'inv-1', status: 'sent' });

      const response = await request(app).post('/api/v1/invoices/inv-1/share');

      expect(response.status).toBe(200);
      expect(response.body.data.token).toBe('share-token-123');
      expect(response.body.data.shareUrl).toContain('share-token-123');
      expect(response.body.data.invoice?.status).toBe('sent');
    });

    it('should return 404 when invoice not found', async () => {
      mockGenerateShareToken.mockResolvedValue(null);

      const response = await request(app).post('/api/v1/invoices/inv-1/share');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/v1/invoices/:id/email', () => {
    it('should reject invalid recipient email', async () => {
      const response = await request(app)
        .post('/api/v1/invoices/inv-1/email')
        .send({ recipientEmail: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should return 503 when SMTP not configured', async () => {
      mockIsEmailConfigured.mockReturnValue(false);

      const response = await request(app)
        .post('/api/v1/invoices/inv-1/email')
        .send({ recipientEmail: 'client@example.com' });

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('EMAIL_NOT_CONFIGURED');
    });

    it('should email invoice successfully', async () => {
      mockIsEmailConfigured.mockReturnValue(true);
      mockGetInvoiceByIdRaw.mockResolvedValue({ id: 'inv-1', invoiceNumber: 'INV-001', status: 'draft' });
      mockGenerateInvoicePDF.mockResolvedValue(Buffer.from('fake-pdf'));
      mockSendInvoiceEmail.mockResolvedValue({ messageId: 'msg-1' });
      mockMarkAsSent.mockResolvedValue({ id: 'inv-1', status: 'sent' });
      mockGetInvoiceById.mockResolvedValue({ id: 'inv-1', status: 'sent' });
      mockResolveInvoiceBcc.mockReturnValue(null);

      const response = await request(app)
        .post('/api/v1/invoices/inv-1/email')
        .send({ recipientEmail: 'client@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.data.messageId).toBe('msg-1');
      expect(mockSendInvoiceEmail).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'client@example.com',
        'Test Co',
        undefined,
        undefined
      );
      expect(response.body.data.bccEmail).toBeNull();
    });

    it('should BCC business mailbox when resolveInvoiceBcc returns an address', async () => {
      mockIsEmailConfigured.mockReturnValue(true);
      mockGetBusinessProfile.mockResolvedValue({
        company_name: 'Test Co',
        company_email: 'office@test.co.nz',
        invoice_bcc_email: 'accounts@test.co.nz',
      });
      mockResolveInvoiceBcc.mockReturnValue('accounts@test.co.nz');
      mockGetInvoiceByIdRaw.mockResolvedValue({ id: 'inv-1', invoiceNumber: 'INV-001', status: 'sent' });
      mockGenerateInvoicePDF.mockResolvedValue(Buffer.from('fake-pdf'));
      mockSendInvoiceEmail.mockResolvedValue({ messageId: 'msg-bcc' });
      mockGetInvoiceById.mockResolvedValue({ id: 'inv-1', status: 'sent' });

      const response = await request(app)
        .post('/api/v1/invoices/inv-1/email')
        .send({ recipientEmail: 'client@example.com' });

      expect(response.status).toBe(200);
      expect(mockResolveInvoiceBcc).toHaveBeenCalledWith({
        invoiceBccEmail: 'accounts@test.co.nz',
        companyEmail: 'office@test.co.nz',
        userEmail: 'test@example.com',
        recipientEmail: 'client@example.com',
      });
      expect(mockSendInvoiceEmail).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'client@example.com',
        'Test Co',
        undefined,
        { bcc: 'accounts@test.co.nz' }
      );
      expect(response.body.data.bccEmail).toBe('accounts@test.co.nz');
      expect(response.body.message).toContain('BCC accounts@test.co.nz');
    });
  });

  describe('GET /api/v1/invoices/:id/pdf', () => {
    it('should return PDF for existing invoice', async () => {
      mockGetInvoiceByIdRaw.mockResolvedValue({ id: 'inv-1', invoiceNumber: 'INV-001' });
      mockGenerateInvoicePDF.mockResolvedValue(Buffer.from('fake-pdf-content'));

      const response = await request(app).get('/api/v1/invoices/inv-1/pdf');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
    });

    it('should return 404 for non-existent invoice', async () => {
      mockGetInvoiceByIdRaw.mockResolvedValue(null);

      const response = await request(app).get('/api/v1/invoices/non-existent/pdf');

      expect(response.status).toBe(404);
    });
  });

  // Additional branch coverage tests

  describe('PUT /api/v1/invoices/:id — validation error branch', () => {
    it('should return 400 when line item amount is negative in update', async () => {
      const response = await request(app)
        .put('/api/v1/invoices/inv-1')
        .send({ lineItems: [{ description: 'Work', amount: -50 }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when clientEmail is not a valid email in update', async () => {
      const response = await request(app)
        .put('/api/v1/invoices/inv-1')
        .send({ clientEmail: 'not-a-valid-email' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

  });

  describe('POST /api/v1/invoices/:id/email — additional branches', () => {
    it('should return 404 when invoice not found after SMTP configured', async () => {
      mockIsEmailConfigured.mockReturnValue(true);
      mockGetInvoiceByIdRaw.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/invoices/inv-1/email')
        .send({ recipientEmail: 'client@example.com' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOT_FOUND');
    });

    it('should return 503 when email service throws SMTP error', async () => {
      mockIsEmailConfigured.mockReturnValue(true);
      mockGetInvoiceByIdRaw.mockResolvedValue({ id: 'inv-1', invoiceNumber: 'INV-001', status: 'draft' });
      mockGenerateInvoicePDF.mockResolvedValue(Buffer.from('pdf'));
      mockSendInvoiceEmail.mockRejectedValue(new Error('SMTP connection refused'));

      const response = await request(app)
        .post('/api/v1/invoices/inv-1/email')
        .send({ recipientEmail: 'client@example.com' });

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('EMAIL_SEND_FAILED');
    });

    it('should not auto-mark as sent when invoice is already sent', async () => {
      mockIsEmailConfigured.mockReturnValue(true);
      mockGetInvoiceByIdRaw.mockResolvedValue({ id: 'inv-1', invoiceNumber: 'INV-001', status: 'sent' });
      mockGenerateInvoicePDF.mockResolvedValue(Buffer.from('pdf'));
      mockSendInvoiceEmail.mockResolvedValue({ messageId: 'msg-2' });
      mockGetInvoiceById.mockResolvedValue({ id: 'inv-1', status: 'sent' });

      const response = await request(app)
        .post('/api/v1/invoices/inv-1/email')
        .send({ recipientEmail: 'client@example.com' });

      expect(response.status).toBe(200);
      expect(mockMarkAsSent).not.toHaveBeenCalled();
    });
  });

});
