/**
 * Public Route Tests
 * No authentication required. Renders server-side HTML for shared invoices.
 */

import request from 'supertest';
import express, { Express } from 'express';

// Mock services
const mockGetInvoiceByShareToken = jest.fn();

jest.mock('../../services/invoices.js', () => ({
  __esModule: true,
  default: {
    getInvoiceByShareToken: mockGetInvoiceByShareToken,
  },
}));

// documents service pulls ESM uuid — mock so public routes load in Jest
jest.mock('../../services/documents.js', () => ({
  __esModule: true,
  DOCUMENT_DISCLAIMER: 'Disclaimer',
  default: {
    listDocumentsForInvoice: jest.fn().mockResolvedValue([]),
    getDocument: jest.fn(),
    getDocumentsUploadDir: jest.fn().mockReturnValue('/tmp'),
  },
}));

jest.mock('../../services/stripe.js', () => ({
  __esModule: true,
  getOrCreateInvoicePaymentLink: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../utils/path-safe.js', () => ({
  __esModule: true,
  isPathInside: jest.fn().mockReturnValue(true),
}));

jest.mock('../../config/index.js', () => ({
  config: { appName: 'BossBoard', port: 29001 },
}));

import publicRoutes from '../../routes/public.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use('/api/v1/public', publicRoutes);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Public Routes', () => {
  // =========================================================================
  // GET /invoices/:token
  // =========================================================================
  describe('GET /api/v1/public/invoices/:token', () => {
    const mockInvoice = {
      id: 'inv-1',
      invoice_number: 'INV-0001',
      status: 'sent',
      client_name: 'John Smith',
      client_email: 'john@example.com',
      client_phone: '021-123-456',
      subtotal: 10000,
      gst_amount: 1500,
      total: 11500,
      due_date: '2026-02-01',
      line_items: [
        { description: 'Electrical installation', amount: 10000 },
      ],
      company_name: 'Armstrong Electrical Ltd',
      company_address: '1 Main Street, Auckland',
      company_email: 'info@armstrong.co.nz',
      gst_number: '123-456-789',
      bank_account_name: 'Armstrong Electrical Ltd',
      bank_account_number: '02-0000-0000000-00',
    };

    it('should render HTML invoice page for valid token', async () => {
      mockGetInvoiceByShareToken.mockResolvedValue(mockInvoice);

      const response = await request(app).get(
        '/api/v1/public/invoices/validtoken12345678'
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.text).toContain('INV-0001');
      expect(mockGetInvoiceByShareToken).toHaveBeenCalledWith('validtoken12345678');
    });

    it('should include client name in rendered invoice', async () => {
      mockGetInvoiceByShareToken.mockResolvedValue(mockInvoice);

      const response = await request(app).get(
        '/api/v1/public/invoices/validtoken12345678'
      );

      expect(response.text).toContain('John Smith');
    });

    it('should include company name in rendered invoice', async () => {
      mockGetInvoiceByShareToken.mockResolvedValue(mockInvoice);

      const response = await request(app).get(
        '/api/v1/public/invoices/validtoken12345678'
      );

      expect(response.text).toContain('Armstrong Electrical Ltd');
    });

    it('should include payment details in rendered invoice', async () => {
      mockGetInvoiceByShareToken.mockResolvedValue(mockInvoice);

      const response = await request(app).get(
        '/api/v1/public/invoices/validtoken12345678'
      );

      expect(response.text).toContain('02-0000-0000000-00');
    });

    it('should include line items in rendered invoice', async () => {
      mockGetInvoiceByShareToken.mockResolvedValue(mockInvoice);

      const response = await request(app).get(
        '/api/v1/public/invoices/validtoken12345678'
      );

      expect(response.text).toContain('Electrical installation');
    });

    it('should show GST row when gst_amount is non-zero', async () => {
      mockGetInvoiceByShareToken.mockResolvedValue(mockInvoice);

      const response = await request(app).get(
        '/api/v1/public/invoices/validtoken12345678'
      );

      expect(response.text).toContain('GST');
    });

    it('should show discount row when discount_amount is non-zero', async () => {
      mockGetInvoiceByShareToken.mockResolvedValue({
        ...mockInvoice,
        discount_type: 'percent',
        discount_value: 10,
        discount_amount: 1000,
        discount_label: 'Mate rate',
        subtotal: 10000,
        gst_amount: 1350,
        total: 10350,
      });

      const response = await request(app).get(
        '/api/v1/public/invoices/validtoken12345678'
      );

      expect(response.text).toContain('Mate rate');
      expect(response.text).toContain('10%');
      expect(response.text).toMatch(/-.*\$10\.00|-\$10\.00/);
    });

    it('should render PAID status badge for paid invoice', async () => {
      mockGetInvoiceByShareToken.mockResolvedValue({
        ...mockInvoice,
        status: 'paid',
        paid_at: '2026-01-15',
      });

      const response = await request(app).get(
        '/api/v1/public/invoices/validtoken12345678'
      );

      expect(response.status).toBe(200);
      expect(response.text).toContain('PAID');
    });

    it('should render OVERDUE status badge for overdue invoice', async () => {
      mockGetInvoiceByShareToken.mockResolvedValue({
        ...mockInvoice,
        status: 'overdue',
      });

      const response = await request(app).get(
        '/api/v1/public/invoices/validtoken12345678'
      );

      expect(response.status).toBe(200);
      expect(response.text).toContain('OVERDUE');
    });

    it('should not show DRAFT or SENT status to customers', async () => {
      mockGetInvoiceByShareToken.mockResolvedValue({
        ...mockInvoice,
        status: 'draft',
      });

      const draftRes = await request(app).get(
        '/api/v1/public/invoices/validtoken12345678'
      );
      expect(draftRes.status).toBe(200);
      expect(draftRes.text).not.toContain('DRAFT');

      mockGetInvoiceByShareToken.mockResolvedValue({
        ...mockInvoice,
        status: 'sent',
      });
      const sentRes = await request(app).get(
        '/api/v1/public/invoices/validtoken12345678'
      );
      expect(sentRes.status).toBe(200);
      expect(sentRes.text).not.toContain('DRAFT');
      // SENT badge must not appear; invoice content still renders
      expect(sentRes.text).not.toMatch(/class="status[^"]*"[^>]*>SENT</);
      expect(sentRes.text).toContain('INV-0001');
    });

    it('should return 404 HTML page when invoice not found', async () => {
      mockGetInvoiceByShareToken.mockResolvedValue(null);

      const response = await request(app).get(
        '/api/v1/public/invoices/expiredtoken12345'
      );

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.text).toContain('Invoice Not Found');
    });

    it('should return 400 HTML page for short/invalid token', async () => {
      const response = await request(app).get('/api/v1/public/invoices/short');

      expect(response.status).toBe(400);
      expect(response.text).toContain('Invalid Link');
    });

    it('should escape HTML in invoice fields to prevent XSS', async () => {
      mockGetInvoiceByShareToken.mockResolvedValue({
        ...mockInvoice,
        client_name: '<script>alert("xss")</script>',
        invoice_number: 'INV-<b>001</b>',
      });

      const response = await request(app).get(
        '/api/v1/public/invoices/validtoken12345678'
      );

      expect(response.text).not.toContain('<script>');
      expect(response.text).toContain('&lt;script&gt;');
      expect(response.text).not.toContain('<b>001</b>');
    });

    it('should include international payment details when IBAN present', async () => {
      mockGetInvoiceByShareToken.mockResolvedValue({
        ...mockInvoice,
        intl_iban: 'GB33BUKB20201555555555',
        intl_swift_bic: 'BUKBGB22',
        intl_bank_name: 'Barclays',
        intl_bank_account_name: 'Armstrong Electrical',
      });

      const response = await request(app).get(
        '/api/v1/public/invoices/validtoken12345678'
      );

      expect(response.text).toContain('GB33BUKB20201555555555');
      expect(response.text).toContain('BUKBGB22');
    });

    it('should render invoice without optional fields gracefully', async () => {
      // Minimal invoice — no company, no email, no phone
      mockGetInvoiceByShareToken.mockResolvedValue({
        id: 'inv-2',
        invoice_number: 'INV-0002',
        status: 'sent',
        client_name: 'Jane Doe',
        subtotal: 5000,
        gst_amount: 0,
        total: 5000,
        line_items: [{ description: 'Labour', amount: 5000 }],
      });

      const response = await request(app).get(
        '/api/v1/public/invoices/validtoken12345678'
      );

      expect(response.status).toBe(200);
      expect(response.text).toContain('Jane Doe');
      expect(response.text).toContain('INV-0002');
    });

    it('should return 500 HTML page on unexpected service error', async () => {
      mockGetInvoiceByShareToken.mockRejectedValue(new Error('DB failure'));

      const response = await request(app).get(
        '/api/v1/public/invoices/validtoken12345678'
      );

      expect(response.status).toBe(500);
      expect(response.text).toContain('Something went wrong');
    });
  });
});
