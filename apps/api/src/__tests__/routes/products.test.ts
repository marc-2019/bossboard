/**
 * Products/Services Route Tests
 */

import request from 'supertest';
import express, { Express } from 'express';

// Mock services
const mockCreateProduct = jest.fn();
const mockListProducts = jest.fn();
const mockGetProductById = jest.fn();
const mockUpdateProduct = jest.fn();
const mockDeleteProduct = jest.fn();

jest.mock('../../services/products.js', () => ({
  __esModule: true,
  default: {
    createProduct: mockCreateProduct,
    listProducts: mockListProducts,
    getProductById: mockGetProductById,
    updateProduct: mockUpdateProduct,
    deleteProduct: mockDeleteProduct,
  },
}));

jest.mock('../../services/product-suppliers.js', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../middleware/auth.js', () => ({
  authenticate: function (req: any, _res: any, next: any) {
    req.user = { userId: 'test-user-id', email: 'test@example.com' };
    next();
  },
}));

import productRoutes from '../../routes/products.js';
import { errorHandler } from '../../middleware/error.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/v1/products', productRoutes);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Product Routes', () => {
  const validProduct = {
    name: 'Electrical Installation',
    description: 'Standard residential installation',
    unitPrice: 25000,
    type: 'fixed',
    isGstApplicable: true,
  };

  // =========================================================================
  // POST /
  // =========================================================================
  describe('POST /api/v1/products', () => {
    it('should create a product successfully', async () => {
      const mockCreated = { id: 'prod-1', ...validProduct, isActive: true };
      mockCreateProduct.mockResolvedValue(mockCreated);

      const response = await request(app)
        .post('/api/v1/products')
        .send(validProduct);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.product.id).toBe('prod-1');
      expect(response.body.data.product.name).toBe('Electrical Installation');
      expect(response.body.message).toContain('created');
      expect(mockCreateProduct).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ name: 'Electrical Installation', unitPrice: 25000 })
      );
    });

    it('should create with only required fields (name and unitPrice)', async () => {
      const mockCreated = { id: 'prod-2', name: 'Labour', unitPrice: 10000 };
      mockCreateProduct.mockResolvedValue(mockCreated);

      const response = await request(app)
        .post('/api/v1/products')
        .send({ name: 'Labour', unitPrice: 10000 });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should reject missing name', async () => {
      const response = await request(app)
        .post('/api/v1/products')
        .send({ unitPrice: 10000 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject missing unitPrice', async () => {
      const response = await request(app)
        .post('/api/v1/products')
        .send({ name: 'Labour' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject negative unitPrice', async () => {
      const response = await request(app)
        .post('/api/v1/products')
        .send({ name: 'Labour', unitPrice: -100 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should accept zero unitPrice (free item)', async () => {
      mockCreateProduct.mockResolvedValue({ id: 'prod-3', name: 'Free Consult', unitPrice: 0 });

      const response = await request(app)
        .post('/api/v1/products')
        .send({ name: 'Free Consult', unitPrice: 0 });

      expect(response.status).toBe(201);
    });

    it('should reject non-integer unitPrice', async () => {
      const response = await request(app)
        .post('/api/v1/products')
        .send({ name: 'Labour', unitPrice: 10000.5 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid product type', async () => {
      const response = await request(app)
        .post('/api/v1/products')
        .send({ name: 'Labour', unitPrice: 10000, type: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should accept valid product types: fixed and variable', async () => {
      for (const type of ['fixed', 'variable'] as const) {
        mockCreateProduct.mockResolvedValue({ id: `prod-${type}`, name: 'Test', unitPrice: 0, type });

        const response = await request(app)
          .post('/api/v1/products')
          .send({ name: 'Test', unitPrice: 0, type });

        expect(response.status).toBe(201);
      }
    });

  });

  // =========================================================================
  // GET /
  // =========================================================================
  describe('GET /api/v1/products', () => {
    it('should list products with no filters', async () => {
      const mockResult = {
        products: [{ id: 'prod-1', name: 'Labour', unitPrice: 10000, isActive: true }],
        total: 1,
      };
      mockListProducts.mockResolvedValue(mockResult);

      const response = await request(app).get('/api/v1/products');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.products).toHaveLength(1);
      expect(mockListProducts).toHaveBeenCalledWith('test-user-id', {
        search: undefined,
        type: undefined,
        limit: undefined,
        offset: undefined,
      });
    });

    it('should pass search filter', async () => {
      mockListProducts.mockResolvedValue({ products: [], total: 0 });

      await request(app).get('/api/v1/products?search=electrical');

      expect(mockListProducts).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ search: 'electrical' })
      );
    });

    it('should pass type filter', async () => {
      mockListProducts.mockResolvedValue({ products: [], total: 0 });

      await request(app).get('/api/v1/products?type=fixed');

      expect(mockListProducts).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ type: 'fixed' })
      );
    });

    it('should pass pagination parameters as integers', async () => {
      mockListProducts.mockResolvedValue({ products: [], total: 0 });

      await request(app).get('/api/v1/products?limit=25&offset=50');

      expect(mockListProducts).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({ limit: 25, offset: 50 })
      );
    });
  });

  // =========================================================================
  // GET /:id
  // =========================================================================
  describe('GET /api/v1/products/:id', () => {
    it('should return a product by ID', async () => {
      const mockProduct = { id: 'prod-1', name: 'Labour', unitPrice: 10000 };
      mockGetProductById.mockResolvedValue(mockProduct);

      const response = await request(app).get('/api/v1/products/prod-1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.product.id).toBe('prod-1');
      expect(mockGetProductById).toHaveBeenCalledWith('prod-1', 'test-user-id');
    });

    it('should return 404 when product not found', async () => {
      mockGetProductById.mockResolvedValue(null);

      const response = await request(app).get('/api/v1/products/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // PUT /:id
  // =========================================================================
  describe('PUT /api/v1/products/:id', () => {
    it('should update a product successfully', async () => {
      const mockUpdated = { id: 'prod-1', name: 'Updated Labour', unitPrice: 12000 };
      mockUpdateProduct.mockResolvedValue(mockUpdated);

      const response = await request(app)
        .put('/api/v1/products/prod-1')
        .send({ name: 'Updated Labour', unitPrice: 12000 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.product.name).toBe('Updated Labour');
      expect(response.body.message).toContain('updated');
      expect(mockUpdateProduct).toHaveBeenCalledWith(
        'prod-1',
        'test-user-id',
        expect.objectContaining({ name: 'Updated Labour' })
      );
    });

    it('should allow nullable description', async () => {
      mockUpdateProduct.mockResolvedValue({ id: 'prod-1', name: 'Test', description: null });

      const response = await request(app)
        .put('/api/v1/products/prod-1')
        .send({ description: null });

      expect(response.status).toBe(200);
    });

    it('should reject empty name in update', async () => {
      const response = await request(app)
        .put('/api/v1/products/prod-1')
        .send({ name: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should allow deactivating a product via isActive flag', async () => {
      mockUpdateProduct.mockResolvedValue({ id: 'prod-1', name: 'Test', isActive: false });

      const response = await request(app)
        .put('/api/v1/products/prod-1')
        .send({ isActive: false });

      expect(response.status).toBe(200);
    });

    it('should return 404 when product not found', async () => {
      mockUpdateProduct.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/v1/products/nonexistent')
        .send({ name: 'Test' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // DELETE /:id
  // =========================================================================
  describe('DELETE /api/v1/products/:id', () => {
    it('should soft-delete a product', async () => {
      mockDeleteProduct.mockResolvedValue(true);

      const response = await request(app).delete('/api/v1/products/prod-1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deactivated');
      expect(mockDeleteProduct).toHaveBeenCalledWith('prod-1', 'test-user-id');
    });

    it('should return 404 when product not found', async () => {
      mockDeleteProduct.mockResolvedValue(false);

      const response = await request(app).delete('/api/v1/products/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // Error-path coverage — every handler forwards service errors via next(error).
  // =========================================================================
  describe('Service error forwarding', () => {
    it('POST / forwards service errors to the error handler', async () => {
      mockCreateProduct.mockRejectedValue(new Error('db down'));

      const response = await request(app)
        .post('/api/v1/products')
        .send({ name: 'Widget', unitPrice: 1000 });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('GET / forwards service errors to the error handler', async () => {
      mockListProducts.mockRejectedValue(new Error('db down'));

      const response = await request(app).get('/api/v1/products');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('GET /:id forwards service errors to the error handler', async () => {
      mockGetProductById.mockRejectedValue(new Error('db down'));

      const response = await request(app).get('/api/v1/products/prod-1');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('PUT /:id forwards service errors to the error handler', async () => {
      mockUpdateProduct.mockRejectedValue(new Error('db down'));

      const response = await request(app)
        .put('/api/v1/products/prod-1')
        .send({ name: 'Updated' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('DELETE /:id forwards service errors to the error handler', async () => {
      mockDeleteProduct.mockRejectedValue(new Error('db down'));

      const response = await request(app).delete('/api/v1/products/prod-1');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });
});
