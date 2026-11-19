/**
 * Team catalogue scope. MUST-FAIL cases deny access.
 * They fail if productVisibleTo, productEditableBy, canReadTeamCatalogue,
 * canEditTeamCatalogue, or callerMaySetCatalogueAccess allow the refusal case.
 */

import fs from 'fs';
import path from 'path';

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

import {
  actorFromRow,
  callerMaySetCatalogueAccess,
  canEditTeamCatalogue,
  canReadTeamCatalogue,
  productEditableBy,
  productVisibleTo,
  type CatalogueActor,
} from '../../services/catalogue-access.js';
import {
  createProduct,
  deleteProduct,
  getProductById,
  listProducts,
  updateProduct,
} from '../../services/products.js';
import { createRecurringFromInvoice } from '../../services/recurring-invoices.js';
import teamsService from '../../services/teams.js';

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

function mockActor(row: Record<string, unknown>): void {
  mockDbQuery.mockResolvedValueOnce({ rows: [row] });
}

function assertNoSecret(value: unknown): void {
  expect(JSON.stringify(value ?? null)).not.toContain(String(SECRET));
}

const outsiders: { label: string; userId: string; actor: Record<string, unknown>; ownerId: string }[] = [
  {
    label: 'a user in another team',
    userId: 'other',
    actor: { team_id: 'team-b', role: 'worker', catalogue_access: 'edit' },
    ownerId: 'boss',
  },
  {
    label: 'a solo user',
    userId: 'solo',
    actor: { team_id: null, role: null, catalogue_access: null },
    ownerId: 'boss',
  },
  {
    label: 'a user who has left the team',
    userId: 'leaver',
    actor: { team_id: null, role: null, catalogue_access: null },
    ownerId: 'leaver',
  },
];

beforeEach(() => {
  mockDbQuery.mockReset();
});

describe('catalogue scope predicates', () => {
  it.each(outsiders)('MUST-FAIL: $label cannot see or edit the team product', ({ userId, actor, ownerId }) => {
    const who = actorFromRow(userId, actor);
    const row = { team_id: 'team-a', user_id: ownerId };
    expect(productVisibleTo(who, row)).toBe(false);
    expect(productEditableBy(who, row)).toBe(false);
  });

  it('MUST-FAIL: a view member can read but cannot edit', () => {
    const view = actorFromRow('viewer', {
      team_id: 'team-a',
      role: 'worker',
      catalogue_access: 'view',
    });
    const row = { team_id: 'team-a', user_id: 'boss' };
    expect(canReadTeamCatalogue(view)).toBe(true);
    expect(canEditTeamCatalogue(view)).toBe(false);
    expect(productVisibleTo(view, row)).toBe(true);
    expect(productEditableBy(view, row)).toBe(false);
  });

  it('MUST-FAIL: a none member cannot read or edit the team catalogue', () => {
    const none = actorFromRow('apprentice', {
      team_id: 'team-a',
      role: 'worker',
      catalogue_access: 'none',
    });
    const row = { team_id: 'team-a', user_id: 'boss' };
    expect(none.level).toBe('none');
    expect(canReadTeamCatalogue(none)).toBe(false);
    expect(canEditTeamCatalogue(none)).toBe(false);
    expect(productVisibleTo(none, row)).toBe(false);
    expect(productEditableBy(none, row)).toBe(false);
  });

  it('MUST-FAIL: a worker cannot grant catalogue access', () => {
    expect(callerMaySetCatalogueAccess('worker')).toBe(false);
    expect(callerMaySetCatalogueAccess(null)).toBe(false);
  });

  it('owner and admin stay edit even when the stored level is none', () => {
    const owner = actorFromRow('boss', {
      team_id: 'team-a',
      role: 'owner',
      catalogue_access: 'none',
    });
    const admin = actorFromRow('admin', {
      team_id: 'team-a',
      role: 'admin',
      catalogue_access: 'view',
    });
    expect(owner.level).toBe('edit');
    expect(admin.level).toBe('edit');
    expect(productEditableBy(owner, { team_id: 'team-a', user_id: 'boss' })).toBe(true);
    expect(callerMaySetCatalogueAccess('owner')).toBe(true);
    expect(callerMaySetCatalogueAccess('admin')).toBe(true);
  });

  it('a granted member and a solo owner can edit their rows', () => {
    const editor = actorFromRow('editor', {
      team_id: 'team-a',
      role: 'worker',
      catalogue_access: 'edit',
    });
    const solo: CatalogueActor = { userId: 'solo', teamId: null, role: null, level: null };
    expect(productEditableBy(editor, { team_id: 'team-a', user_id: 'boss' })).toBe(true);
    expect(productEditableBy(solo, { team_id: null, user_id: 'solo' })).toBe(true);
    expect(productVisibleTo(solo, { team_id: null, user_id: 'solo' })).toBe(true);
  });
});

describe('product service scope', () => {
  it.each(outsiders)(
    'MUST-FAIL: $label cannot read, update, or delete the team product',
    async ({ userId, actor, ownerId }) => {
      const row = secretProduct(ownerId);

      mockActor(actor);
      mockDbQuery.mockResolvedValueOnce({ rows: [row] });
      const read = await getProductById('prod-secret', userId);
      expect(read).toBeNull();
      assertNoSecret(read);
      const readParams = mockDbQuery.mock.calls[1][1] as unknown[];
      expect(String(mockDbQuery.mock.calls[1][0])).toContain('team_id = $4');
      if (userId === 'other') {
        expect(readParams[2]).toBe(true);
        expect(readParams[3]).toBe('team-b');
      } else {
        expect(readParams[2]).toBe(false);
        expect(readParams[3]).toBeNull();
      }

      mockActor(actor);
      mockDbQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      mockDbQuery.mockResolvedValueOnce({ rows: [row] });
      const listed = await listProducts(userId, { search: 'Secret' });
      expect(listed.products).toEqual([]);
      expect(listed.total).toBe(0);
      assertNoSecret(listed);
      const listParams = mockDbQuery.mock.calls[mockDbQuery.mock.calls.length - 2][1] as unknown[];
      if (userId === 'other') {
        expect(listParams[1]).toBe(true);
        expect(listParams[2]).toBe('team-b');
      } else {
        expect(listParams[1]).toBe(false);
        expect(listParams[2]).toBeNull();
      }

      mockActor(actor);
      mockDbQuery.mockResolvedValueOnce({ rows: [row] });
      await expect(updateProduct('prod-secret', userId, { name: 'hacked', unitPrice: 1 })).resolves.toBeNull();

      mockActor(actor);
      mockDbQuery.mockResolvedValueOnce({ rows: [row] });
      await expect(deleteProduct('prod-secret', userId)).resolves.toBe(false);

      const writes = mockDbQuery.mock.calls.filter((call) =>
        String(call[0]).startsWith('UPDATE products_services'),
      );
      expect(writes).toHaveLength(0);
    },
  );

  it('MUST-FAIL: a view member cannot add, update, or delete, and can read', async () => {
    const view = { team_id: 'team-a', role: 'worker', catalogue_access: 'view' };
    const row = secretProduct();

    mockActor(view);
    await expect(createProduct('viewer', { name: 'New', unitPrice: 100 })).rejects.toMatchObject({
      code: 'CATALOGUE_FORBIDDEN',
      statusCode: 403,
    });
    expect(mockDbQuery.mock.calls.some((call) => String(call[0]).includes('INSERT INTO products_services'))).toBe(false);

    mockActor(view);
    mockDbQuery.mockResolvedValueOnce({ rows: [row] });
    const read = await getProductById('prod-secret', 'viewer');
    expect(read?.name).toBe('Secret widget');
    expect(read?.unit_price).toBe(SECRET);

    mockActor(view);
    mockDbQuery.mockResolvedValueOnce({ rows: [row] });
    await expect(updateProduct('prod-secret', 'viewer', { unitCost: 1 })).rejects.toMatchObject({
      code: 'CATALOGUE_FORBIDDEN',
      statusCode: 403,
    });

    mockActor(view);
    mockDbQuery.mockResolvedValueOnce({ rows: [row] });
    await expect(deleteProduct('prod-secret', 'viewer')).rejects.toMatchObject({
      code: 'CATALOGUE_FORBIDDEN',
      statusCode: 403,
    });

    const writes = mockDbQuery.mock.calls.filter((call) =>
      /^(UPDATE|INSERT) products_services/.test(String(call[0]).trim()),
    );
    expect(writes).toHaveLength(0);
  });

  it('MUST-FAIL: a none member cannot read list, get, or search prices', async () => {
    const none = { team_id: 'team-a', role: 'worker', catalogue_access: 'none' };
    const row = secretProduct();

    mockActor(none);
    mockDbQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [row] });
    const listed = await listProducts('apprentice', { search: 'Secret' });
    expect(listed.products).toEqual([]);
    expect(listed.total).toBe(0);
    assertNoSecret(listed);
    const countCall = mockDbQuery.mock.calls[1];
    expect(String(countCall[0])).toContain('ILIKE');
    expect((countCall[1] as unknown[])[1]).toBe(false);

    mockActor(none);
    mockDbQuery.mockResolvedValueOnce({ rows: [row] });
    const got = await getProductById('prod-secret', 'apprentice');
    expect(got).toBeNull();
    assertNoSecret(got);
    expect((mockDbQuery.mock.calls[mockDbQuery.mock.calls.length - 1][1] as unknown[])[2]).toBe(false);
  });

  it('a granted member can update a team product they did not create', async () => {
    mockActor({ team_id: 'team-a', role: 'worker', catalogue_access: 'edit' });
    mockDbQuery.mockResolvedValueOnce({ rows: [secretProduct()] });
    mockDbQuery.mockResolvedValueOnce({ rows: [secretProduct()] });
    const updated = await updateProduct('prod-secret', 'editor', { name: 'Secret widget' });
    expect(updated?.id).toBe('prod-secret');
    const sql = String(mockDbQuery.mock.calls[2][0]);
    expect(sql).toContain('IS TRUE');
    expect((mockDbQuery.mock.calls[2][1] as unknown[])).toContain(true);
  });

  it('an owner edits even when the stored catalogue level is none', async () => {
    mockActor({ team_id: 'team-a', role: 'owner', catalogue_access: 'none' });
    mockDbQuery.mockResolvedValueOnce({ rows: [secretProduct()] });
    mockDbQuery.mockResolvedValueOnce({ rowCount: 1 });
    await expect(deleteProduct('prod-secret', 'boss')).resolves.toBe(true);
    expect((mockDbQuery.mock.calls[2][1] as unknown[])[2]).toBe(true);
  });

  it('an admin can edit and a new product takes the creator team id', async () => {
    mockActor({ team_id: 'team-a', role: 'admin', catalogue_access: 'view' });
    mockDbQuery.mockResolvedValueOnce({ rows: [secretProduct()] });
    const created = await createProduct('admin-user', { name: 'Cable', unitPrice: 500 });
    expect(created.team_id).toBe('team-a');
    expect((mockDbQuery.mock.calls[1][1] as unknown[])[2]).toBe('team-a');
  });
});

describe('catalogue grant', () => {
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

  it('MUST-FAIL: a worker cannot grant themselves or anyone else edit', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'worker' }] });
    await expect(
      teamsService.setMemberCatalogueAccess('apprentice', 'team-a', 'apprentice', 'edit'),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE', statusCode: 403 });

    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'worker' }] });
    await expect(
      teamsService.setMemberCatalogueAccess('apprentice', 'team-a', 'other-worker', 'none'),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE', statusCode: 403 });

    expect(mockDbQuery.mock.calls.some((call) => String(call[0]).includes('SET catalogue_access'))).toBe(false);
  });

  it('an admin can grant edit and revoke it to view or none', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'worker' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [memberRow('edit')] });
    const granted = await teamsService.setMemberCatalogueAccess('admin', 'team-a', 'apprentice', 'edit');
    expect(granted.catalogueAccess).toBe('edit');

    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'worker' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [memberRow('view')] });
    const viewed = await teamsService.setMemberCatalogueAccess('admin', 'team-a', 'apprentice', 'view');
    expect(viewed.catalogueAccess).toBe('view');

    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'owner' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [{ role: 'worker' }] });
    mockDbQuery.mockResolvedValueOnce({ rows: [memberRow('none')] });
    const hidden = await teamsService.setMemberCatalogueAccess('boss', 'team-a', 'apprentice', 'none');
    expect(hidden.catalogueAccess).toBe('none');
  });
});

describe('recurring catalogue lookup', () => {
  function invoiceRow() {
    return {
      id: 'inv-1',
      user_id: 'apprentice',
      customer_id: 'cust-1',
      invoice_number: 'INV-1',
      include_gst: true,
      notes: null,
      created_at: NOW,
      line_items: [{ description: 'Secret widget', amount: 100 }],
    };
  }

  it('MUST-FAIL: a none member cannot read catalogue prices while making an invoice recurring', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [invoiceRow()] });
    mockActor({ team_id: 'team-a', role: 'worker', catalogue_access: 'none' });
    mockDbQuery.mockResolvedValueOnce({ rows: [secretProduct()] });

    await expect(createRecurringFromInvoice('apprentice', 'inv-1')).rejects.toMatchObject({
      code: 'CATALOGUE_FORBIDDEN',
      statusCode: 403,
    });

    const lookup = mockDbQuery.mock.calls.find((call) =>
      String(call[0]).includes('SELECT id, name, unit_price'),
    );
    expect(lookup).toBeDefined();
    expect((lookup?.[1] as unknown[])[1]).toBe(false);
    expect(mockDbQuery.mock.calls.some((call) => String(call[0]).includes('INSERT INTO products_services'))).toBe(false);
  });

  it('a view member cannot auto-create a catalogue row from an invoice', async () => {
    mockDbQuery.mockResolvedValueOnce({ rows: [invoiceRow()] });
    mockActor({ team_id: 'team-a', role: 'worker', catalogue_access: 'view' });
    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await expect(createRecurringFromInvoice('viewer', 'inv-1')).rejects.toMatchObject({
      code: 'CATALOGUE_FORBIDDEN',
    });
  });
});

describe('products_services route inventory', () => {
  const srcRoot = path.resolve(__dirname, '../..');

  function filesContaining(needle: string): string[] {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;
        const text = fs.readFileSync(full, 'utf8');
        if (text.includes(needle)) hits.push(path.relative(srcRoot, full));
      }
    };
    walk(srcRoot);
    return hits.sort();
  }

  it('lists every API source file that reads products_services', () => {
    expect(filesContaining('products_services')).toEqual([
      'routes/getting-started.ts',
      'services/products.ts',
      'services/recurring-invoices.ts',
    ]);
  });

  it('recurring joins do not select catalogue cost or margin columns', () => {
    const text = fs.readFileSync(path.join(srcRoot, 'services/recurring-invoices.ts'), 'utf8');
    expect(text).not.toMatch(/ps\.unit_cost|ps\.unit_price|ps\.default_margin/);
    expect(text).toContain('ps.name as product_name');
    const invoices = fs.readFileSync(path.join(srcRoot, 'services/invoices.ts'), 'utf8');
    const quotes = fs.readFileSync(path.join(srcRoot, 'services/quotes.ts'), 'utf8');
    const pdf = fs.readFileSync(path.join(srcRoot, 'services/pdf.ts'), 'utf8');
    expect(invoices).not.toContain('products_services');
    expect(quotes).not.toContain('products_services');
    expect(pdf).not.toContain('products_services');
  });
});
