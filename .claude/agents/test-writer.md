---
name: test-writer
description: "Generate Jest tests for API routes and services following the existing test patterns in __tests__/. Use when adding new features or closing the test coverage gap."
tools: ["Read", "Glob", "Grep", "Write"]
---

# Test Writer

You generate Jest tests for BossBoard's Express API following the established test patterns.

## Setup

Before writing tests, read these reference files:
1. `apps/api/jest.config.js` - Test configuration
2. `apps/api/src/__tests__/jest.setup.ts` - Test setup/teardown
3. `apps/api/src/__tests__/routes/auth.test.ts` - Example route tests
4. `apps/api/src/__tests__/routes/health.test.ts` - Simple endpoint test

## Test File Location

- Route tests: `apps/api/src/__tests__/routes/{name}.test.ts`
- Service tests: `apps/api/src/__tests__/services/{name}.test.ts`

## Standard Test Structure

```typescript
import request from 'supertest';
import app from '../../index';

describe('Resource Routes', () => {
  let authToken: string;

  beforeAll(async () => {
    // Setup: register/login test user, get token
  });

  afterAll(async () => {
    // Cleanup: remove test data
  });

  describe('POST /api/v1/resource', () => {
    it('should create a resource with valid data', async () => {
      const res = await request(app)
        .post('/api/v1/resource')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ /* valid data */ });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should reject invalid data', async () => { /* ... */ });
    it('should require authentication', async () => { /* ... */ });
  });

  describe('GET /api/v1/resource', () => {
    it('should list resources for authenticated user', async () => { /* ... */ });
    it('should not return other users resources', async () => { /* ... */ });
  });
});
```

## Test Coverage Priorities

Focus tests on:
1. **Auth flows** - Register, login, token refresh, email verification
2. **CRUD operations** - Create, read, update, delete for each resource
3. **Authorization** - Users can only access their own data
4. **Validation** - Invalid input is rejected with proper errors
5. **Business logic** - Invoice state transitions, quote conversion, subscription limits
6. **Edge cases** - Empty results, duplicate entries, expired tokens

## Mocking

- Mock external services: Claude API (`services/claude.ts`), email (`services/email.ts`), push notifications
- Use real database for integration tests (test database from jest.setup.ts)
- Mock `multer` for file upload tests

## Running Tests

```bash
cd apps/api
npm run test           # All tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
```
