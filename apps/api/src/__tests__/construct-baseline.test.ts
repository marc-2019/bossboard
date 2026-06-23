/**
 * Product Construct Baseline
 *
 * Guardrail: prod-product-basic-construct-baseline
 *
 * The simplest possible "does the product build and boot" check. Importing
 * the server entrypoint exercises the entire module graph — every route,
 * service, middleware and config module is loaded. If any of them throws at
 * import time (bad import path, syntax error, top-level config crash) this
 * test fails before any feature test runs.
 *
 * It then asserts the constructed Express app responds on its liveness probe,
 * proving the middleware + routing stack is wired up. No database or Redis
 * connection is required (auto-start is skipped under NODE_ENV=test).
 */

import request from 'supertest';
import type { Express } from 'express';

describe('Product construct baseline', () => {
  let app: Express;

  it('boots cleanly: the server entrypoint imports without throwing', async () => {
    const mod = await import('../index.js');
    app = mod.default;
    expect(app).toBeDefined();
    // An Express application is a callable request handler.
    expect(typeof app).toBe('function');
  });

  it('responds on the liveness probe (no DB/Redis required)', async () => {
    const response = await request(app).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ alive: true });
    expect(response.body.timestamp).toBeDefined();
  });

  it('serves the marketing landing page on /', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('BossBoard');
  });
});
