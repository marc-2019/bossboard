/**
 * Supplier cost routes. The authenticated user id is the only tenant key.
 */

import request from 'supertest';
import express, { Express } from 'express';

const USER_A = 'user-a';
const USER_B = 'user-b';
const PRODUCT_A = '11111111-1111-4111-8111-111111111111';
const SUPPLIER_A = '22222222-2222-4222-8222-222222222222';

const currentUser = { id: USER_A };

const mockList = jest.fn();
const mockGet = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../services/products.js', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../services/product-suppliers.js', () => ({
  __esModule: true,
  default: {
    listSupplierCosts: (...args: unknown[]) => mockList(...args),
    getSupplierCost: (...args: unknown[]) => mockGet(...args),
    createSupplierCost: (...args: unknown[]) => mockCreate(...args),
    updateSupplierCost: (...args: unknown[]) => mockUpdate(...args),
    deleteSupplierCost: (...args: unknown[]) => mockDelete(...args),
  },
}));

jest.mock('../../middleware/auth.js', () => ({
  authenticate: function (req: { user?: { userId: string } }, _res: unknown, next: () => void) {
    req.user = { userId: currentUser.id };
    next();
  },
}));

import productRoutes from '../../routes/products.js';
import { errorHandler } from '../../middleware/error.js';

function notFound(message: string): Error {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = 404;
  error.code = 'NOT_FOUND';
  return error;
}

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/v1/products', productRoutes);
  app.use(errorHandler);
});

beforeEach(() => {
  currentUser.id = USER_A;
  jest.clearAllMocks();
});

describe('supplier cost routes', () => {
  const stored = {
    id: SUPPLIER_A,
    user_id: USER_A,
    product_id: PRODUCT_A,
    supplier_name: 'Hardware Panel',
    cost_ex_gst_cents: 10000,
    source_tax_flag: 'inclusive',
    currency: 'NZD',
  };

  it('creates from price_includes_gst and returns the saved row', async () => {
    mockCreate.mockResolvedValue({ supplier: stored, product: null });

    const response = await request(app)
      .post(`/api/v1/products/${PRODUCT_A}/suppliers`)
      .send({
        supplier_name: 'Hardware Panel',
        cost_cents: 11500,
        price_includes_gst: true,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.supplier.cost_ex_gst_cents).toBe(10000);
    expect(mockCreate).toHaveBeenCalledWith(
      USER_A,
      PRODUCT_A,
      expect.objectContaining({
        supplierName: 'Hardware Panel',
        costCents: 11500,
        priceIncludesGst: true,
      }),
    );
  });

  it('rejects unknown GST for manual entry before the service runs', async () => {
    const response = await request(app)
      .post(`/api/v1/products/${PRODUCT_A}/suppliers`)
      .send({
        supplierName: 'Hardware Panel',
        costCents: 11500,
        sourceTaxFlag: 'unknown',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
    expect(response.body.message).toBe('Say whether this price includes GST before saving.');
    expect(response.body.message).not.toMatch(/priceIncludesGst|sourceTaxFlag|costCents|unknown/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 404 when another account reads, updates, or deletes a supplier row', async () => {
    currentUser.id = USER_B;
    mockList.mockRejectedValue(notFound('Product not found'));
    mockGet.mockRejectedValue(notFound('Supplier cost not found'));
    mockUpdate.mockRejectedValue(notFound('Supplier cost not found'));
    mockDelete.mockRejectedValue(notFound('Supplier cost not found'));

    const list = await request(app).get(`/api/v1/products/${PRODUCT_A}/suppliers`);
    const getOne = await request(app).get(
      `/api/v1/products/${PRODUCT_A}/suppliers/${SUPPLIER_A}`,
    );
    const update = await request(app)
      .put(`/api/v1/products/${PRODUCT_A}/suppliers/${SUPPLIER_A}`)
      .send({ supplierName: 'Stolen', userId: USER_A });
    const remove = await request(app)
      .delete(`/api/v1/products/${PRODUCT_A}/suppliers/${SUPPLIER_A}`)
      .send({ userId: USER_A });

    expect(list.status).toBe(404);
    expect(getOne.status).toBe(404);
    expect(update.status).toBe(404);
    expect(remove.status).toBe(404);
    expect(list.body.error).toBe('NOT_FOUND');
    expect(mockList).toHaveBeenCalledWith(USER_B, PRODUCT_A);
    expect(mockGet).toHaveBeenCalledWith(USER_B, PRODUCT_A, SUPPLIER_A);
    expect(mockUpdate).toHaveBeenCalledWith(
      USER_B,
      PRODUCT_A,
      SUPPLIER_A,
      expect.not.objectContaining({ userId: USER_A }),
    );
    expect(mockDelete).toHaveBeenCalledWith(USER_B, PRODUCT_A, SUPPLIER_A);
  });

  it('uses plain wording when GST or the link is missing', async () => {
    const missingGst = await request(app)
      .post(`/api/v1/products/${PRODUCT_A}/suppliers`)
      .send({ supplierName: 'Hardware Panel', costCents: 1000 });
    expect(missingGst.status).toBe(400);
    expect(missingGst.body.message).toBe('Tick whether the price includes GST.');

    const split = await request(app)
      .put(`/api/v1/products/${PRODUCT_A}/suppliers/${SUPPLIER_A}`)
      .send({ priceIncludesGst: true });
    expect(split.status).toBe(400);
    expect(split.body.message).toBe(
      'Enter the cost and say whether it includes GST. Send both together.',
    );

    const badDate = await request(app)
      .post(`/api/v1/products/${PRODUCT_A}/suppliers`)
      .send({
        supplierName: 'Hardware Panel',
        costCents: 1000,
        priceIncludesGst: false,
        checkedAt: 'yesterday',
      });
    expect(badDate.status).toBe(400);
    expect(badDate.body.message).toBe('Enter a real date, like 2026-11-19.');

    const badProduct = await request(app).get('/api/v1/products/not-a-uuid/suppliers');
    expect(badProduct.status).toBe(400);
    expect(badProduct.body.message).toBe('That product link is not valid.');

    const badSupplier = await request(app).get(
      `/api/v1/products/${PRODUCT_A}/suppliers/not-a-uuid`,
    );
    expect(badSupplier.status).toBe(400);
    expect(badSupplier.body.message).toBe('That supplier cost link is not valid.');

    for (const message of [
      missingGst.body.message,
      split.body.message,
      badDate.body.message,
      badProduct.body.message,
      badSupplier.body.message,
    ]) {
      expect(message).not.toMatch(/priceIncludesGst|sourceTaxFlag|costCents|checkedAt|UUID/);
    }
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('lists only the rows the service returns for the authenticated user', async () => {
    mockList.mockResolvedValue([stored]);
    const response = await request(app).get(`/api/v1/products/${PRODUCT_A}/suppliers`);
    expect(response.status).toBe(200);
    expect(response.body.data.suppliers).toEqual([stored]);
    expect(mockList).toHaveBeenCalledWith(USER_A, PRODUCT_A);
  });
});
