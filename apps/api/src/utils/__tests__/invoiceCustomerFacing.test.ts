import { customerFacingInvoiceStatus } from '../invoiceCustomerFacing.js';

describe('customerFacingInvoiceStatus', () => {
  it('returns PAID for paid', () => {
    expect(customerFacingInvoiceStatus('paid')).toBe('PAID');
    expect(customerFacingInvoiceStatus('PAID')).toBe('PAID');
  });

  it('returns OVERDUE for overdue', () => {
    expect(customerFacingInvoiceStatus('overdue')).toBe('OVERDUE');
  });

  it('hides draft and sent (tradie workflow only)', () => {
    expect(customerFacingInvoiceStatus('draft')).toBeNull();
    expect(customerFacingInvoiceStatus('sent')).toBeNull();
  });

  it('hides null/empty/unknown', () => {
    expect(customerFacingInvoiceStatus(null)).toBeNull();
    expect(customerFacingInvoiceStatus(undefined)).toBeNull();
    expect(customerFacingInvoiceStatus('')).toBeNull();
    expect(customerFacingInvoiceStatus('void')).toBeNull();
  });
});
