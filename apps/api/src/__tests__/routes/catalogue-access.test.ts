/**
 * HTTP coverage for catalogue reads. Service tests own the predicate proof.
 * These fail the same way when the scope checks allow a refusal case.
 */

import request from 'supertest';
import express, { Express } from 'express';

const mockDbQuery = jest.fn();
jest.mock('../../services/database.js', () => ({
  __esModule: true,
  default: {
    query: (...args: unknown[]) => mockDbQuery(...args),
  },
}));

jest.mock('../../services/invoices.js', () => ({
  __esModule: true,
  default: { createInvoice: jest.fn() },
}));

jest.mock('../../middleware/auth.js', () => ({
  authenticate(req: { header: (name: string) => string | undefined; user?: { userId: string; email: string } }, _res: unknown, next: () => void) {
    req.user = { userId: req.header('x-user-id') || 'nobody', email: 't@example.com' };
    next();
  },
}));

import productRoutes from '../../routes/products.js';
import gettingStartedRoutes from '../../routes/getting-started.js';
import recurringRoutes from '../../routes/recurring-invoices.js';
import teamRoutes from '../../routes/teams.js';
import { errorHandler } from '../../middleware/error.js';

const SECRET = 424242;
const NOW = new Date('2026-11-19T00:00:00.000Z');

function secretProduct(ownerId = 'boss'): Record<string, unknown> {
  return {
    id: 'prod-secret',
    user_id: ownerId,
    team_id: 'team-a',
    name: 'Secret widget',
    description: 'supplier cost',
    unit_price: SECRET,
    unit_cost: SECRET,
    default_margin_percent: 42.5,
    unit_cost_is_annual: false,
    type: 'fixed',
    is_gst_applicable: true,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
  };
}

function memberRow(access: string) {
  return {
    id: 'member-2',
    team_id: 'team-a',
    user_id: 'apprentice',
    role: 'worker',
    invite_status: 'accepted',
    invited_by: 'admin',
    invited_email: null,
    invited_at: NOW,
    accepted_at: NOW,
    created_at: NOW,
    updated_at: NOW,
    catalogue_access: access,
  };
}

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/v1/products', productRoutes);
  app.use('/api/v1/getting-started', gettingStartedRoutes);
  app.use('/api/v1/recurring-invoices', recurringRoutes);
  app.use('/api/v1/teams', teamRoutes);
  app.use(errorHandler);
});

beforeEach(() => {
  mockDbQuery.mockReset();
});

describe('catalogue HTTP routes', () => {
  it('MUST-FAIL: none cannot list, search, or get catalogue prices', async () => {
    const none = { team_id: 'team-a', role: 'worker', catalogue_access: 'none' };
    const row = secretProduct();

    mockDbQuery.mockResolvedValueOnce({ rows: [none] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [row] });
    const listed = await request(app).get('/api/v1/products').set('x-user-id', 'apprentice');
    expect(listed.status).toBe(200);
    expect(listed.body.data.products).toEqual([]);
    expect(JSON.stringify(listed.body)).not.toContain(String(SECRET));

    mockDbQuery.mockResolvedValueOnce({ rows: [none] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [row] });
    const searched = await request(app)
      .get('/api/v1/products')
      .query({ search: 'Secret' })
      .set('x-user-id', 'apprentice');
    expect(searched.status).toBe(200);
    expect(searched.body.data.products).toEqual([]);
    expect(JSON.stringify(searched.body)).not.toContain(String(SECRET));
    const searchSql = String(mockDbQuery.mock.calls[mockDbQuery.mock.calls.length - 2][0]);
    expect(searchSql).toContain('ILIKE');

    mockDbQuery.mockResolvedValueOnce({ rows: [none] });
    mockDbQuery.mockResolvedValueOnce({ rows: [row] });
    const got = await request(app).get('/api/v1/products/prod-secret').set('x-user-id', 'apprentice');
    expect(got.status).toBe(404);
    expect(JSON.stringify(got.body)).not.toContain(String(SECRET));
  });

  it('MUST-FAIL: none getting-started count does not open the team catalogue', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ product_tour_completed_at: null, getting_started_dismissed_at: null }],
    });
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ team_id: 'team-a', role: 'worker', catalogue_access: 'none' }],
    });
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        products: '0',
        customers: '0',
        invoices: '0',
        sent_invoices: '0',
        has_company: '0',
        has_bank: '0',
      }],
    });

    const response = await request(app).get('/api/v1/getting-started').set('x-user-id', 'apprentice');
    expect(response.status).toBe(200);
    const countCall = mockDbQuery.mock.calls[2];
    expect(String(countCall[0])).toContain('products_services');
    expect(String(countCall[0])).toContain('IS TRUE');
    expect((countCall[1] as unknown[])[1]).toBe(false);
    expect((countCall[1] as unknown[])[2]).toBe('team-a');
  });

  it('MUST-FAIL: none cannot read catalogue prices via recurring-from-invoice', async () => {
    mockDbQuery.mockResolvedValueOnce({
      rows: [{
        id: '11111111-1111-1111-1111-111111111111',
        user_id: 'apprentice',
        customer_id: '22222222-2222-2222-2222-222222222222',
        invoice_number: 'INV-1',
        include_gst: true,
        notes: null,
        created_at: NOW,
        line_items: [{ description: 'Secret widget', amount: 100 }],
      }],
    });
    mockDbQuery.mockResolvedValueOnce({
      rows: [{ team_id: 'team-a', role: 'worker', catalogue_access: 'none' }],
    });
    mockDbQuery.mockResolvedValueOnce({ rows: [secretProduct()] });

    const response = await request(app)
      .post('/api/v1/recurring-invoices/from-invoice/11111111-1111-1111-1111-111111111111')
      .set('x-user-id', 'apprentice')
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('CATALOGUE_FORBIDDEN');
    expect(JSON.stringify(response.body)).not.toContain(String(SECRET));
  });

  it('MUST-FAIL: another team, a solo user, and a leaver cannot change the product', async () => {
    const cases = [
      { userId: 'other', actor: { team_id: 'team-b', role: 'worker', catalogue_access: 'edit' }, ownerId: 'boss' },
      { userId: 'solo', actor: { team_id: null, role: null, catalogue_access: null }, ownerId: 'boss' },
      { userId: 'leaver', actor: { team_id: null, role: null, catalogue_access: null }, ownerId: 'leaver' },
    ];

    for (const item of cases) {
      mockDbQuery.mockResolvedValueOnce({ rows: [item.actor] });
      mockDbQuery.mockResolvedValueOnce({ rows: [secretProduct(item.ownerId)] });
      const updated = await request(app)
        .put('/api/v1/products/prod-secret')
        .set('x-user-id', item.userId)
        .send({ name: 'hacked' });
      expect(updated.status).toBe(404);
      expect(JSON.stringify(updated.body)).not.toContain(String(SECRET));

      mockDbQuery.mockResolvedValueOnce({ rows: [item.actor] });
      mockDbQuery.mockResolvedValueOnce({ rows: [secretProduct(item.ownerId)] });
      const removed = await request(app)
        .delete('/api/v1/products/prod-secret')
        .set('x-user-id', item.userId);
      expect(removed.status).toBe(404);
      expect(JSON.stringify(removed.body)).not.toContain(String(SECRET));
    }
  });

  it('MUST-FAIL: a view member cannot add, update, or delete over HTTP', async () => {
    const view = { team_id: 'team-a', role: 'worker', catalogue_access: 'view' };

    mockDbQuery.mockResolvedValueOnce({ rows: [view] });
    const created = await request(app)
      .post('/api/v1/products')
      .set('x-user-id', 'viewer')
      .send({ name: 'New', unitPrice: 100 });
    expect(created.status).toBe(403);
    expect(created.body.error).toBe('CATALOGUE_FORBIDDEN');

    mockDbQuery.mockResolvedValueOnce({ rows: [view] });
    mockDbQuery.mockResolvedValueOnce({ rows: [secretProduct()] });
    const read = await request(app).get('/api/v1/products/prod-secret').set('x-user-id', 'viewer');
    expect(read.status).toBe(200);
    expect(read.body.data.product.unit_price).toBe(SECRET);

    mockDbQuery.mockResolvedValueOnce({ rows: [view] });
    mockDbQuery.mockResolvedValueOnce({ rows: [secretProduct()] });
    const updated = await request(app)
      .put('/api/v1/products/prod-secret')
      .set('x-user-id', 'viewer')
      .send({ name: 'hacked' });
    expect(updated.status).toBe(403);

    mockDbQuery.mockResolvedValueOnce({ rows: [view] });
    mockDbQuery.mockResolvedValueOnce({ rows: [secretProduct()] });
    const removed = await request(app)
      .delete('/api/v1/products/prod-secret')
      .set('x-user-id', 'viewer');
    expect(removed.status).toBe(403);
  });

  it('MUST-FAIL: a worker cannot grant catalogue access over HTTP', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'worker' }] });
    const self = await request(app)
      .patch('/api/v1/teams/team-a/members/apprentice')
      .set('x-user-id', 'apprentice')
      .send({ catalogueAccess: 'edit' });
    expect(self.status).toBe(403);
    expect(self.body.error).toBe('INSUFFICIENT_ROLE');

    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'worker' }] });
    const other = await request(app)
      .patch('/api/v1/teams/team-a/members/other-worker')
      .set('x-user-id', 'apprentice')
      .send({ catalogueAccess: 'edit' });
    expect(other.status).toBe(403);
    expect(mockDbQuery.mock.calls.some((call) => String(call[0]).includes('SET catalogue_access'))).toBe(false);
  });

  it('an admin can grant and revoke catalogue access over HTTP', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'worker' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [memberRow('edit')] });
    const granted = await request(app)
      .patch('/api/v1/teams/team-a/members/apprentice')
      .set('x-user-id', 'admin')
      .send({ catalogueAccess: 'edit' });
    expect(granted.status).toBe(200);
    expect(granted.body.data.member.catalogueAccess).toBe('edit');

    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'worker' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [memberRow('none')] });
    const revoked = await request(app)
      .patch('/api/v1/teams/team-a/members/apprentice')
      .set('x-user-id', 'admin')
      .send({ catalogueAccess: 'none' });
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.member.catalogueAccess).toBe('none');
  });
});
