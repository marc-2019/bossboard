/**
 * Quote Route Tests
 */

import request from 'supertest';
import express, { Express } from 'express';

// Mock services
const mockCreateQuote = jest.fn();
const mockListQuotes = jest.fn();
const mockGetQuoteById = jest.fn();
const mockGetQuoteByIdRaw = jest.fn();
const mockUpdateQuote = jest.fn();
const mockDeleteQuote = jest.fn();
const mockMarkAsSent = jest.fn();
const mockMarkAsAccepted = jest.fn();
const mockMarkAsDeclined = jest.fn();
const mockConvertToInvoice = jest.fn();

jest.mock('../../services/quotes.js', () => ({
  __esModule: true,
  default: {
    createQuote: mockCreateQuote,
    listQuotes: mockListQuotes,
    getQuoteById: mockGetQuoteById,
    getQuoteByIdRaw: mockGetQuoteByIdRaw,
    updateQuote: mockUpdateQuote,
    deleteQuote: mockDeleteQuote,
    markAsSent: mockMarkAsSent,
    markAsAccepted: mockMarkAsAccepted,
    markAsDeclined: mockMarkAsDeclined,
    convertToInvoice: mockConvertToInvoice,
  },
}));

jest.mock('../../services/pdf.js', () => ({
  __esModule: true,
  default: {
    generateQuotePDF: jest.fn().mockResolvedValue(Buffer.from('fake-pdf')),
  },
}));

const mockIsEmailConfigured = jest.fn();
const mockSendQuoteEmail = jest.fn();
const mockResolveInvoiceBcc = jest.fn();
jest.mock('../../services/email.js', () => ({
  __esModule: true,
  default: {
    isEmailConfigured: mockIsEmailConfigured,
    sendQuoteEmail: mockSendQuoteEmail,
    resolveInvoiceBcc: mockResolveInvoiceBcc,
  },
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
  requireFeature: function () { return function (_req: any, _res: any, next: any) { next(); }; },
}));

import quoteRoutes from '../../routes/quotes.js';
import { errorHandler } from '../../middleware/error.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/v1/quotes', quoteRoutes);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Quote Routes', () => {
  const validQuote = {
    clientName: 'Jane Doe',
    lineItems: [{ description: 'Plumbing assessment', amount: 8000 }],
  };

  describe('POST /api/v1/quotes', () => {
    it('should create a quote successfully', async () => {
      const mockQuote = { id: 'q-1', ...validQuote, status: 'draft' };
      mockCreateQuote.mockResolvedValue(mockQuote);

      const response = await request(app)
        .post('/api/v1/quotes')
        .send(validQuote);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.quote.id).toBe('q-1');
    });

    it('should reject missing client name', async () => {
      const response = await request(app)
        .post('/api/v1/quotes')
        .send({ lineItems: [{ description: 'Work', amount: 100 }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject empty line items', async () => {
      const response = await request(app)
        .post('/api/v1/quotes')
        .send({ clientName: 'Jane', lineItems: [] });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/quotes', () => {
    it('should list quotes', async () => {
      mockListQuotes.mockResolvedValue({ quotes: [], total: 0 });

      const response = await request(app).get('/api/v1/quotes');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should pass status filter', async () => {
      mockListQuotes.mockResolvedValue({ quotes: [], total: 0 });

      await request(app).get('/api/v1/quotes?status=sent');

      expect(mockListQuotes).toHaveBeenCalledWith('test-user-id', expect.objectContaining({ status: 'sent' }));
    });
  });

  describe('GET /api/v1/quotes/:id', () => {
    it('should return a quote', async () => {
      mockGetQuoteById.mockResolvedValue({ id: 'q-1', clientName: 'Jane' });

      const response = await request(app).get('/api/v1/quotes/q-1');

      expect(response.status).toBe(200);
      expect(response.body.data.quote.id).toBe('q-1');
    });

    it('should return 404 for missing quote', async () => {
      mockGetQuoteById.mockResolvedValue(null);

      const response = await request(app).get('/api/v1/quotes/missing');

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/v1/quotes/:id', () => {
    it('should update a draft quote', async () => {
      mockUpdateQuote.mockResolvedValue({ id: 'q-1', clientName: 'Updated' });

      const response = await request(app)
        .put('/api/v1/quotes/q-1')
        .send({ clientName: 'Updated' });

      expect(response.status).toBe(200);
      expect(response.body.data.quote.clientName).toBe('Updated');
    });

    it('should return 404 for missing quote', async () => {
      mockUpdateQuote.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/v1/quotes/q-1')
        .send({ clientName: 'Updated' });

      expect(response.status).toBe(404);
    });

    it('should handle non-draft update error', async () => {
      const error = new Error('Cannot edit sent quote') as any;
      error.statusCode = 400;
      error.code = 'QUOTE_NOT_EDITABLE';
      mockUpdateQuote.mockRejectedValue(error);

      const response = await request(app)
        .put('/api/v1/quotes/q-1')
        .send({ clientName: 'Updated' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('QUOTE_NOT_EDITABLE');
    });
  });

  describe('DELETE /api/v1/quotes/:id', () => {
    it('should delete a quote', async () => {
      mockDeleteQuote.mockResolvedValue(true);

      const response = await request(app).delete('/api/v1/quotes/q-1');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Quote deleted successfully');
    });

    it('should return 404 for missing quote', async () => {
      mockDeleteQuote.mockResolvedValue(false);

      const response = await request(app).delete('/api/v1/quotes/missing');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/v1/quotes/:id/send', () => {
    it('should mark quote as sent', async () => {
      mockMarkAsSent.mockResolvedValue({ id: 'q-1', status: 'sent' });

      const response = await request(app).post('/api/v1/quotes/q-1/send');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Quote marked as sent');
    });

    it('should return 404 for non-draft quote', async () => {
      mockMarkAsSent.mockResolvedValue(null);

      const response = await request(app).post('/api/v1/quotes/q-1/send');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/v1/quotes/:id/accept', () => {
    it('should mark quote as accepted', async () => {
      mockMarkAsAccepted.mockResolvedValue({ id: 'q-1', status: 'accepted' });

      const response = await request(app).post('/api/v1/quotes/q-1/accept');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Quote marked as accepted');
    });

    it('should return 404 for non-sent quote', async () => {
      mockMarkAsAccepted.mockResolvedValue(null);

      const response = await request(app).post('/api/v1/quotes/q-1/accept');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/v1/quotes/:id/decline', () => {
    it('should mark quote as declined', async () => {
      mockMarkAsDeclined.mockResolvedValue({ id: 'q-1', status: 'declined' });

      const response = await request(app).post('/api/v1/quotes/q-1/decline');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Quote marked as declined');
    });
  });

  describe('POST /api/v1/quotes/:id/convert', () => {
    it('should convert quote to invoice', async () => {
      const result = { quote: { id: 'q-1', status: 'converted' }, invoice: { id: 'inv-1' } };
      mockConvertToInvoice.mockResolvedValue(result);

      const response = await request(app).post('/api/v1/quotes/q-1/convert');

      expect(response.status).toBe(200);
      expect(response.body.data.invoice.id).toBe('inv-1');
    });

    it('should return 404 for missing quote', async () => {
      mockConvertToInvoice.mockResolvedValue(null);

      const response = await request(app).post('/api/v1/quotes/missing/convert');

      expect(response.status).toBe(404);
    });

    it('should handle conversion error', async () => {
      const error = new Error('Quote already converted') as any;
      error.statusCode = 400;
      error.code = 'ALREADY_CONVERTED';
      mockConvertToInvoice.mockRejectedValue(error);

      const response = await request(app).post('/api/v1/quotes/q-1/convert');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ALREADY_CONVERTED');
    });
  });

  describe('GET /api/v1/quotes/:id/pdf', () => {
    it('should return PDF for existing quote', async () => {
      mockGetQuoteByIdRaw.mockResolvedValue({ id: 'q-1', quoteNumber: 'Q-001' });

      const response = await request(app).get('/api/v1/quotes/q-1/pdf');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
    });

    it('should return 404 for missing quote', async () => {
      mockGetQuoteByIdRaw.mockResolvedValue(null);

      const response = await request(app).get('/api/v1/quotes/missing/pdf');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/v1/quotes/:id/email', () => {
    beforeEach(() => {
      mockIsEmailConfigured.mockReturnValue(true);
      mockGetBusinessProfile.mockResolvedValue({ company_name: 'Test Co' });
      mockResolveInvoiceBcc.mockReturnValue(null);
      mockGetQuoteByIdRaw.mockResolvedValue({
        id: 'q-1',
        quoteNumber: 'QTE-0001',
        status: 'draft',
        notes: null,
      });
    });

    it('must not 200 when sendQuoteEmail succeeds but markAsSent returns no stamp', async () => {
      mockSendQuoteEmail.mockResolvedValue({ messageId: 'msg-discard' });
      mockMarkAsSent.mockResolvedValue(null);
      mockGetQuoteById.mockResolvedValue({ id: 'q-1', status: 'draft', sent_at: null });

      const response = await request(app)
        .post('/api/v1/quotes/q-1/email')
        .send({ recipientEmail: 'client@example.com' });

      expect(mockSendQuoteEmail).toHaveBeenCalled();
      expect(response.status).not.toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('SENT_AT_STAMP_FAILED');
    });

    it('must not 200 when markAsSent returns sent without sent_at', async () => {
      mockSendQuoteEmail.mockResolvedValue({ messageId: 'msg-nostamp' });
      mockMarkAsSent.mockResolvedValue({ id: 'q-1', status: 'sent' });
      mockGetQuoteById.mockResolvedValue({ id: 'q-1', status: 'sent' });

      const response = await request(app)
        .post('/api/v1/quotes/q-1/email')
        .send({ recipientEmail: 'client@example.com' });

      expect(response.status).not.toBe(200);
      expect(response.body.error).toBe('SENT_AT_STAMP_FAILED');
    });

    it('emails a draft and returns sent_at after a real stamp', async () => {
      mockSendQuoteEmail.mockResolvedValue({ messageId: 'msg-ok' });
      mockMarkAsSent.mockResolvedValue({
        id: 'q-1',
        status: 'sent',
        sent_at: '2026-08-24T07:00:00.000Z',
      });
      mockGetQuoteById.mockResolvedValue({
        id: 'q-1',
        status: 'sent',
        sent_at: '2026-08-24T07:00:00.000Z',
      });

      const response = await request(app)
        .post('/api/v1/quotes/q-1/email')
        .send({ recipientEmail: 'client@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.data.messageId).toBe('msg-ok');
      expect(response.body.data.quote.sent_at).toBe('2026-08-24T07:00:00.000Z');
      expect(mockMarkAsSent).toHaveBeenCalledWith('q-1', 'test-user-id');
    });
  });
});
